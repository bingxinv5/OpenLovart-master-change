import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';

export function buildImageMetaChips(element: CanvasElement) {
    const chips: string[] = [];
    if (element.selectedModel?.trim()) {
        const raw = element.selectedModel.trim();
        const short = raw.length > 16 ? raw.replace(/^.*?([a-z0-9]+-[a-z0-9-]+)$/i, '$1').replace(/^models[/-]/, '') : raw;
        chips.push(short.length > 20 ? short.slice(0, 18) + '…' : short);
    }
    if (element.selectedAspectRatio?.trim()) chips.push(element.selectedAspectRatio.trim());
    if (element.selectedImageSize?.trim()) chips.push(element.selectedImageSize.trim());
    if (element.selectedImageQuality?.trim() && element.selectedImageQuality.trim() !== 'auto') chips.push(`质量 ${element.selectedImageQuality.trim()}`);
    return chips.slice(0, 4);
}

export function buildStoryboardMetaChips(element: CanvasElement) {
    const chips: string[] = [];
    if (element.storyboardShotCode?.trim()) chips.push(element.storyboardShotCode.trim());
    if (element.storyboardSceneType?.trim()) chips.push(element.storyboardSceneType.trim());
    if (element.storyboardCameraMove?.trim()) chips.push(element.storyboardCameraMove.trim());
    if (element.storyboardDuration?.trim()) chips.push(element.storyboardDuration.trim());
    return chips.slice(0, 4);
}

export function getStoryboardStatus(element: CanvasElement) {
    const shotCode = element.storyboardShotCode?.trim();
    const sceneType = element.storyboardSceneType?.trim();
    const duration = element.storyboardDuration?.trim();
    const note = element.storyboardNote?.trim();
    const cameraMove = element.storyboardCameraMove?.trim();
    const hasAny = !!(shotCode || sceneType || duration || note || cameraMove);
    const shotCodeError = validateStoryboardShotCode(shotCode);
    const durationError = validateStoryboardDuration(duration);
    const missingRequired = [
        !shotCode ? '镜头号' : null,
        !sceneType ? '景别' : null,
        !duration ? '时长' : null,
    ].filter(Boolean) as string[];

    return {
        hasAny,
        hasValidationError: !!(shotCodeError || durationError),
        missingRequired,
        note,
    };
}

export function getStoryboardBadgeMeta(element: CanvasElement) {
    const storyboardStatus = getStoryboardStatus(element);
    const primaryLabel = element.storyboardShotCode?.trim() || element.storyboardSceneType?.trim() || '';

    if (storyboardStatus.hasValidationError) {
        return {
            label: primaryLabel || '待修正',
            className: 'border-rose-200 bg-rose-50/96 text-rose-700',
        };
    }

    if (storyboardStatus.missingRequired.length > 0) {
        return {
            label: primaryLabel || '待补齐',
            className: 'border-amber-200 bg-amber-50/96 text-amber-700',
        };
    }

    if (storyboardStatus.hasAny) {
        return {
            label: primaryLabel || '分镜已齐',
            className: 'border-emerald-200 bg-emerald-50/96 text-emerald-700',
        };
    }

    return {
        label: '未建档',
        className: 'border-slate-200 bg-white/90 text-slate-500',
    };
}

export type StoryboardStatus = ReturnType<typeof getStoryboardStatus>;
export type StoryboardBadgeMeta = ReturnType<typeof getStoryboardBadgeMeta>;