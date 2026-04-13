import { useCallback, useRef, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { getImageDataUrl, isImageRef } from '@/lib/editor-kernel';
import { AI_CHAT_PICK_SOURCE, createCanvasSelectSource, dispatchCanvasImagePickedForChat, dispatchCanvasImageSelected, parseCanvasSelectSource, type CanvasSelectMode, type VideoCanvasImageType } from './canvas-selection';
import type { CanvasToastType } from './canvas-feedback';

interface UseCanvasSelectionBridgeOptions {
    elements: CanvasElement[];
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    openChat: () => void;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasSelectionBridge({
    elements,
    selectedIds,
    setSelectedIds,
    openChat,
    showToast,
}: UseCanvasSelectionBridgeOptions) {
    const [canvasSelectMode, setCanvasSelectMode] = useState<CanvasSelectMode | null>(null);
    const canvasSelectSourceRef = useRef<string | null>(null);

    const handleRequestCanvasSelectImage = useCallback((overrideGeneratorId?: string) => {
        const generatorId = overrideGeneratorId || selectedIds[0];
        if (!generatorId) return;
        canvasSelectSourceRef.current = createCanvasSelectSource(generatorId);
        setCanvasSelectMode('image');
    }, [selectedIds]);

    const handleRequestCanvasSelectVideo = useCallback((imageType: VideoCanvasImageType) => {
        const generatorId = selectedIds[0];
        if (!generatorId) return;
        setCanvasSelectMode('video');
        canvasSelectSourceRef.current = createCanvasSelectSource(generatorId, imageType);
    }, [selectedIds]);

    const handleCanvasSelectPick = useCallback((element: CanvasElement) => {
        if (!element.content) return;
        const pickedContent = element.content;
        const sourceInfo = parseCanvasSelectSource(canvasSelectSourceRef.current);
        setCanvasSelectMode(null);
        canvasSelectSourceRef.current = null;

        if (!sourceInfo) return;

        if (sourceInfo.kind === 'ai-chat') {
            window.setTimeout(() => {
                dispatchCanvasImagePickedForChat(pickedContent);
            }, 50);
            return;
        }

        setSelectedIds([sourceInfo.generatorId]);
        window.setTimeout(() => {
            dispatchCanvasImageSelected(
                sourceInfo.generatorId,
                pickedContent,
                sourceInfo.imageType,
            );
        }, 50);
    }, [setSelectedIds]);

    const handleCancelCanvasSelect = useCallback(() => {
        const sourceInfo = parseCanvasSelectSource(canvasSelectSourceRef.current);
        setCanvasSelectMode(null);
        canvasSelectSourceRef.current = null;
        if (sourceInfo?.kind === 'generator') {
            setSelectedIds([sourceInfo.generatorId]);
        }
    }, [setSelectedIds]);

    const handlePickFromCanvasForChat = useCallback(() => {
        canvasSelectSourceRef.current = AI_CHAT_PICK_SOURCE;
        setCanvasSelectMode('image');
    }, []);

    const handleSendSelectionToChat = useCallback(async (ids: string[]) => {
        const imageElements = elements.filter((element) => ids.includes(element.id) && element.type === 'image' && !!element.content).slice(0, 4);
        if (imageElements.length === 0) {
            showToast('当前选择中没有可发送到对话的图片', 'info');
            return;
        }

        openChat();

        const contents = await Promise.all(imageElements.map(async (element) => {
            if (!element.content) return null;
            if (isImageRef(element.content)) {
                return await getImageDataUrl(element.content) || element.content;
            }
            return element.content;
        }));

        window.setTimeout(() => {
            contents.filter((content): content is string => !!content).forEach((content) => {
                dispatchCanvasImagePickedForChat(content);
            });
        }, 80);

        showToast(`已发送 ${imageElements.length} 张图片到对话`, 'success');
    }, [elements, openChat, showToast]);

    return {
        canvasSelectMode,
        handleCancelCanvasSelect,
        handleCanvasSelectPick,
        handlePickFromCanvasForChat,
        handleRequestCanvasSelectImage,
        handleRequestCanvasSelectVideo,
        handleSendSelectionToChat,
    };
}
