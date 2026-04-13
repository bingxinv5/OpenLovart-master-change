/**
 * LOD Request Pixel Utilities
 *
 * Pure functions that compute the pixel tier to request from the
 * image store based on the current display size and canvas zoom.
 * Extracted from WorkbenchImage so they can be reused by any
 * component that needs LOD-aware image resolution.
 */

export function normalizeDisplayPixels(displayPixels?: number): number {
    return Math.max(1, Math.round(displayPixels || 1024));
}

export function getEffectiveDevicePixelRatio(canvasScale: number, devicePixelRatio: number): number {
    if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) {
        return 1;
    }

    const cap = canvasScale >= 1 ? 3 : 2;
    return Math.min(cap, devicePixelRatio);
}

export function getPreviewRequestPixels(displayPixels?: number, canvasScale = 1): number {
    const normalized = normalizeDisplayPixels(displayPixels);
    if (canvasScale <= 0.12) return 32;
    if (canvasScale <= 0.25) return 64;
    return normalized <= 96 ? 64 : 256;
}

export function getPriorityPreviewRequestPixels(displayPixels?: number, canvasScale = 1): number {
    const normalized = normalizeDisplayPixels(displayPixels);
    if (canvasScale <= 0.12) return 256;
    if (canvasScale <= 0.25) return 128;
    return normalized <= 256 ? 256 : 512;
}

export function getFinalRequestPixels(displayPixels?: number, canvasScale = 1): number {
    const normalized = normalizeDisplayPixels(displayPixels);

    if (canvasScale <= 0.12) {
        return 32;
    }

    if (canvasScale <= 0.25) {
        return 64;
    }

    if (canvasScale <= 0.4) {
        return normalized <= 384 ? 128 : 256;
    }

    if (normalized <= 96) {
        return 64;
    }

    if (normalized <= 384) {
        return 256;
    }

    if (normalized <= 1536) {
        return 1024;
    }

    if (normalized <= 3072) {
        return 2048;
    }

    // 超大显示尺寸：使用原图
    return 4096;
}

export function getPriorityFinalRequestPixels(displayPixels?: number, canvasScale = 1): number {
    const normalized = normalizeDisplayPixels(displayPixels);

    if (canvasScale <= 0.12) {
        return 512;
    }

    if (canvasScale <= 0.25) {
        return 256;
    }

    if (normalized <= 256) {
        return 512;
    }

    return getFinalRequestPixels(displayPixels, canvasScale);
}
