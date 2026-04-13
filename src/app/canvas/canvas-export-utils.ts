/**
 * canvas-export-utils.ts — 文件下载、Blob 转换、SVG 导出工具
 *
 * 浏览器文件保存、格式转换、文件名生成。
 * 元素命名和工具结果命名位于 canvas-element-naming.ts。
 */

import type { SaveFilePicker, FilePickerHandle } from './canvas-runtime-types';
import { readImageDimensions } from './canvas-media-utils';

// ── File Download / Save Utilities ───────────────────────────

export function triggerBrowserDownload(blob: Blob, filename: string) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 延迟释放 blob URL，确保浏览器下载管理器已拾取资源
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function saveBlobToLocalFile(blob: Blob, filename: string): Promise<'picker' | 'download' | 'cancelled'> {
    const win = window as Window & { showSaveFilePicker?: SaveFilePicker };
    const canUsePicker = typeof win.showSaveFilePicker === 'function'
        && (typeof window.isSecureContext === 'undefined' || window.isSecureContext);
    if (canUsePicker) {
        let handle: FilePickerHandle;
        try {
            handle = await win.showSaveFilePicker!({
                suggestedName: filename,
                types: [{
                    description: 'Lovart 导出文件',
                    accept: { [blob.type || 'application/octet-stream']: [`.${filename.split('.').pop() || 'bin'}`] },
                }],
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return 'cancelled';
            }
            if (error instanceof DOMException && error.name === 'SecurityError') {
                triggerBrowserDownload(blob, filename);
                return 'download';
            }
            throw error;
        }
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'picker';
    }

    triggerBrowserDownload(blob, filename);
    return 'download';
}

// ── Blob / Data URL Utilities ────────────────────────────────

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

export function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`;
}

export function inferExtension(blob: Blob, fallback: string): string {
    if (blob.type.includes('png')) return 'png';
    if (blob.type.includes('jpeg') || blob.type.includes('jpg')) return 'jpg';
    if (blob.type.includes('webp')) return 'webp';
    if (blob.type.includes('gif')) return 'gif';
    if (blob.type.includes('mp4')) return 'mp4';
    if (blob.type.includes('webm')) return 'webm';
    return fallback;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL'));
        reader.readAsDataURL(blob);
    });
}

export async function convertImageBlobToRasterBlob(blob: Blob, mimeType: 'image/png' | 'image/jpeg'): Promise<Blob> {
    const objectUrl = URL.createObjectURL(blob);

    try {
        const dimensions = await readImageDimensions(blob);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new window.Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to decode image for export'));
            image.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create export canvas context');
        }

        if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const converted = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
        });

        if (!converted) {
            throw new Error('Failed to encode exported image');
        }

        return converted;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function buildSvgExportBlob(blob: Blob): Promise<Blob> {
    if (blob.type.includes('svg')) {
        return blob;
    }

    const { width, height } = await readImageDimensions(blob);
    const dataUrl = await blobToDataUrl(blob);
    const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${dataUrl}" width="${width}" height="${height}" preserveAspectRatio="none"/>
</svg>`;

    return new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
}

// ── Filename / Collection Utilities ──────────────────────────

export function makeGeneratedFilename(kind: 'image' | 'video', source: string, blob: Blob): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = inferExtension(blob, kind === 'video' ? 'mp4' : 'png');
    return `lovart-${source}-${kind}-${timestamp}.${ext}`;
}
