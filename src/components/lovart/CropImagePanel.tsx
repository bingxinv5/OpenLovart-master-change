"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Crop, Loader2, Move, Search, X } from 'lucide-react';
import type { CanvasElement } from './canvas-types';
import { buildFloatingPanelPositionClassName, buildFloatingPanelPositionCss } from './floating-panel-position';
import { buildDefaultNamePrefix } from './panel-defaults';
import { useToolPresets } from './useToolPresets';
import { getImageBlobUrlWithLOD, isImageRef } from '@/lib/editor-kernel';
import type { CropAspectRatioPreset, CropImageOptions, CropRect } from '@/lib/image-crop';
import { clamp } from '@/lib/number-utils';

interface CropImagePanelProps {
  element: CanvasElement;
  style: CSSProperties;
  isSubmitting?: boolean;
  submitStatusText?: string;
  onSubmit: (options: CropImageOptions) => void;
  onClose: () => void;
  onCancelSubmit?: () => void;
}

const DEFAULT_OPTIONS: CropImageOptions = {
  aspectRatio: 'free',
  zoom: 100,
  focusX: 0,
  focusY: 0,
  cropRect: undefined,
  namePrefix: '',
};

const PREVIEW_STAGE_WIDTH = 334;
const PREVIEW_STAGE_HEIGHT = 200;
const MIN_RECT_SIZE = 0.08;

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface ImageNaturalSize {
  width: number;
  height: number;
}

interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getAspectRatioValue(preset: CropAspectRatioPreset, fallback: number) {
  switch (preset) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '3:4':
      return 3 / 4;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case 'free':
    default:
      return fallback;
  }
}

