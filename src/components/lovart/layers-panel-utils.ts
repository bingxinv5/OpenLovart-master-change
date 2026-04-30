import {
    Frame,
    Image as ImageIcon,
    Pencil,
    Shapes,
    Sparkles,
    Square,
    Type,
    Video,
    type LucideIcon,
} from 'lucide-react';
import type { CanvasElement } from './canvas-types';

export type StoryboardDraftValue = {
    storyboardShotCode: string;
    storyboardSceneType: string;
    storyboardCameraMove: string;
    storyboardDuration: string;
    storyboardNote: string;
};

export type StoryboardDraftKey = keyof StoryboardDraftValue;

export function validateStoryboardPrefix(value?: string) {
    const rawValue = value?.trim();
    if (!rawValue) return null;
    if (!/^[A-Z\-]+$/i.test(rawValue)) {
        return '前缀建议只使用字母或连字符，例如 A、SC、SHOT-。';
    }
    return null;
}

export function getLayerIcon(element: CanvasElement): LucideIcon {
    switch (element.type) {
        case 'image':
            return ImageIcon;
        case 'text':
            return Type;
        case 'shape':
            return Shapes;
        case 'path':
            return Pencil;
        case 'video':
            return Video;
        case 'image-generator':
        case 'video-generator':
            return Sparkles;
        case 'frame':
            return Frame;
        default:
            return Square;
    }
}

export function isElementLocked(element: CanvasElement) {
    return !!(element.locked || (element.type === 'frame' && element.frameLocked));
}

export function getStoryboardSummaryParts(element: CanvasElement) {
    return [
        element.storyboardShotCode?.trim(),
        element.storyboardSceneType?.trim(),
        element.storyboardCameraMove?.trim(),
        element.storyboardDuration?.trim(),
    ].filter(Boolean) as string[];
}

export function getInitialStoryboardDraft(element: CanvasElement): StoryboardDraftValue {
    return {
        storyboardShotCode: element.storyboardShotCode || '',
        storyboardSceneType: element.storyboardSceneType || '',
        storyboardCameraMove: element.storyboardCameraMove || '',
        storyboardDuration: element.storyboardDuration || '',
        storyboardNote: element.storyboardNote || '',
    };
}