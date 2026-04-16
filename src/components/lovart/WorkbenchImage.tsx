"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cachedDataUrlToBlobUrl } from '@/lib/blob-utils';
import { inspectImageStoredLodLevels, isImageRef, getImageBlobUrlWithLODResolution, reprioritizeImageLodCache } from '@/lib/editor-kernel';
import {
    normalizeDisplayPixels,
    getEffectiveDevicePixelRatio,
    getPreviewRequestPixels,
    getPriorityPreviewRequestPixels,
    getFinalRequestPixels,
    getPriorityFinalRequestPixels,
} from '@/lib/lod-request-utils';

type LoadState = 'loading' | 'ready' | 'error';

type ImageLayer = {
    src: string;
    content: string;
    requestPixels: number;
};

const ORIGINAL_IMAGE_REQUEST_PIXELS = Number.MAX_SAFE_INTEGER;
const FINAL_LAYER_RETRY_DELAYS_MS = [0, 320, 800, 1600, 3200, 5000] as const;

async function resolveImageLayerWithRetry(content: string, displayPixels: number, retries = 2, delayMs = 120): Promise<ImageLayer | null> {
    let result: { url: string; resolvedLevel: number | null } | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        result = await getImageBlobUrlWithLODResolution(content, displayPixels);
        if (result) {
            return {
                src: result.url,
                content,
                requestPixels: result.resolvedLevel === null ? ORIGINAL_IMAGE_REQUEST_PIXELS : result.resolvedLevel,
            };
        }

        if (attempt < retries) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
        }
    }

    return null;
}

const WORKBENCH_SURFACE_STYLE: React.CSSProperties = {
    backgroundColor: '#f8fafc',
    backgroundImage: [
        'linear-gradient(45deg, rgba(148,163,184,0.12) 25%, transparent 25%)',
        'linear-gradient(-45deg, rgba(148,163,184,0.12) 25%, transparent 25%)',
        'linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.12) 75%)',
        'linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.12) 75%)',
    ].join(', '),
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

const LIGHT_SURFACE_STYLE: React.CSSProperties = {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
};

const DARK_SURFACE_STYLE: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
};

function joinClasses(...values: Array<string | undefined | false | null>) {
    return values.filter(Boolean).join(' ');
}

function clearTimer(timerRef: React.MutableRefObject<number | null>) {
    if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
    }
}

function formatImageSize(width: number | null | undefined, height: number | null | undefined): string | null {
    if (!width || !height) {
        return null;
    }

    return `${Math.round(width)}x${Math.round(height)}`;
}

function readLoadedImageSize(image: HTMLImageElement | null): string | null {
    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return null;
    }

    return formatImageSize(image.naturalWidth, image.naturalHeight);
}

export interface WorkbenchImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'className'> {
    content?: string;
    debugId?: string;
    resolvedSrc?: string;
    displayPixels?: number;
    canvasScale?: number;
    prioritizeDetail?: boolean;
    containerClassName?: string;
    imageClassName?: string;
    fit?: 'contain' | 'cover';
    showSurface?: boolean;
    surfaceMode?: 'checker' | 'light' | 'dark';
    onLoadStateChange?: (state: LoadState) => void;
}

