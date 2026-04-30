import type { CanvasElement } from '@/components/lovart/canvas-types';
import { isCanvasElementOfType } from '@/components/lovart/canvas-types';

export type AiCanvasPlanAction =
    | {
        type: 'create-image-generator';
        prompt?: string;
        title?: string;
        useSelectionAsReferences?: boolean;
    }
    | {
        type: 'create-video-generator';
        prompt?: string;
        title?: string;
        useSelectionAsReferences?: boolean;
    }
    | {
        type: 'create-text-note';
        text: string;
    }
    | {
        type: 'frame-selection';
    }
    | {
        type: 'save-selection-as-reference';
    };

function isAiCanvasPlanRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAiCanvasPlanString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readAiCanvasPlanBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

export function parseAiCanvasPlanActions(input: unknown): AiCanvasPlanAction[] {
    if (!isAiCanvasPlanRecord(input) || !Array.isArray(input.canvasActions)) {
        return [];
    }

    const actions: AiCanvasPlanAction[] = [];
    for (const rawAction of input.canvasActions) {
        if (!isAiCanvasPlanRecord(rawAction)) {
            continue;
        }

        const type = readAiCanvasPlanString(rawAction.type);
        switch (type) {
            case 'create-image-generator':
                actions.push({
                    type,
                    prompt: readAiCanvasPlanString(rawAction.prompt),
                    title: readAiCanvasPlanString(rawAction.title),
                    useSelectionAsReferences: readAiCanvasPlanBoolean(rawAction.useSelectionAsReferences),
                });
                break;
            case 'create-video-generator':
                actions.push({
                    type,
                    prompt: readAiCanvasPlanString(rawAction.prompt),
                    title: readAiCanvasPlanString(rawAction.title),
                    useSelectionAsReferences: readAiCanvasPlanBoolean(rawAction.useSelectionAsReferences),
                });
                break;
            case 'create-text-note': {
                const text = readAiCanvasPlanString(rawAction.text);
                if (!text) {
                    break;
                }
                actions.push({ type, text });
                break;
            }
            case 'frame-selection':
                actions.push({ type });
                break;
            case 'save-selection-as-reference':
                actions.push({ type });
                break;
            default:
                break;
        }
    }

    return actions;
}

export function buildAiCanvasSelectionSummary(elements: CanvasElement[], selectedIds: string[]) {
    const selectedElements = elements.filter((element) => selectedIds.includes(element.id));
    if (selectedElements.length === 0) {
        return '当前没有选中任何元素。';
    }

    const typeLabelMap: Partial<Record<CanvasElement['type'], string>> = {
        image: '图片',
        text: '文本',
        shape: '形状',
        path: '路径',
        'image-generator': '图像生成器',
        'video-generator': '视频生成器',
        'storyboard-planner': '分镜规划器',
        video: '视频',
        connector: '连接线',
        mark: '标记',
        frame: '画板',
    };
    const typeCounts = new Map<string, number>();
    selectedElements.forEach((element) => {
        const label = typeLabelMap[element.type] || element.type;
        typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
    });

    const summary = Array.from(typeCounts.entries())
        .map(([type, count]) => `${type} ${count} 个`)
        .join('，');
    const selectedNames = selectedElements
        .map((element) => element.displayName || element.savedPrompt || `${typeLabelMap[element.type] || element.type}#${element.id.slice(0, 4)}`)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 3)
        .map((value) => value.trim());
    const canFrameSelection = selectedElements.filter((element) => element.type !== 'connector').length >= 2;
    const canSaveAsReference = selectedElements.some((element) => isCanvasElementOfType(element, 'image') && !!element.content);

    return [
        `当前选中 ${selectedElements.length} 个元素：${summary}。`,
        selectedNames.length > 0 ? `示例名称：${selectedNames.join('、')}。` : '',
        `可创建编组：${canFrameSelection ? '是' : '否'}。`,
        `可加入项目参考库：${canSaveAsReference ? '是' : '否'}。`,
    ].filter(Boolean).join(' ');
}