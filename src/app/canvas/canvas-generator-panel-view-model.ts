import type { CanvasElement } from '@/components/lovart/canvas-types';

type WorkbenchCanvasImageItem = {
    id: string;
    content: string;
};

export type GeneratorCanvasImageItem = {
    id: string;
    content: string;
    displayName: string;
};

export function buildGeneratorCanvasImages(
    canvasImages: WorkbenchCanvasImageItem[],
    elementById: Map<string, CanvasElement>,
): GeneratorCanvasImageItem[] {
    return canvasImages.map((image) => ({
        id: image.id,
        content: image.content || '',
        displayName: elementById.get(image.id)?.displayName || `图片 ${image.id.slice(0, 4)}`,
    }));
}

export function buildSelectedCanvasImageIds(
    selectedIds: string[],
    elementById: Map<string, CanvasElement>,
): string[] {
    return selectedIds.filter((id) => {
        const element = elementById.get(id);
        return element?.type === 'image' && !!element.content;
    });
}
