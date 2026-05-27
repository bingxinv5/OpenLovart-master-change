import React from 'react';

const RASTER_VIEWPORT_MARGIN_SCREEN_PX = 180;
const MAX_RASTER_DEVICE_PIXEL_RATIO = 2;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export type CanvasConnectorRasterBatch = {
    key: string;
    path: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
    count: number;
};

type CanvasConnectorRasterLayerProps = {
    batches: CanvasConnectorRasterBatch[];
    renderPan: { x: number; y: number };
    scale: number;
    viewportSize?: { width: number; height: number };
};

function getSafeScale(scale: number) {
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function toLayerPx(value: number) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

export function CanvasConnectorRasterLayer({
    batches,
    renderPan,
    scale,
    viewportSize,
}: CanvasConnectorRasterLayerProps) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const pathCacheRef = React.useRef(new Map<string, { path: string; path2D: Path2D }>());
    const safeScale = getSafeScale(scale);
    const safeViewportSize = viewportSize ?? { width: 0, height: 0 };
    const viewportWorldBounds = React.useMemo(() => {
        const margin = RASTER_VIEWPORT_MARGIN_SCREEN_PX / safeScale;
        const left = (-renderPan.x / safeScale) - margin;
        const top = (-renderPan.y / safeScale) - margin;
        const width = (safeViewportSize.width / safeScale) + margin * 2;
        const height = (safeViewportSize.height / safeScale) + margin * 2;

        return {
            left,
            top,
            width: Math.max(1, width),
            height: Math.max(1, height),
        };
    }, [renderPan.x, renderPan.y, safeScale, safeViewportSize.height, safeViewportSize.width]);

    const totalConnectorCount = React.useMemo(
        () => batches.reduce((total, batch) => total + batch.count, 0),
        [batches],
    );

    useIsomorphicLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || batches.length === 0 || safeViewportSize.width <= 0 || safeViewportSize.height <= 0) {
            return;
        }

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        const devicePixelRatio = Math.min(
            window.devicePixelRatio || 1,
            MAX_RASTER_DEVICE_PIXEL_RATIO,
        );
        const screenWidth = Math.max(1, Math.ceil(viewportWorldBounds.width * safeScale));
        const screenHeight = Math.max(1, Math.ceil(viewportWorldBounds.height * safeScale));
        const bitmapWidth = Math.max(1, Math.ceil(screenWidth * devicePixelRatio));
        const bitmapHeight = Math.max(1, Math.ceil(screenHeight * devicePixelRatio));

        if (canvas.width !== bitmapWidth) {
            canvas.width = bitmapWidth;
        }
        if (canvas.height !== bitmapHeight) {
            canvas.height = bitmapHeight;
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, bitmapWidth, bitmapHeight);
        context.setTransform(
            safeScale * devicePixelRatio,
            0,
            0,
            safeScale * devicePixelRatio,
            -viewportWorldBounds.left * safeScale * devicePixelRatio,
            -viewportWorldBounds.top * safeScale * devicePixelRatio,
        );
        context.lineCap = 'round';
        context.lineJoin = 'round';

        const pathCache = pathCacheRef.current;
        const activeCacheKeys = new Set<string>();
        for (const batch of batches) {
            const cachedPath = pathCache.get(batch.key);
            const path2D = cachedPath?.path === batch.path
                ? cachedPath.path2D
                : new Path2D(batch.path);
            if (cachedPath?.path !== batch.path) {
                pathCache.set(batch.key, { path: batch.path, path2D });
            }
            activeCacheKeys.add(batch.key);
            context.globalAlpha = batch.opacity;
            context.strokeStyle = batch.stroke;
            context.lineWidth = batch.strokeWidth;
            context.stroke(path2D);
        }
        for (const key of pathCache.keys()) {
            if (!activeCacheKeys.has(key)) {
                pathCache.delete(key);
            }
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
    }, [batches, safeScale, safeViewportSize.height, safeViewportSize.width, viewportWorldBounds.height, viewportWorldBounds.left, viewportWorldBounds.top, viewportWorldBounds.width]);

    if (batches.length === 0) {
        return null;
    }

    return (
        <canvas
            ref={canvasRef}
            className="canvas-reference-connector-raster-layer pointer-events-none absolute"
            data-raster-connector-batches={batches.length}
            data-raster-connector-count={totalConnectorCount}
            style={{
                left: toLayerPx(viewportWorldBounds.left),
                top: toLayerPx(viewportWorldBounds.top),
                width: toLayerPx(viewportWorldBounds.width),
                height: toLayerPx(viewportWorldBounds.height),
            }}
        />
    );
}
