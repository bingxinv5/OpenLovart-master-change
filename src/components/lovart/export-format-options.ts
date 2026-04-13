import type { CanvasElementExportFormat } from './canvas-types';

export const IMAGE_EXPORT_OPTIONS: Array<{ label: string; format: CanvasElementExportFormat }> = [
    { label: 'PNG', format: 'png' },
    { label: 'JPG', format: 'jpg' },
    { label: 'SVG', format: 'svg' },
];

export const VIDEO_EXPORT_OPTIONS: Array<{ label: string; format: CanvasElementExportFormat }> = [
    { label: 'MP4', format: 'original' },
];

export function getMediaExportOptions(kind: 'image' | 'video') {
    return kind === 'video' ? VIDEO_EXPORT_OPTIONS : IMAGE_EXPORT_OPTIONS;
}
