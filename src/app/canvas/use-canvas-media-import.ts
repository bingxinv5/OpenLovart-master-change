import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { debugLog } from '@/lib/debug-log';
import { saveImageBlob } from '@/lib/editor-kernel';
import { v4 as uuidv4 } from 'uuid';
import { isEditableShortcutTarget } from './canvas-keyboard-shortcuts';
import { buildCenteredElementBounds } from './canvas-element-ops';
import type { CanvasToastType } from './canvas-feedback';
import {
    IMAGE_IMPORT_CONCURRENCY,
    getCanvasDisplaySize,
    getDefaultImagePresentation,
    mapWithConcurrency,
    readImageDimensions,
} from './canvas-page-utils';
import type { WorkbenchSettings } from '@/lib/workbench-settings';

function isLikelyClipboardImageFile(file: File) {
    if (file.type.startsWith('image/')) return true;
    return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || '');
}

export interface UseCanvasMediaImportParams {
    addElements: (newElements: CanvasElement[]) => void;
    addAndFocusElement: (element: CanvasElement) => void;
    buildVideoElement: (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;
    canvasClipboardPreferredRef: MutableRefObject<boolean>;
    clipboardRef: MutableRefObject<CanvasElement[]>;
    getPlacementPosition: () => { x: number; y: number };
    handlePasteAt: (position: { x: number; y: number }) => void;
    refreshStorageEstimate: () => Promise<unknown> | unknown;
    removeElementsByIds: (ids: string[]) => void;
    setActiveTool: (tool: string) => void;
    setElements: (updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => void;
    setSelectedIds: (ids: string[]) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
    workbenchSettings: WorkbenchSettings;
}

export function useCanvasMediaImport({
    addElements,
    addAndFocusElement,
    buildVideoElement,
    canvasClipboardPreferredRef,
    clipboardRef,
    getPlacementPosition,
    handlePasteAt,
    refreshStorageEstimate,
    removeElementsByIds,
    setActiveTool,
    setElements,
    setSelectedIds,
    showToast,
    workbenchSettings,
}: UseCanvasMediaImportParams) {
    const [transcodingStatus, setTranscodingStatus] = useState<string | null>(null);

    const handleAddImage = useCallback(async (files: File | File[], dropPosition?: { x: number; y: number }) => {
        const fileArray = Array.isArray(files) ? files : [files];
        if (fileArray.length === 0) return;

        const center = dropPosition || getPlacementPosition();
        setActiveTool('select');

        const importedElements: Array<CanvasElement | null> = await mapWithConcurrency(fileArray, IMAGE_IMPORT_CONCURRENCY, async (file, index) => {
            try {
                const { width: naturalWidth, height: naturalHeight } = await readImageDimensions(file);
                const { width, height } = getCanvasDisplaySize(naturalWidth, naturalHeight);
                const content = await saveImageBlob(file);
                if (!content) return null;

                return {
                    id: uuidv4(),
                    type: 'image',
                    x: center.x - width / 2 + index * 40,
                    y: center.y - height / 2 + index * 40,
                    width,
                    height,
                    content,
                    ...getDefaultImagePresentation(workbenchSettings),
                } satisfies CanvasElement;
            } catch (error) {
                console.warn('[Canvas] Failed to import image:', file.name, error);
                return null;
            }
        });

        const newElements = importedElements.filter((element): element is CanvasElement => element !== null);
        if (newElements.length > 0) {
            addElements(newElements);
            setSelectedIds(newElements.map((element) => element.id));
            void refreshStorageEstimate();
        }

        if (newElements.length !== fileArray.length) {
            showToast(`成功导入 ${newElements.length}/${fileArray.length} 张图片`, newElements.length > 0 ? 'info' : 'error');
        }
    }, [addElements, getPlacementPosition, refreshStorageEstimate, setActiveTool, setSelectedIds, showToast, workbenchSettings]);

    useEffect(() => {
        const handleWindowPaste = (event: ClipboardEvent) => {
            if (isEditableShortcutTarget(event.target, document.activeElement)) {
                return;
            }

            const clipboardData = event.clipboardData;
            if (!clipboardData) {
                return;
            }

            const itemFiles = Array.from(clipboardData.items ?? [])
                .filter((item) => item.kind === 'file')
                .map((item) => item.getAsFile())
                .filter((file): file is File => !!file && isLikelyClipboardImageFile(file));
            const fallbackFiles = Array.from(clipboardData.files ?? []).filter(isLikelyClipboardImageFile);
            const imageFiles = itemFiles.length > 0 ? itemFiles : fallbackFiles;

            if (canvasClipboardPreferredRef.current && clipboardRef.current.length > 0) {
                event.preventDefault();
                handlePasteAt(getPlacementPosition());
                return;
            }

            if (imageFiles.length > 0) {
                event.preventDefault();
                canvasClipboardPreferredRef.current = false;
                void handleAddImage(imageFiles);
                return;
            }

            if (clipboardRef.current.length > 0) {
                event.preventDefault();
                handlePasteAt(getPlacementPosition());
            }
        };

        window.addEventListener('paste', handleWindowPaste);
        return () => window.removeEventListener('paste', handleWindowPaste);
    }, [canvasClipboardPreferredRef, clipboardRef, getPlacementPosition, handleAddImage, handlePasteAt]);

    const handleAddVideo = useCallback(async (file: File, dropPosition?: { x: number; y: number }) => {
        const center = dropPosition || getPlacementPosition();
        const elementId = uuidv4();

        const needsTranscode = await new Promise<boolean>((resolve) => {
            const testVideo = document.createElement('video');
            testVideo.muted = true;
            testVideo.playsInline = true;
            testVideo.preload = 'auto';
            const testUrl = URL.createObjectURL(file);
            testVideo.src = testUrl;

            const cleanup = () => { URL.revokeObjectURL(testUrl); testVideo.remove(); };
            const timer = setTimeout(() => { cleanup(); resolve(true); }, 3000);

            testVideo.onloadedmetadata = () => {
                if (testVideo.videoWidth === 0 || testVideo.videoHeight === 0) {
                    clearTimeout(timer); cleanup(); resolve(true);
                } else {
                    testVideo.currentTime = 0.1;
                }
            };
            testVideo.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = testVideo.videoWidth;
                    canvas.height = testVideo.videoHeight;
                    const context = canvas.getContext('2d')!;
                    context.drawImage(testVideo, 0, 0);
                    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
                    let nonBlack = 0;
                    for (let index = 0; index < data.length; index += 16) {
                        if (data[index] > 5 || data[index + 1] > 5 || data[index + 2] > 5) nonBlack++;
                    }
                    clearTimeout(timer); cleanup();
                    resolve(nonBlack < (canvas.width * canvas.height / 4) * 0.01);
                } catch { clearTimeout(timer); cleanup(); resolve(true); }
            };
            testVideo.onerror = () => { clearTimeout(timer); cleanup(); resolve(true); };
        });

        if (!needsTranscode) {
            const blobUrl = URL.createObjectURL(file);
            const newElement: CanvasElement = {
                ...buildVideoElement({
                    ...buildCenteredElementBounds(center, 400, 300),
                    content: blobUrl,
                }),
                id: elementId,
            };
            addAndFocusElement(newElement);
            return;
        }

        debugLog('[video] Format not supported by browser, transcoding...');
        setTranscodingStatus(`正在转码视频 "${file.name}"...`);

        const placeholderElement: CanvasElement = {
            ...buildVideoElement({
                ...buildCenteredElementBounds(center, 400, 300),
                content: '',
            }),
            id: elementId,
        };
        addAndFocusElement(placeholderElement);

        try {
            const formData = new FormData();
            formData.append('video', file);

            const response = await fetch('/api/transcode-video', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `转码失败: ${response.status}`);
            }

            const mp4Blob = await response.blob();
            const blobUrl = URL.createObjectURL(mp4Blob);

            setElements((prev) => prev.map((element) =>
                element.id === elementId ? { ...element, content: blobUrl } : element,
            ));
            setTranscodingStatus(null);
            debugLog('[video] Transcode complete');
        } catch (error: unknown) {
            console.error('[video] Transcode failed:', error);
            setTranscodingStatus(null);
            removeElementsByIds([elementId]);
            const message = error instanceof Error ? error.message : '未知错误';
            alert(`视频转码失败: ${message}\n\n请尝试用 H.264 编码的 MP4 文件。`);
        }
    }, [addAndFocusElement, buildVideoElement, getPlacementPosition, removeElementsByIds, setElements]);

    return {
        handleAddImage,
        handleAddVideo,
        transcodingStatus,
    };
}