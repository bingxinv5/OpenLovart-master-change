export type CanvasSelectMode = 'image' | 'video';
export type VideoCanvasImageType = 'first_frame' | 'last_frame' | 'reference';

export const AI_CHAT_PICK_SOURCE = '__ai-chat__';

export type ParsedCanvasSelectSource =
    | { kind: 'ai-chat' }
    | {
        kind: 'generator';
        generatorId: string;
        imageType?: VideoCanvasImageType;
    };

export function createCanvasSelectSource(
    generatorId: string,
    imageType?: VideoCanvasImageType,
): string {
    const normalizedGeneratorId = `${generatorId ?? ''}`.trim();
    return imageType ? `${normalizedGeneratorId}::${imageType}` : normalizedGeneratorId;
}

export function parseCanvasSelectSource(source: unknown): ParsedCanvasSelectSource | null {
    if (typeof source !== 'string') {
        return null;
    }

    const normalizedSource = source.trim();
    if (!normalizedSource) {
        return null;
    }

    if (normalizedSource === AI_CHAT_PICK_SOURCE) {
        return { kind: 'ai-chat' };
    }

    const [generatorId, imageType] = normalizedSource.split('::');
    if (!generatorId) {
        return null;
    }

    return {
        kind: 'generator',
        generatorId,
        imageType: imageType as VideoCanvasImageType | undefined,
    };
}

export function dispatchCanvasImageSelected(
    generatorId: string,
    imageContent: string,
    imageType?: VideoCanvasImageType,
): void {
    window.dispatchEvent(new CustomEvent('canvas-image-selected', {
        detail: {
            generatorId,
            imageContent,
            imageType,
        },
    }));
}

export function dispatchCanvasImagePickedForChat(imageContent: string): void {
    window.dispatchEvent(new CustomEvent('canvas-image-picked-for-chat', {
        detail: { imageContent },
    }));
}