import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { CanvasToastType } from './canvas-feedback';
import { buildCenteredElementBounds } from './canvas-element-ops';
import {
    resolveProjectMediaImageInsertContent as resolveBackflowMediaImageInsertContent,
    resolveProjectReferenceImageInsertContent as resolveBackflowReferenceImageInsertContent,
    saveProjectReferenceFromMediaItem as saveBackflowProjectReferenceFromMediaItem,
} from './canvas-project-backflow';
import { pollGenerationTask } from './generation-polling';
import {
    clearProjectMediaHistory,
    type ProjectMediaHistoryItem,
} from '@/lib/project-media-history';
import {
    clearProjectReferenceLibrary,
    removeProjectReferenceImage,
    touchProjectReferenceImage,
    type ProjectReferenceImageItem,
} from '@/lib/project-reference-library';

type CanvasImageBuilder = (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;
type CanvasVideoBuilder = (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;

interface UseCanvasProjectBackflowActionsOptions {
    currentProjectIdRef: MutableRefObject<string | null>;
    normalizeGeneratedImageContent: (content: string, source: string) => Promise<string>;
    getPlacementPosition: () => { x: number; y: number };
    buildImageElement: CanvasImageBuilder;
    buildVideoElement: CanvasVideoBuilder;
    addGeneratedImageElementToCanvas: (
        element: CanvasElement,
        options?: { selectAfterAdd?: boolean; recordMediaHistory?: boolean },
    ) => Promise<CanvasElement>;
    addAndSelectElement: (element: CanvasElement) => void;
    addElement: (element: CanvasElement) => void;
    setSelectedIds: (ids: string[]) => void;
    focusCanvasElement: (elementId: string) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasProjectBackflowActions({
    currentProjectIdRef,
    normalizeGeneratedImageContent,
    getPlacementPosition,
    buildImageElement,
    buildVideoElement,
    addGeneratedImageElementToCanvas,
    addAndSelectElement,
    addElement,
    setSelectedIds,
    focusCanvasElement,
    showToast,
}: UseCanvasProjectBackflowActionsOptions) {
    const resolveProjectMediaImageInsertContent = useCallback(async (item: ProjectMediaHistoryItem) => {
        return resolveBackflowMediaImageInsertContent(item, {
            projectId: currentProjectIdRef.current,
            normalizeImageContent: normalizeGeneratedImageContent,
            pollImageGenerationTask: pollGenerationTask,
        });
    }, [currentProjectIdRef, normalizeGeneratedImageContent]);

    const resolveProjectReferenceImageInsertContent = useCallback(async (item: ProjectReferenceImageItem) => {
        return resolveBackflowReferenceImageInsertContent(item, {
            projectId: currentProjectIdRef.current,
            normalizeImageContent: normalizeGeneratedImageContent,
            pollImageGenerationTask: pollGenerationTask,
        });
    }, [currentProjectIdRef, normalizeGeneratedImageContent]);

    const handleClearProjectMediaHistory = useCallback(() => {
        if (!currentProjectIdRef.current) return;
        clearProjectMediaHistory(currentProjectIdRef.current);
        showToast('已清空当前项目媒体历史', 'info');
    }, [currentProjectIdRef, showToast]);

    const saveProjectReferenceFromMediaItem = useCallback((item: ProjectMediaHistoryItem) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId || item.kind !== 'image') {
            return;
        }

        void (async () => {
            const saved = await saveBackflowProjectReferenceFromMediaItem(item, {
                projectId,
                normalizeImageContent: normalizeGeneratedImageContent,
                pollImageGenerationTask: pollGenerationTask,
            });
            if (saved) {
                showToast('已加入项目参考库', 'success');
            }
        })().catch((error) => {
            console.error('Save project reference from media failed:', error);
            showToast(`加入参考库失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        });
    }, [currentProjectIdRef, normalizeGeneratedImageContent, showToast]);

    const handleLocateProjectMediaSource = useCallback((item: ProjectMediaHistoryItem) => {
        if (item.sourceElementId) {
            focusCanvasElement(item.sourceElementId);
        }
    }, [focusCanvasElement]);

    const handleInsertProjectMediaItem = useCallback((item: ProjectMediaHistoryItem) => {
        if (item.kind === 'audio') {
            void navigator.clipboard.writeText(item.content).then(() => {
                showToast('已复制音频素材地址，可在视频生成器中作为参考音频使用', 'success');
            }).catch(() => {
                showToast('音频素材仅可在视频生成器中作为参考音频使用', 'info');
            });
            return;
        }

        const center = getPlacementPosition();
        if (item.kind === 'image') {
            void (async () => {
                const resolvedContent = await resolveProjectMediaImageInsertContent(item);
                const newElement = buildImageElement({
                    ...buildCenteredElementBounds(center, 400, 300),
                    content: resolvedContent,
                    savedPrompt: item.prompt,
                    selectedModel: item.model,
                    selectedAspectRatio: item.aspectRatio,
                    selectedImageSize: item.imageSize,
                    sourceGenerationTaskId: item.taskId,
                    sourceGenerationTaskType: item.taskId ? 'image' : undefined,
                });
                await addGeneratedImageElementToCanvas(newElement, {
                    selectAfterAdd: true,
                });
                showToast('已将项目图片回流到画布', 'success');
            })().catch((error) => {
                console.error('Reinsert project image failed:', error);
                showToast(`项目图片回流失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
            });
            return;
        }

        const newElement = buildVideoElement({
            ...buildCenteredElementBounds(center, 400, 300),
            content: item.content,
            savedPrompt: item.prompt,
            selectedModel: item.model,
            selectedAspectRatio: item.aspectRatio,
            selectedDuration: item.duration,
            sourceGenerationTaskId: item.taskId,
            sourceGenerationTaskType: item.taskId ? 'video' : undefined,
        });
        addAndSelectElement(newElement);
        showToast('已将项目视频回流到画布', 'success');
    }, [addAndSelectElement, addGeneratedImageElementToCanvas, buildImageElement, buildVideoElement, getPlacementPosition, resolveProjectMediaImageInsertContent, showToast]);

    const handleClearProjectReferences = useCallback(() => {
        if (!currentProjectIdRef.current) return;
        clearProjectReferenceLibrary(currentProjectIdRef.current);
        showToast('已清空当前项目参考库', 'info');
    }, [currentProjectIdRef, showToast]);

    const handleDeleteProjectReferenceItem = useCallback((item: ProjectReferenceImageItem) => {
        if (!currentProjectIdRef.current) return;
        removeProjectReferenceImage(currentProjectIdRef.current, item.id);
        showToast('已从项目参考库移除', 'info');
    }, [currentProjectIdRef, showToast]);

    const handleDeleteProjectReferenceItems = useCallback((items: ProjectReferenceImageItem[]) => {
        if (!currentProjectIdRef.current || items.length === 0) return;
        items.forEach((item) => removeProjectReferenceImage(currentProjectIdRef.current!, item.id));
        showToast(`已批量移出 ${items.length} 张项目参考图`, 'info');
    }, [currentProjectIdRef, showToast]);

    const handleLocateProjectReferenceSource = useCallback((item: ProjectReferenceImageItem) => {
        if (item.sourceElementId) {
            focusCanvasElement(item.sourceElementId);
        }
    }, [focusCanvasElement]);

    const handleInsertProjectReferenceItem = useCallback((item: ProjectReferenceImageItem) => {
        const center = getPlacementPosition();
        void (async () => {
            const resolvedContent = await resolveProjectReferenceImageInsertContent(item);
            const newElement = buildImageElement({
                ...buildCenteredElementBounds(center, 400, 300),
                content: resolvedContent,
                displayName: item.label,
                savedPrompt: item.prompt,
            });
            await addGeneratedImageElementToCanvas(newElement, {
                selectAfterAdd: true,
            });
            touchProjectReferenceImage(currentProjectIdRef.current!, item.id);
            showToast('已将项目参考图回流到画布', 'success');
        })().catch((error) => {
            console.error('Reinsert project reference failed:', error);
            showToast(`项目参考图回流失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        });
    }, [addGeneratedImageElementToCanvas, buildImageElement, currentProjectIdRef, getPlacementPosition, resolveProjectReferenceImageInsertContent, showToast]);

    const handleInsertProjectReferenceItems = useCallback((items: ProjectReferenceImageItem[]) => {
        if (items.length === 0) return;
        const center = getPlacementPosition();
        const gapX = 36;
        const gapY = 28;
        void (async () => {
            const newElements = await Promise.all(items.map(async (item, index) => buildImageElement({
                ...buildCenteredElementBounds({ x: center.x + (index * gapX), y: center.y + (index * gapY) }, 400, 300),
                content: await resolveProjectReferenceImageInsertContent(item),
                displayName: item.label,
                savedPrompt: item.prompt,
            })));
            newElements.forEach((element) => addElement(element));
            setSelectedIds(newElements.map((element) => element.id));
            items.forEach((item) => touchProjectReferenceImage(currentProjectIdRef.current!, item.id));
            showToast(`已批量回流 ${items.length} 张项目参考图`, 'success');
        })().catch((error) => {
            console.error('Batch reinsert project references failed:', error);
            showToast(`批量回流项目参考图失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        });
    }, [addElement, buildImageElement, currentProjectIdRef, getPlacementPosition, resolveProjectReferenceImageInsertContent, setSelectedIds, showToast]);

    return {
        handleClearProjectMediaHistory,
        handleClearProjectReferences,
        handleDeleteProjectReferenceItem,
        handleDeleteProjectReferenceItems,
        handleInsertProjectMediaItem,
        handleInsertProjectReferenceItem,
        handleInsertProjectReferenceItems,
        handleLocateProjectMediaSource,
        handleLocateProjectReferenceSource,
        saveProjectReferenceFromMediaItem,
    };
}