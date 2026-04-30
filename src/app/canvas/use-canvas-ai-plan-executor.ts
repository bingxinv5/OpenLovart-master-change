import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MutableRefObject } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { PatchMetadata } from '@/lib/editor-kernel';
import { parseAiCanvasPlanActions } from './ai-canvas-plan';
import { buildCenteredElementBounds } from './canvas-element-ops';

type CanvasGeneratorBuilder = (
    type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
) => CanvasElement;

interface UseCanvasAiPlanExecutorOptions {
    selectedIdsRef: MutableRefObject<string[]>;
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    currentProjectIdRef: MutableRefObject<string | null>;
    getPlacementPosition: () => { x: number; y: number };
    buildGeneratorElement: CanvasGeneratorBuilder;
    addAndSelectElement: (element: CanvasElement) => void;
    handleGroupSelection: (ids: string[]) => void;
    runHistoryTransaction: (metadata: PatchMetadata, action: () => PatchMetadata | void) => void;
    saveProjectReferenceFromSelection: (ids: string[]) => void;
}

export function useCanvasAiPlanExecutor({
    selectedIdsRef,
    elementsMapRef,
    currentProjectIdRef,
    getPlacementPosition,
    buildGeneratorElement,
    addAndSelectElement,
    handleGroupSelection,
    runHistoryTransaction,
    saveProjectReferenceFromSelection,
}: UseCanvasAiPlanExecutorOptions) {
    return useCallback(async (rawPlan: unknown) => {
        const actions = parseAiCanvasPlanActions(rawPlan);
        if (actions.length === 0) {
            return { summary: '未检测到可执行的画布动作。' };
        }

        const initialSelectedIds = [...selectedIdsRef.current];
        const initialSelectedElements = initialSelectedIds
            .map((id) => elementsMapRef.current.get(id))
            .filter((element): element is CanvasElement => !!element);
        const selectionImageContents = Array.from(new Set(
            initialSelectedElements
                .filter((element) => element.type === 'image' && !!element.content)
                .map((element) => element.content as string),
        ));
        const groupableSelectionCount = initialSelectedElements.filter((element) => element.type !== 'connector').length;

        const basePlacement = (() => {
            if (initialSelectedElements.length === 0) {
                return getPlacementPosition();
            }

            const minX = Math.min(...initialSelectedElements.map((element) => element.x));
            const maxX = Math.max(...initialSelectedElements.map((element) => element.x + (element.width || 0)));
            const maxY = Math.max(...initialSelectedElements.map((element) => element.y + (element.height || 0)));
            return {
                x: Math.round((minX + maxX) / 2),
                y: Math.round(maxY + 120),
            };
        })();

        let placementOffsetIndex = 0;
        const nextPlacementCenter = () => {
            const offsetIndex = placementOffsetIndex;
            placementOffsetIndex += 1;
            return {
                x: basePlacement.x + offsetIndex * 32,
                y: basePlacement.y + offsetIndex * 40,
            };
        };

        const executed: string[] = [];
        const skipped: string[] = [];

        for (const action of actions) {
            switch (action.type) {
                case 'create-image-generator': {
                    const center = nextPlacementCenter();
                    const imageGenerator = buildGeneratorElement('image-generator', {
                        ...buildCenteredElementBounds(center, 400, 400),
                        displayName: action.title,
                        savedPrompt: action.prompt,
                        savedReferenceImages: action.useSelectionAsReferences && selectionImageContents.length > 0
                            ? JSON.stringify(selectionImageContents)
                            : undefined,
                    });

                    runHistoryTransaction({ label: 'AI 创建图像生成器', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(imageGenerator);
                        return { selectionAfter: [imageGenerator.id] };
                    });

                    executed.push(action.useSelectionAsReferences && selectionImageContents.length > 0
                        ? '创建图像生成器并绑定当前选中图片'
                        : '创建图像生成器');
                    break;
                }
                case 'create-video-generator': {
                    const center = nextPlacementCenter();
                    const selectedFrameImages = action.useSelectionAsReferences && selectionImageContents.length > 0
                        ? JSON.stringify(selectionImageContents.slice(0, 2))
                        : undefined;
                    const videoGenerator = buildGeneratorElement('video-generator', {
                        ...buildCenteredElementBounds(center, 400, 300),
                        displayName: action.title,
                        savedPrompt: action.prompt,
                        savedFrameImages: selectedFrameImages,
                    });

                    runHistoryTransaction({ label: 'AI 创建视频生成器', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(videoGenerator);
                        return { selectionAfter: [videoGenerator.id] };
                    });

                    executed.push(selectedFrameImages
                        ? '创建视频生成器并绑定当前选中图片'
                        : '创建视频生成器');
                    break;
                }
                case 'create-text-note': {
                    const center = nextPlacementCenter();
                    const textNote: CanvasElement = {
                        id: uuidv4(),
                        type: 'text',
                        x: center.x - 120,
                        y: center.y - 24,
                        content: action.text,
                    };

                    runHistoryTransaction({ label: 'AI 创建文本说明', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(textNote);
                        return { selectionAfter: [textNote.id] };
                    });

                    executed.push('创建文本说明');
                    break;
                }
                case 'frame-selection': {
                    if (groupableSelectionCount < 2) {
                        skipped.push('当前选区不足两个元素，无法创建编组');
                        break;
                    }

                    handleGroupSelection(initialSelectedIds);
                    executed.push('将当前选区编组为画板');
                    break;
                }
                case 'save-selection-as-reference': {
                    if (!currentProjectIdRef.current) {
                        skipped.push('当前项目尚未保存，无法写入项目参考库');
                        break;
                    }

                    if (selectionImageContents.length === 0) {
                        skipped.push('当前选区没有可加入参考库的图片');
                        break;
                    }

                    saveProjectReferenceFromSelection(initialSelectedIds);
                    executed.push('将当前选中图片加入项目参考库');
                    break;
                }
            }
        }

        if (executed.length === 0 && skipped.length === 0) {
            return { summary: '未执行任何画布动作。' };
        }

        const summaryParts: string[] = [];
        if (executed.length > 0) {
            summaryParts.push(`已执行 ${executed.length} 项画布操作：${executed.join('、')}。`);
        }
        if (skipped.length > 0) {
            summaryParts.push(`未执行：${skipped.join('；')}。`);
        }

        return { summary: summaryParts.join('\n') };
    }, [addAndSelectElement, buildGeneratorElement, currentProjectIdRef, elementsMapRef, getPlacementPosition, handleGroupSelection, runHistoryTransaction, saveProjectReferenceFromSelection, selectedIdsRef]);
}