export function WorkbenchImage({
    content,
    debugId,
    resolvedSrc,
    displayPixels,
    canvasScale = 1,
    prioritizeDetail = false,
    containerClassName,
    imageClassName,
    fit = 'contain',
    showSurface = true,
    surfaceMode = 'checker',
    onLoadStateChange,
    alt,
    onLoad: externalOnLoad,
    onError: externalOnError,
    style: externalStyle,
    ...imgProps
}: WorkbenchImageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const primaryImageRef = useRef<HTMLImageElement>(null);
    const pendingImageRef = useRef<HTMLImageElement>(null);
    const currentSrcRef = useRef<string | null>(null);
    const currentContentRef = useRef<string | null>(null);
    /** 当前使用的 LOD 请求像素，用于检测降级 */
    const currentLodRef = useRef<number>(0);
    const promotionTimerRef = useRef<number | null>(null);
    const [activeLayer, setActiveLayer] = useState<ImageLayer | null>(null);
    const [pendingLayer, setPendingLayer] = useState<(ImageLayer & { visible: boolean }) | null>(null);
    const [loadState, _setLoadState] = useState<LoadState>('loading');
    const [storedLevelSummary, setStoredLevelSummary] = useState<string | null>(null);
    const [containerSizeSummary, setContainerSizeSummary] = useState<string | null>(null);
    const [activeNaturalSize, setActiveNaturalSize] = useState<string | null>(null);
    const [pendingNaturalSize, setPendingNaturalSize] = useState<string | null>(null);
    const onLoadStateChangeRef = useRef(onLoadStateChange);
    const setLoadState = useCallback((state: LoadState) => {
        _setLoadState(state);
        onLoadStateChangeRef.current?.(state);
    }, []);
    const [isNearViewport, setIsNearViewport] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return typeof window.IntersectionObserver === 'undefined';
    });
    const [stableCanvasScale, setStableCanvasScale] = useState(canvasScale);
    const [isScaleSettled, setIsScaleSettled] = useState(true);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const previewDevicePixelRatio = getEffectiveDevicePixelRatio(canvasScale, devicePixelRatio);
    const finalDevicePixelRatio = getEffectiveDevicePixelRatio(stableCanvasScale, devicePixelRatio);
    const previewDisplayPixels = normalizeDisplayPixels((displayPixels || 1024) * previewDevicePixelRatio);
    const finalDisplayPixels = normalizeDisplayPixels((displayPixels || 1024) * finalDevicePixelRatio);
    const previewRequestPixels = prioritizeDetail
        ? getPriorityPreviewRequestPixels(previewDisplayPixels, canvasScale)
        : getPreviewRequestPixels(previewDisplayPixels, canvasScale);
    const finalRequestPixels = prioritizeDetail
        ? getPriorityFinalRequestPixels(finalDisplayPixels, stableCanvasScale)
        : getFinalRequestPixels(finalDisplayPixels, stableCanvasScale);
    const preferredResolvedSrc = resolvedSrc?.trim() || null;
    const shouldUpgradeToFinal = isNearViewport && isScaleSettled && stableCanvasScale > 0.18 && finalRequestPixels > previewRequestPixels;
    const usesImageStoreLod = !!content && isImageRef(content);
    // Remote/data URLs don't participate in the image-store LOD pipeline.
    // Re-running the load effect on hover would revoke the currently displayed blob URL and cause flicker.
    const loadRequestPixels = usesImageStoreLod
        ? (preferredResolvedSrc ? ORIGINAL_IMAGE_REQUEST_PIXELS : previewRequestPixels)
        : 0;

    const imageRenderStyle = useMemo<React.CSSProperties>(() => {
        const renderHints: React.CSSProperties = canvasScale > 1
            ? {
                willChange: 'transform, opacity',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
            }
            : {
                willChange: 'opacity',
            };

        return {
            ...renderHints,
            ...externalStyle,
        };
    }, [canvasScale, externalStyle]);

    const formatLayerPixels = useCallback((value: number | null | undefined) => {
        if (value === ORIGINAL_IMAGE_REQUEST_PIXELS) {
            return 'original';
        }

        if (typeof value !== 'number' || value <= 0) {
            return 'runtime';
        }

        return String(value);
    }, []);

    const classifyRawContent = useCallback((value: string | undefined) => {
        if (!value) return 'empty';
        if (isImageRef(value)) return 'imgref';
        if (value.startsWith('blob:')) return 'blob';
        if (value.startsWith('data:')) return 'data';
        if (value.startsWith('http://') || value.startsWith('https://')) return 'remote';
        return 'other';
    }, []);

    const describeLayerSource = useCallback((layer: ImageLayer | null) => {
        if (!layer) return 'none';
        if (layer.requestPixels === 0) {
            return preferredResolvedSrc && layer.src === preferredResolvedSrc ? 'runtime-resolved' : 'direct-src';
        }
        if (layer.requestPixels === ORIGINAL_IMAGE_REQUEST_PIXELS) {
            return 'image-store-original';
        }
        return 'image-store-lod';
    }, [preferredResolvedSrc]);

    useEffect(() => {
        currentSrcRef.current = activeLayer?.src ?? null;
        currentContentRef.current = activeLayer?.content ?? null;
        currentLodRef.current = activeLayer?.requestPixels ?? 0;
    }, [activeLayer]);

    useEffect(() => {
        onLoadStateChangeRef.current = onLoadStateChange;
    }, [onLoadStateChange]);

    useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof window === 'undefined') {
            return;
        }

        const update = () => {
            const nextSummary = formatImageSize(node.clientWidth, node.clientHeight);
            setContainerSizeSummary((current) => current === nextSummary ? current : nextSummary);
        };

        update();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', update);
            return () => window.removeEventListener('resize', update);
        }

        const observer = new ResizeObserver(() => update());
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setActiveNaturalSize(null);
    }, [activeLayer?.src]);

    useEffect(() => {
        setPendingNaturalSize(null);
    }, [pendingLayer?.src]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            const nextActiveSize = readLoadedImageSize(primaryImageRef.current);
            setActiveNaturalSize((current) => current === nextActiveSize ? current : nextActiveSize);

            const nextPendingSize = readLoadedImageSize(pendingImageRef.current);
            setPendingNaturalSize((current) => current === nextPendingSize ? current : nextPendingSize);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [activeLayer?.src, loadState, pendingLayer?.src]);

    useEffect(() => {
        let cancelled = false;

        if (!content || !isImageRef(content)) {
            setStoredLevelSummary(null);
            return;
        }

        void inspectImageStoredLodLevels(content).then((summary) => {
            if (cancelled) {
                return;
            }

            if (!summary) {
                setStoredLevelSummary(null);
                return;
            }

            const nextSummary = `${summary.hasBase ? 'base' : 'no-base'}${summary.levels.length > 0 ? `|${summary.levels.join(',')}` : ''}`;
            setStoredLevelSummary((current) => current === nextSummary ? current : nextSummary);
        });

        return () => {
            cancelled = true;
        };
    }, [activeLayer?.requestPixels, content, pendingLayer?.requestPixels]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development' || !debugId) {
            return;
        }

        console.debug('[WorkbenchImageDebug]', {
            id: debugId,
            contentKind: classifyRawContent(content),
            activeLayer: formatLayerPixels(activeLayer?.requestPixels),
            activeSource: describeLayerSource(activeLayer),
            activeNaturalSize,
            pendingLayer: formatLayerPixels(pendingLayer?.requestPixels),
            pendingSource: describeLayerSource(pendingLayer),
            pendingNaturalSize,
            previewTarget: previewRequestPixels,
            finalTarget: finalRequestPixels,
            hasResolvedSrc: !!preferredResolvedSrc,
            isNearViewport,
            shouldUpgradeToFinal,
            containerSize: containerSizeSummary,
            storedLevels: storedLevelSummary,
            loadState,
        });
    }, [activeLayer, activeNaturalSize, classifyRawContent, containerSizeSummary, content, debugId, describeLayerSource, finalRequestPixels, formatLayerPixels, isNearViewport, loadState, pendingLayer, pendingNaturalSize, preferredResolvedSrc, previewRequestPixels, shouldUpgradeToFinal, storedLevelSummary]);

    const commitResolvedLayer = useCallback((nextLayer: ImageLayer) => {
        const shouldKeepCurrentLayer = !!currentSrcRef.current
            && nextLayer.src !== currentSrcRef.current;

        if (shouldKeepCurrentLayer) {
            setPendingLayer({ ...nextLayer, visible: false });
            setLoadState('loading');
            return;
        }

        setPendingLayer(null);
        setActiveLayer(nextLayer);
        setLoadState(nextLayer.src === currentSrcRef.current ? 'ready' : 'loading');
    }, [setLoadState]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (Math.abs(canvasScale - stableCanvasScale) < 0.001) {
            setIsScaleSettled(true);
            return;
        }

        setIsScaleSettled(false);
        const timer = window.setTimeout(() => {
            setStableCanvasScale(canvasScale);
            setIsScaleSettled(true);
        }, 200);

        return () => window.clearTimeout(timer);
    }, [canvasScale, stableCanvasScale]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
            return;
        }

        const node = containerRef.current;
        if (!node) return;

        const observer = new window.IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry?.isIntersecting) {
                    setIsNearViewport(true);
                }
            },
            {
                root: null,
                rootMargin: '300px',
                threshold: 0.01,
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            clearTimer(promotionTimerRef);

            if (!content) {
                if (!cancelled) {
                    setActiveLayer(null);
                    setPendingLayer(null);
                    setLoadState('error');
                }
                return;
            }

            if (!isImageRef(content)) {
                const nextSrc = preferredResolvedSrc || cachedDataUrlToBlobUrl(content) || content;
                if (!cancelled) {
                    // Remote URLs can be handed to <img> immediately; caching/localization
                    // happens elsewhere and should not block first paint of generated results.
                    commitResolvedLayer({ src: nextSrc, content, requestPixels: 0 });
                }
                return;
            }

            if (
                preferredResolvedSrc
                && currentSrcRef.current !== preferredResolvedSrc
                && (currentContentRef.current !== content || currentLodRef.current === 0)
            ) {
                commitResolvedLayer({ src: preferredResolvedSrc, content, requestPixels: 0 });
            }

            if (currentContentRef.current === content && currentSrcRef.current && currentLodRef.current >= loadRequestPixels) {
                setLoadState('ready');
                return;
            }

            try {
                if (!cancelled) {
                    setLoadState('loading');
                }

                const previewLayer = await resolveImageLayerWithRetry(content, loadRequestPixels);
                if (cancelled) return;

                if (!previewLayer) {
                    setActiveLayer(null);
                    setPendingLayer(null);
                    setLoadState('error');
                    return;
                }

                const shouldPreserveRuntimeLayer = currentContentRef.current === content
                    && currentLodRef.current === 0
                    && previewLayer.requestPixels > 0
                    && previewLayer.requestPixels < finalRequestPixels;

                if (shouldPreserveRuntimeLayer) {
                    setLoadState('ready');
                    return;
                }

                // 这里不能主动 revoke 旧的 blob URL：这些 URL 由 image-store 的全局 LRU 缓存统一管理。
                // 如果组件单方面释放，缓存仍可能继续返回已失效 URL，造成偶发断图。
                commitResolvedLayer(previewLayer);
            } catch {
                if (!cancelled) {
                    setActiveLayer(null);
                    setPendingLayer(null);
                    setLoadState('error');
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
            clearTimer(promotionTimerRef);
        };
    }, [commitResolvedLayer, content, loadRequestPixels, preferredResolvedSrc, setLoadState]);

    useEffect(() => {
        if (!content || !isImageRef(content) || !shouldUpgradeToFinal) {
            return;
        }

        let cancelled = false;
        let upgradeTimer: number | null = null;

        if (loadRequestPixels >= finalRequestPixels) {
            return;
        }

        if (currentContentRef.current === content && currentLodRef.current >= finalRequestPixels) {
            return;
        }

        const upgrade = async () => {
            let bestResolvedPixels = currentLodRef.current;

            for (let attempt = 0; attempt < FINAL_LAYER_RETRY_DELAYS_MS.length; attempt += 1) {
                if (attempt > 0) {
                    await new Promise<void>((resolve) => window.setTimeout(resolve, FINAL_LAYER_RETRY_DELAYS_MS[attempt]));
                    if (cancelled) {
                        return;
                    }
                }

                try {
                    const resolvedLayer = await resolveImageLayerWithRetry(content, finalRequestPixels, 1, 80);
                    if (cancelled || !resolvedLayer) {
                        return;
                    }

                    const shouldPreserveRuntimeLayer = currentContentRef.current === content
                        && currentLodRef.current === 0
                        && resolvedLayer.requestPixels < finalRequestPixels;

                    if (!shouldPreserveRuntimeLayer && resolvedLayer.requestPixels > bestResolvedPixels && resolvedLayer.src !== currentSrcRef.current) {
                        bestResolvedPixels = resolvedLayer.requestPixels;
                        setLoadState('loading');
                        setPendingLayer({ ...resolvedLayer, visible: false });
                    }

                    if (resolvedLayer.requestPixels >= finalRequestPixels) {
                        return;
                    }
                } catch {
                    return;
                }
            }
        };

        upgradeTimer = window.setTimeout(() => {
            void upgrade();
        }, 140);

        return () => {
            cancelled = true;
            if (upgradeTimer !== null) {
                window.clearTimeout(upgradeTimer);
            }
        };
    }, [content, finalRequestPixels, loadRequestPixels, setLoadState, shouldUpgradeToFinal]);

    useEffect(() => {
        if (!pendingLayer?.visible) {
            return;
        }

        clearTimer(promotionTimerRef);
        promotionTimerRef.current = window.setTimeout(() => {
            if (
                currentContentRef.current === pendingLayer.content
                && currentLodRef.current > 0
                && currentLodRef.current !== pendingLayer.requestPixels
            ) {
                reprioritizeImageLodCache(
                    pendingLayer.content,
                    pendingLayer.requestPixels,
                    currentLodRef.current,
                );
            }
            setActiveLayer({ src: pendingLayer.src, content: pendingLayer.content, requestPixels: pendingLayer.requestPixels });
            setPendingLayer(null);
        }, 180);

        return () => clearTimer(promotionTimerRef);
    }, [pendingLayer]);

    const surfaceStyle = !showSurface
        ? undefined
        : surfaceMode === 'light'
            ? LIGHT_SURFACE_STYLE
            : surfaceMode === 'dark'
                ? DARK_SURFACE_STYLE
                : WORKBENCH_SURFACE_STYLE;

    const isLoading = loadState === 'loading';
    const hasError = loadState === 'error';
    const visiblePrimarySrc = activeLayer?.src ?? null;
    const visiblePendingSrc = pendingLayer?.src ?? null;

    return (
        <div
            ref={containerRef}
            className={joinClasses('relative overflow-hidden', containerClassName)}
            style={surfaceStyle}
            data-image-debug-id={debugId}
            data-image-content-kind={classifyRawContent(content)}
            data-image-active-layer={formatLayerPixels(activeLayer?.requestPixels)}
            data-image-active-source={describeLayerSource(activeLayer)}
            data-image-pending-layer={formatLayerPixels(pendingLayer?.requestPixels)}
            data-image-pending-source={describeLayerSource(pendingLayer)}
            data-image-preview-target={String(previewRequestPixels)}
            data-image-final-target={String(finalRequestPixels)}
            data-image-has-resolved-src={preferredResolvedSrc ? '1' : '0'}
            data-image-near-viewport={isNearViewport ? '1' : '0'}
            data-image-should-upgrade={shouldUpgradeToFinal ? '1' : '0'}
            data-image-store-levels={storedLevelSummary ?? undefined}
            data-image-load-state={loadState}
            data-image-container-size={containerSizeSummary ?? undefined}
            data-image-active-natural-size={activeNaturalSize ?? undefined}
            data-image-pending-natural-size={pendingNaturalSize ?? undefined}
        >
            {visiblePrimarySrc && !hasError && (
                // eslint-disable-next-line @next/next/no-img-element -- workbench preview needs to support blob/data URLs and direct object URL lifecycle control.
                <img
                    ref={primaryImageRef}
                    src={visiblePrimarySrc}
                    alt={alt}
                    draggable={false}
                    className={joinClasses(
                        'relative z-10 h-full w-full select-none transition-opacity duration-200 opacity-100',
                        canvasScale > 1 ? 'workbench-image-hires' : undefined,
                        fit === 'cover' ? 'object-cover' : 'object-contain object-center',
                        surfaceMode === 'dark' ? 'drop-shadow-[0_2px_10px_rgba(15,23,42,0.35)]' : undefined,
                        imageClassName,
                    )}
                    style={imageRenderStyle}
                    onLoad={(e) => {
                        const nextNaturalSize = formatImageSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
                        setActiveNaturalSize((current) => current === nextNaturalSize ? current : nextNaturalSize);
                        setLoadState('ready');
                        externalOnLoad?.(e);
                    }}
                    onError={(e) => {
                        setLoadState('error');
                        externalOnError?.(e);
                    }}
                    onDragStart={(e) => {
                        e.preventDefault();
                        imgProps.onDragStart?.(e);
                    }}
                    {...imgProps}
                />
            )}

            {visiblePendingSrc && !hasError && (
                // eslint-disable-next-line @next/next/no-img-element -- workbench preview needs to support blob/data URLs and direct object URL lifecycle control.
                <img
                    ref={pendingImageRef}
                    src={visiblePendingSrc}
                    alt={alt}
                    draggable={false}
                    className={joinClasses(
                        'pointer-events-none absolute inset-0 z-20 h-full w-full select-none object-center transition-opacity duration-200',
                        pendingLayer?.visible ? 'opacity-100' : 'opacity-0',
                        canvasScale > 1 ? 'workbench-image-hires' : undefined,
                        fit === 'cover' ? 'object-cover' : 'object-contain',
                        surfaceMode === 'dark' ? 'drop-shadow-[0_2px_10px_rgba(15,23,42,0.35)]' : undefined,
                        imageClassName,
                    )}
                    style={imageRenderStyle}
                    onLoad={(e) => {
                        const nextNaturalSize = formatImageSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
                        setPendingNaturalSize((current) => current === nextNaturalSize ? current : nextNaturalSize);
                        setPendingLayer((current) => current ? { ...current, visible: true } : current);
                        setLoadState('ready');
                        externalOnLoad?.(e);
                    }}
                    onError={(e) => {
                        setPendingLayer(null);
                        setLoadState('ready');
                        externalOnError?.(e);
                    }}
                    onDragStart={(e) => {
                        e.preventDefault();
                        imgProps.onDragStart?.(e);
                    }}
                    {...imgProps}
                />
            )}

            {isLoading && !visiblePrimarySrc ? (
                <div className="flex h-full w-full items-center justify-center bg-white/55 backdrop-blur-[1px]">
                    <div className="flex flex-col items-center gap-1.5">
                        <div className="h-7 w-7 animate-pulse rounded-full bg-slate-300" />
                        <span className="text-[10px] text-slate-400">加载中</span>
                    </div>
                </div>
            ) : isLoading && !visiblePendingSrc ? (
                <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-white/82 px-2 py-1 text-[10px] text-slate-500 shadow-sm ring-1 ring-slate-200/80 backdrop-blur">
                    加载中
                </div>
            ) : hasError || !visiblePrimarySrc ? (
                <div className="flex h-full w-full items-center justify-center bg-white/40 backdrop-blur-[1px]">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="h-7 w-7 rounded-full bg-slate-200" />
                        <span className="text-[10px] text-slate-500">图片不可用</span>
                    </div>
                </div>
            ) : null}
            <div className={joinClasses(
                'pointer-events-none absolute inset-0 ring-1 ring-inset',
                surfaceMode === 'dark' ? 'ring-white/10' : 'ring-slate-900/6',
            )} />
        </div>
    );
}
