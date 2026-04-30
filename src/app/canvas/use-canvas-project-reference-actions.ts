import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { CanvasToastType } from './canvas-feedback';
import {
    readProjectReferenceLibrary,
    saveProjectReferenceImage,
    touchProjectReferenceImage,
} from '@/lib/project-reference-library';

interface UseCanvasProjectReferenceActionsOptions {
    currentProjectIdRef: MutableRefObject<string | null>;
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasProjectReferenceActions({
    currentProjectIdRef,
    elementsMapRef,
    showToast,
}: UseCanvasProjectReferenceActionsOptions) {
    const saveProjectReferenceFromElement = useCallback((element: CanvasElement) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId || element.type !== 'image' || !element.content) {
            return;
        }

        saveProjectReferenceImage({
            projectId,
            image: element.content,
            label: element.displayName || element.savedPrompt,
            prompt: element.savedPrompt,
            sourceElementId: element.id,
        });
        showToast('当前图片已加入项目参考库', 'success');
    }, [currentProjectIdRef, showToast]);

    const saveProjectReferenceFromSelection = useCallback((ids: string[]) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId) {
            return;
        }

        const existingImages = new Set(
            readProjectReferenceLibrary(projectId).map((item) => item.image),
        );
        let processed = 0;
        let added = 0;

        ids.forEach((id) => {
            const element = elementsMapRef.current.get(id);
            if (!element || element.type !== 'image' || !element.content) {
                return;
            }

            processed += 1;
            if (!existingImages.has(element.content)) {
                added += 1;
                existingImages.add(element.content);
            }

            saveProjectReferenceImage({
                projectId,
                image: element.content,
                label: element.displayName || element.savedPrompt,
                prompt: element.savedPrompt,
                sourceElementId: element.id,
            });
        });

        if (processed === 0) {
            showToast('所选内容里没有可加入参考库的图片', 'info');
            return;
        }

        showToast(
            added === processed
                ? `已批量加入 ${processed} 张项目参考图`
                : `已处理 ${processed} 张图片，新增 ${added} 张到项目参考库`,
            'success',
        );
    }, [currentProjectIdRef, elementsMapRef, showToast]);

    const handleUseProjectReferenceImage = useCallback((id: string) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId) {
            return;
        }
        touchProjectReferenceImage(projectId, id);
    }, [currentProjectIdRef]);

    return {
        handleUseProjectReferenceImage,
        saveProjectReferenceFromElement,
        saveProjectReferenceFromSelection,
    };
}