function sanitizeRect(rect: CropRect): CropRect {
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  const width = clamp(rect.width, MIN_RECT_SIZE, 1);
  const height = clamp(rect.height, MIN_RECT_SIZE, 1);
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

function getDisplayRect(size: ImageNaturalSize | null): DisplayRect {
  if (!size || !size.width || !size.height) {
    return { left: 0, top: 0, width: PREVIEW_STAGE_WIDTH, height: PREVIEW_STAGE_HEIGHT };
  }

  const imageRatio = size.width / size.height;
  const stageRatio = PREVIEW_STAGE_WIDTH / PREVIEW_STAGE_HEIGHT;

  if (imageRatio >= stageRatio) {
    const width = PREVIEW_STAGE_WIDTH;
    const height = width / imageRatio;
    return {
      left: 0,
      top: (PREVIEW_STAGE_HEIGHT - height) / 2,
      width,
      height,
    };
  }

  const height = PREVIEW_STAGE_HEIGHT;
  const width = height * imageRatio;
  return {
    left: (PREVIEW_STAGE_WIDTH - width) / 2,
    top: 0,
    width,
    height,
  };
}

function toPreviewPx(value: number | undefined) {
  return `${Number.isFinite(value) ? value : 0}px`;
}

function buildCropRectFromControls(options: CropImageOptions, size: ImageNaturalSize): CropRect {
  const imageAspect = size.width / Math.max(1, size.height);
  const desiredAspect = getAspectRatioValue(options.aspectRatio, imageAspect);
  const normalizedAspect = desiredAspect / imageAspect;
  const coverage = clamp(options.zoom / 100, 0.1, 1);

  let width = coverage;
  let height = options.aspectRatio === 'free' && options.cropRect
    ? clamp(options.cropRect.height, MIN_RECT_SIZE, 1)
    : width / normalizedAspect;

  if (options.aspectRatio === 'free') {
    if (options.cropRect) {
      width = clamp(options.cropRect.width, MIN_RECT_SIZE, 1);
      height = clamp(options.cropRect.height, MIN_RECT_SIZE, 1);
    } else {
      width = coverage;
      height = coverage;
    }
  } else {
    if (height > 1) {
      height = 1;
      width = height * normalizedAspect;
    }
    if (width > 1) {
      width = 1;
      height = width / normalizedAspect;
    }
  }

  const remainingX = Math.max(0, 1 - width);
  const remainingY = Math.max(0, 1 - height);
  const x = clamp(((options.focusX + 100) / 200) * remainingX, 0, remainingX);
  const y = clamp(((options.focusY + 100) / 200) * remainingY, 0, remainingY);

  return sanitizeRect({ x, y, width, height });
}

function deriveControlsFromRect(rect: CropRect): Pick<CropImageOptions, 'zoom' | 'focusX' | 'focusY'> {
  const remainingX = Math.max(0, 1 - rect.width);
  const remainingY = Math.max(0, 1 - rect.height);

  const focusX = remainingX <= 0 ? 0 : ((rect.x / remainingX) * 200) - 100;
  const focusY = remainingY <= 0 ? 0 : ((rect.y / remainingY) * 200) - 100;
  const coverage = Math.max(rect.width, rect.height);

  return {
    zoom: Math.round(clamp(coverage * 100, 10, 100)),
    focusX: Math.round(clamp(focusX, -100, 100)),
    focusY: Math.round(clamp(focusY, -100, 100)),
  };
}

function normalizeRectForAspect(rect: CropRect, aspectRatio: CropAspectRatioPreset, size: ImageNaturalSize): CropRect {
  if (aspectRatio === 'free') {
    return sanitizeRect(rect);
  }

  const imageAspect = size.width / Math.max(1, size.height);
  const desiredAspect = getAspectRatioValue(aspectRatio, imageAspect);
  const normalizedAspect = desiredAspect / imageAspect;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  let width = rect.width;
  let height = width / normalizedAspect;
  if (height > 1) {
    height = 1;
    width = height * normalizedAspect;
  }
  if (width > 1) {
    width = 1;
    height = width / normalizedAspect;
  }
  if (height > rect.height) {
    height = rect.height;
    width = height * normalizedAspect;
  }

  let x = centerX - width / 2;
  let y = centerY - height / 2;
  x = clamp(x, 0, 1 - width);
  y = clamp(y, 0, 1 - height);
  return sanitizeRect({ x, y, width, height });
}

function describeAspect(options: CropImageOptions, cropRect: CropRect | null, size: ImageNaturalSize | null) {
  if (options.aspectRatio !== 'free') {
    return options.aspectRatio;
  }
  if (!cropRect || !size) return '自由';
  const ratio = ((cropRect.width * size.width) / Math.max(1, cropRect.height * size.height)).toFixed(2);
  return `自由 ${ratio}:1`;
}

const aspectPresets: Array<{ id: CropAspectRatioPreset; label: string }> = [
  { id: 'free', label: '自由' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

export function CropImagePanel({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: CropImagePanelProps) {
  return (
    <CropImagePanelContent
      key={element.id}
      element={element}
      style={style}
      isSubmitting={isSubmitting}
      submitStatusText={submitStatusText}
      onSubmit={onSubmit}
      onClose={onClose}
      onCancelSubmit={onCancelSubmit}
    />
  );
}

function CropImagePanelContent({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: CropImagePanelProps) {
  const [options, setOptions] = useState<CropImageOptions>(() => ({
    ...DEFAULT_OPTIONS,
    namePrefix: buildDefaultNamePrefix(element),
  }));
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewError, setPreviewError] = useState('');
  const [imageSize, setImageSize] = useState<ImageNaturalSize | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const { presetHint, presetName, presets, setPresetName, saveNamedPreset, rememberPreset, loadLastPreset, applyPreset, removePreset } = useToolPresets<CropImageOptions>('crop-image', '裁剪预设');
  const [presetsExpanded, setPresetsExpanded] = useState(false);
  const dragStateRef = useRef<{
    handle: DragHandle;
    startRect: CropRect;
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const displayRect = useMemo(() => getDisplayRect(imageSize), [imageSize]);
  const cropOverlayStyle = useMemo(() => {
    if (!cropRect) return null;
    return {
      left: displayRect.left + cropRect.x * displayRect.width,
      top: displayRect.top + cropRect.y * displayRect.height,
      width: cropRect.width * displayRect.width,
      height: cropRect.height * displayRect.height,
    };
  }, [cropRect, displayRect]);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      const content = element.content || '';
      if (!content) {
        setPreviewError('当前图片不可预览');
        return;
      }

      try {
        let nextSrc = content;
        if (isImageRef(content)) {
          nextSrc = await getImageBlobUrlWithLOD(content, 1024) || '';
        }

        if (!cancelled) {
          setPreviewSrc(nextSrc);
          setPreviewError(nextSrc ? '' : '当前图片不可预览');
        }
      } catch {
        if (!cancelled) {
          setPreviewError('当前图片不可预览');
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [element.content]);

  const syncCropRect = (nextOptions: CropImageOptions, nextImageSize: ImageNaturalSize | null = imageSize) => {
    if (!nextImageSize) return;
    const nextRect = nextOptions.cropRect
      ? normalizeRectForAspect(nextOptions.cropRect, nextOptions.aspectRatio, nextImageSize)
      : buildCropRectFromControls(nextOptions, nextImageSize);
    setCropRect(nextRect);
  };

  const updateField = <K extends keyof CropImageOptions>(key: K, value: CropImageOptions[K]) => {
    const nextOptions: CropImageOptions = {
      ...options,
      [key]: value,
      ...(key === 'zoom' || key === 'focusX' || key === 'focusY' || key === 'aspectRatio' ? { cropRect: undefined } : {}),
    };
    setOptions(nextOptions);
    if (key === 'zoom' || key === 'focusX' || key === 'focusY' || key === 'aspectRatio') {
      syncCropRect(nextOptions);
    }
  };

  const commitRect = useCallback((nextRect: CropRect) => {
    const normalized = sanitizeRect(nextRect);
    const derived = deriveControlsFromRect(normalized);
    setCropRect(normalized);
    setOptions((prev) => ({
      ...prev,
      ...derived,
      cropRect: normalized,
    }));
  }, []);

  const resizeWithAspect = useCallback((handle: DragHandle, startRect: CropRect, dx: number, dy: number) => {
    if (!imageSize) return startRect;
    const imageAspect = imageSize.width / Math.max(1, imageSize.height);
    const desiredAspect = getAspectRatioValue(options.aspectRatio, imageAspect);
    const normalizedAspect = desiredAspect / imageAspect;

    const left = startRect.x;
    const right = startRect.x + startRect.width;
    const top = startRect.y;
    const bottom = startRect.y + startRect.height;

    const anchorX = handle === 'nw' || handle === 'sw' ? right : left;
    const anchorY = handle === 'nw' || handle === 'ne' ? bottom : top;
    const rawWidth = Math.abs((handle === 'nw' || handle === 'sw' ? anchorX - (left + dx) : (right + dx) - anchorX));
    const rawHeight = Math.abs((handle === 'nw' || handle === 'ne' ? anchorY - (top + dy) : (bottom + dy) - anchorY));

    let width = Math.max(MIN_RECT_SIZE, rawWidth);
    let height = width / normalizedAspect;
    if (height > rawHeight) {
      height = Math.max(MIN_RECT_SIZE, rawHeight);
      width = height * normalizedAspect;
    }

    width = Math.min(width, 1);
    height = Math.min(height, 1);

    let nextLeft = handle === 'nw' || handle === 'sw' ? anchorX - width : anchorX;
    let nextTop = handle === 'nw' || handle === 'ne' ? anchorY - height : anchorY;

    nextLeft = clamp(nextLeft, 0, 1 - width);
    nextTop = clamp(nextTop, 0, 1 - height);

    return sanitizeRect({ x: nextLeft, y: nextTop, width, height });
  }, [imageSize, options.aspectRatio]);

  const handlePointerDown = (handle: DragHandle, event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropRect) return;
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      handle,
      startRect: cropRect,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const dx = (event.clientX - dragState.startClientX) / Math.max(1, displayRect.width);
      const dy = (event.clientY - dragState.startClientY) / Math.max(1, displayRect.height);

      if (dragState.handle === 'move') {
        commitRect({
          ...dragState.startRect,
          x: clamp(dragState.startRect.x + dx, 0, 1 - dragState.startRect.width),
          y: clamp(dragState.startRect.y + dy, 0, 1 - dragState.startRect.height),
        });
        return;
      }

      if (options.aspectRatio === 'free') {
        let nextRect = { ...dragState.startRect };
        switch (dragState.handle) {
          case 'nw':
            nextRect = {
              x: clamp(dragState.startRect.x + dx, 0, dragState.startRect.x + dragState.startRect.width - MIN_RECT_SIZE),
              y: clamp(dragState.startRect.y + dy, 0, dragState.startRect.y + dragState.startRect.height - MIN_RECT_SIZE),
              width: dragState.startRect.width - dx,
              height: dragState.startRect.height - dy,
            };
            break;
          case 'ne':
            nextRect = {
              x: dragState.startRect.x,
              y: clamp(dragState.startRect.y + dy, 0, dragState.startRect.y + dragState.startRect.height - MIN_RECT_SIZE),
              width: dragState.startRect.width + dx,
              height: dragState.startRect.height - dy,
            };
            break;
          case 'sw':
            nextRect = {
              x: clamp(dragState.startRect.x + dx, 0, dragState.startRect.x + dragState.startRect.width - MIN_RECT_SIZE),
              y: dragState.startRect.y,
              width: dragState.startRect.width - dx,
              height: dragState.startRect.height + dy,
            };
            break;
          case 'se':
            nextRect = {
              x: dragState.startRect.x,
              y: dragState.startRect.y,
              width: dragState.startRect.width + dx,
              height: dragState.startRect.height + dy,
            };
            break;
          default:
            break;
        }
        commitRect(sanitizeRect(nextRect));
        return;
      }

      commitRect(resizeWithAspect(dragState.handle, dragState.startRect, dx, dy));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [commitRect, cropRect, displayRect.height, displayRect.width, imageSize, options.aspectRatio, resizeWithAspect]);
  const panelPositionClassName = buildFloatingPanelPositionClassName('crop-image-panel-position', element.id);
  const panelPositionCss = buildFloatingPanelPositionCss(panelPositionClassName, style);
  const previewStageClassName = buildFloatingPanelPositionClassName('crop-preview-stage', element.id);
  const previewImageClassName = buildFloatingPanelPositionClassName('crop-preview-image', element.id);
  const cropOverlayClassName = buildFloatingPanelPositionClassName('crop-preview-overlay', element.id);
  const cropPreviewCss = `
.${previewStageClassName} {
  width: ${PREVIEW_STAGE_WIDTH}px;
  height: ${PREVIEW_STAGE_HEIGHT}px;
}

.${previewImageClassName} {
  left: ${toPreviewPx(displayRect.left)};
  top: ${toPreviewPx(displayRect.top)};
  width: ${toPreviewPx(displayRect.width)};
  height: ${toPreviewPx(displayRect.height)};
}

.${cropOverlayClassName} {
  left: ${toPreviewPx(cropOverlayStyle?.left)};
  top: ${toPreviewPx(cropOverlayStyle?.top)};
  width: ${toPreviewPx(cropOverlayStyle?.width)};
  height: ${toPreviewPx(cropOverlayStyle?.height)};
}
`;

  return (
    <>
    <style>{`${panelPositionCss}${cropPreviewCss}`}</style>
    <div
      className={`${panelPositionClassName} absolute z-[120] w-[360px] workbench-panel-elevated rounded-xl p-3`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-white">
            <Crop size={11} />
          </div>
          <span>裁剪图片</span>
          <span className="text-[10px] font-normal text-slate-400">{describeAspect(options, cropRect, imageSize)}</span>
        </div>
        <button
          type="button"
          onClick={isSubmitting && onCancelSubmit ? onCancelSubmit : onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title={isSubmitting ? '取消任务' : '关闭'}
        >
          <X size={12} />
        </button>
      </div>

      <div className="mt-2.5">
        <div className="mb-2.5 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            <div className={`${previewStageClassName} relative overflow-hidden`}>
              {previewSrc ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt="crop-preview"
                    className={`${previewImageClassName} absolute select-none object-contain`}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      const nextImageSize = {
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                      };
                      setImageSize(nextImageSize);
                      syncCropRect(options, nextImageSize);
                    }}
                  />
                  {cropOverlayStyle && (
                    <>
                      <div className="absolute inset-0 bg-black/40" />
                      <div
                        className={`${cropOverlayClassName} absolute border border-white/80 bg-white/5 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]`}
                      >
                        <div
                          className="absolute inset-0 cursor-move"
                          onPointerDown={(event) => handlePointerDown('move', event)}
                        />
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 overflow-hidden opacity-60">
                          {Array.from({ length: 9 }).map((_, index) => (
                            <div key={index} className="border border-white/20" />
                          ))}
                        </div>
                        {(['nw', 'ne', 'sw', 'se'] as DragHandle[]).map((handle) => {
                          const posStyle: Record<DragHandle, string> = {
                            move: '',
                            nw: '-left-px -top-px cursor-nwse-resize',
                            ne: '-right-px -top-px cursor-nesw-resize',
                            sw: '-bottom-px -left-px cursor-nesw-resize',
                            se: '-bottom-px -right-px cursor-nwse-resize',
                          };
                          const borderEdge: Record<DragHandle, string> = {
                            move: '',
                            nw: 'border-t-2 border-l-2 rounded-tl-sm',
                            ne: 'border-t-2 border-r-2 rounded-tr-sm',
                            sw: 'border-b-2 border-l-2 rounded-bl-sm',
                            se: 'border-b-2 border-r-2 rounded-br-sm',
                          };

                          return (
                            <div
                              key={handle}
                              className={`absolute h-3.5 w-3.5 border-white ${borderEdge[handle]} ${posStyle[handle]}`}
                              onPointerDown={(event) => handlePointerDown(handle, event)}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                  {previewError || '正在载入预览...'}
                </div>
              )}
            </div>
          {cropRect && (
            <div className="flex items-center justify-between border-t border-slate-700/50 px-2.5 py-1 text-[10px] text-slate-400">
              <span>拖动移动 · 四角调整</span>
              <span>{Math.round(cropRect.width * 100)}% × {Math.round(cropRect.height * 100)}%</span>
            </div>
          )}
        </div>

        {/* 命名前缀 — inline */}
        <div className="flex items-center gap-2 border-b border-slate-100 py-2">
          <span className="flex-shrink-0 text-[11px] font-medium text-slate-500">命名前缀</span>
          <input
            type="text"
            value={options.namePrefix || ''}
            onChange={(e) => updateField('namePrefix', e.target.value)}
            placeholder="如：镜头A"
            className="min-w-0 flex-1 text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-300"
          />
        </div>

        {/* 比例预设 — 分段控件 */}
        <div className="mt-2">
          <div className="text-[11px] font-medium text-slate-500 mb-1.5">比例预设</div>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5">
            {aspectPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  const nextOptions: CropImageOptions = {
                    ...options,
                    aspectRatio: preset.id,
                    cropRect: cropRect || options.cropRect,
                  };
                  if (imageSize) {
                    const normalized = normalizeRectForAspect(cropRect || buildCropRectFromControls(nextOptions, imageSize), preset.id, imageSize);
                    setCropRect(normalized);
                    const derived = deriveControlsFromRect(normalized);
                    setOptions((prev) => ({
                      ...prev,
                      aspectRatio: preset.id,
                      ...derived,
                      cropRect: normalized,
                    }));
                    return;
                  }
                  updateField('aspectRatio', preset.id);
                }}
                className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  options.aspectRatio === preset.id
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 滑块 — 合并容器 */}
      <div className="mt-2.5 divide-y divide-slate-100 rounded-md border border-slate-200/60">
        <label className="block px-3 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1"><Search size={11} /> 裁剪范围</span>
            <span>{options.zoom}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={options.zoom}
            onChange={(e) => updateField('zoom', Number(e.target.value))}
            className="mt-1 w-full accent-slate-600"
          />
        </label>

        <label className="block px-3 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1"><Move size={11} /> 水平焦点</span>
            <span>{options.focusX}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={options.focusX}
            onChange={(e) => updateField('focusX', Number(e.target.value))}
            className="mt-1 w-full accent-slate-600"
          />
        </label>

        <label className="block px-3 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1"><Move size={11} /> 垂直焦点</span>
            <span>{options.focusY}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={options.focusY}
            onChange={(e) => updateField('focusY', Number(e.target.value))}
            className="mt-1 w-full accent-slate-600"
          />
        </label>
      </div>

      {/* 预设管理 — 默认折叠 */}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={() => setPresetsExpanded((v) => !v)}
          className="flex w-full items-center gap-1 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          {presetsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>预设管理</span>
          {presets.length > 0 && <span className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-400">{presets.length}</span>}
          {presetHint && <span className="ml-auto text-[10px] text-slate-400">{presetHint}</span>}
        </button>
        {presetsExpanded && (
          <div className="mt-1 space-y-1.5 rounded-md border border-slate-100 p-2">
            {options.namePrefix?.trim() && (
              <div className="text-[10px] text-slate-400">命名示例：{options.namePrefix.trim()} · 裁剪</div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="预设名，如：电商方图"
                className="h-6 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none placeholder:text-slate-300"
              />
              <button type="button" onClick={() => saveNamedPreset(options)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">保存</button>
              <button type="button" onClick={() => rememberPreset(options)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">记住</button>
              <button type="button" onClick={() => loadLastPreset((preset) => { const nextOptions = { ...options, ...preset }; setOptions(nextOptions); syncCropRect(nextOptions); })} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">上次</button>
            </div>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {presets.map((preset) => (
                  <div key={preset.id} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5">
                    <button type="button" onClick={() => applyPreset(preset, (value) => { const nextOptions = { ...options, ...value }; setOptions(nextOptions); syncCropRect(nextOptions); })} className="text-[10px] font-medium text-slate-700 hover:text-slate-900">{preset.name}</button>
                    <button type="button" onClick={() => removePreset(preset)} className="text-[10px] text-slate-400 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {isSubmitting && submitStatusText && (
          <span className="mr-auto text-[11px] text-slate-500">{submitStatusText}</span>
        )}
        <button
          type="button"
          onClick={isSubmitting && onCancelSubmit ? onCancelSubmit : onClose}
          className="rounded-md border border-slate-200/60 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          {isSubmitting ? '取消' : '取消'}
        </button>
        <button
          type="button"
          onClick={() => onSubmit({
            ...options,
            cropRect: cropRect || options.cropRect,
          })}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Crop size={14} />}
          <span>{isSubmitting ? '裁剪中...' : '开始裁剪'}</span>
        </button>
      </div>
    </div>
    </>
  );
}
