"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cachedDataUrlToBlobUrl } from '@/lib/blob-utils';
import { isImageRef, getImageBlobUrlWithLOD, reprioritizeImageLodCache } from '@/lib/editor-kernel';
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

async function resolveImageUrlWithRetry(content: string, displayPixels: number, retries = 2, delayMs = 120): Promise<string | null> {
    let result: string | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        result = await getImageBlobUrlWithLOD(content, displayPixels);
        if (result) {
            return result;
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

export interface WorkbenchImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'className'> {
    content?: string;
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
    const currentSrcRef = useRef<string | null>(null);
    const currentContentRef = useRef<string | null>(null);
    /** 当前使用的 LOD 请求像素，用于检测降级 */
    const currentLodRef = useRef<number>(0);
    const promotionTimerRef = useRef<number | null>(null);
    const [activeLayer, setActiveLayer] = useState<ImageLayer | null>(null);
    const [pendingLayer, setPendingLayer] = useState<(ImageLayer & { visible: boolean }) | null>(null);
    const [loadState, _setLoadState] = useState<LoadState>('loading');
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
    const shouldUpgradeToFinal = isNearViewport && isScaleSettled && stableCanvasScale > 0.18 && finalRequestPixels > previewRequestPixels;
    const usesImageStoreLod = !!content && isImageRef(content);
    // Remote/data URLs don't participate in the image-store LOD pipeline.
    // Re-running the load effect on hover would revoke the currently displayed blob URL and cause flicker.
    const loadRequestPixels = usesImageStoreLod ? previewRequestPixels : 0;

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

    useEffect(() => {
        currentSrcRef.current = activeLayer?.src ?? null;
        currentContentRef.current = activeLayer?.content ?? null;
        currentLodRef.current = activeLayer?.requestPixels ?? 0;
    }, [activeLayer]);

    useEffect(() => {
        onLoadStateChangeRef.current = onLoadStateChange;
    }, [onLoadStateChange]);

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
        const preferredResolvedSrc = resolvedSrc?.trim() || null;

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

            if (currentContentRef.current === content && currentSrcRef.current && currentLodRef.current >= previewRequestPixels) {
                setLoadState('ready');
                return;
            }

            try {
                if (!cancelled) {
                    setLoadState('loading');
                }

                const previewUrl = await resolveImageUrlWithRetry(content, previewRequestPixels);
                if (cancelled) return;

                if (!previewUrl) {
                    setActiveLayer(null);
                    setPendingLayer(null);
                    setLoadState('error');
                    return;
                }

                // 这里不能主动 revoke 旧的 blob URL：这些 URL 由 image-store 的全局 LRU 缓存统一管理。
                // 如果组件单方面释放，缓存仍可能继续返回已失效 URL，造成偶发断图。
                commitResolvedLayer({ src: previewUrl, content, requestPixels: previewRequestPixels });
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
    }, [commitResolvedLayer, content, loadRequestPixels, resolvedSrc, setLoadState]);

    useEffect(() => {
        if (!content || !isImageRef(content) || !shouldUpgradeToFinal) {
            return;
        }

        let cancelled = false;
        let upgradeTimer: number | null = null;

        if (previewRequestPixels === finalRequestPixels) {
            return;
        }

        if (currentContentRef.current === content && currentLodRef.current >= finalRequestPixels) {
            return;
        }

        const upgrade = async () => {
            try {
                const finalUrl = await resolveImageUrlWithRetry(content, finalRequestPixels, 1, 80);
                if (cancelled || !finalUrl || finalUrl === currentSrcRef.current) return;
                setLoadState('loading');
                setPendingLayer({ src: finalUrl, content, requestPixels: finalRequestPixels, visible: false });
            } catch {
                // keep preview image
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
    }, [content, finalRequestPixels, previewRequestPixels, setLoadState, shouldUpgradeToFinal]);

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
        <div ref={containerRef} className={joinClasses('relative overflow-hidden', containerClassName)} style={surfaceStyle}>
            {visiblePrimarySrc && !hasError && (
                // eslint-disable-next-line @next/next/no-img-element -- workbench preview needs to support blob/data URLs and direct object URL lifecycle control.
                <img
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
