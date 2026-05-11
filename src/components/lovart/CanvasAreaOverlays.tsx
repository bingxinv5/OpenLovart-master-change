import type { MouseEvent, RefObject } from 'react';
import { Frame } from 'lucide-react';
import type { AlignGuide } from './canvas-alignment';
import type { CanvasElement } from './canvas-types';
import { renderPathPoints } from './canvas-ui-utils';
import { CanvasAlignGuides } from './CanvasAlignGuides';
import { ScreenSpaceResizeOverlay, type ScreenSpaceResizeOverlayState } from './ScreenSpaceResizeOverlay';
import { ImagePreviewPanel, type ImagePreviewMetrics, VideoPlaybackOverlay } from './CanvasMediaOverlays';

interface CanvasAreaWorldOverlaysProps {
    currentPath: { points: { x: number; y: number }[] } | null;
    alignGuides: AlignGuide[];
    frameDrawBox: { startX: number; startY: number; currentX: number; currentY: number } | null;
    elementsLength: number;
}

interface CanvasAreaViewportOverlaysProps {
    selectionBoxOverlayRef: RefObject<HTMLDivElement | null>;
    singleSelectionResizeOverlay: ScreenSpaceResizeOverlayState | null;
    onResizeStart: (event: MouseEvent<HTMLDivElement>, handle: string, element: CanvasElement) => void;
    elements: CanvasElement[];
    activeVideoId: string | null;
    scale: number;
    pan: { x: number; y: number };
    onCloseVideo: () => void;
    activeImagePreviewElement: CanvasElement | null;
    activeImagePreviewMetrics: ImagePreviewMetrics | null;
    activeImagePreviewResolvedSrc?: string;
}

export function CanvasAreaWorldOverlays({
    currentPath,
    alignGuides,
    frameDrawBox,
    elementsLength,
}: CanvasAreaWorldOverlaysProps) {
    const frameDrawBoxStyleSheet = frameDrawBox ? `
.canvas-frame-draw-box {
    left: ${Math.min(frameDrawBox.startX, frameDrawBox.currentX)}px;
    top: ${Math.min(frameDrawBox.startY, frameDrawBox.currentY)}px;
    width: ${Math.abs(frameDrawBox.currentX - frameDrawBox.startX)}px;
    height: ${Math.abs(frameDrawBox.currentY - frameDrawBox.startY)}px;
}
` : '';

    return (
        <>
            {frameDrawBox && <style>{frameDrawBoxStyleSheet}</style>}
            {currentPath && (
                <div className="absolute inset-0 pointer-events-none z-50">
                    <svg className="w-full h-full overflow-visible">
                        <path
                            d={renderPathPoints(currentPath.points)}
                            stroke="#000000"
                            strokeWidth={3}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            )}

            <CanvasAlignGuides guides={alignGuides} />

            {frameDrawBox && (
                <div className="canvas-frame-draw-box pointer-events-none absolute z-50 border-2 border-dashed border-blue-500 bg-blue-500/5">
                    <div className="absolute -top-5 left-0 text-[10px] text-blue-500 font-medium flex items-center gap-1 whitespace-nowrap">
                        <Frame size={10} />
                        Frame {Math.round(Math.abs(frameDrawBox.currentX - frameDrawBox.startX))} × {Math.round(Math.abs(frameDrawBox.currentY - frameDrawBox.startY))}
                    </div>
                </div>
            )}

            {elementsLength === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" />
            )}
        </>
    );
}

export function CanvasAreaViewportOverlays({
    selectionBoxOverlayRef,
    singleSelectionResizeOverlay,
    onResizeStart,
    elements,
    activeVideoId,
    scale,
    pan,
    onCloseVideo,
    activeImagePreviewElement,
    activeImagePreviewMetrics,
    activeImagePreviewResolvedSrc,
}: CanvasAreaViewportOverlaysProps) {
    return (
        <>
            <div
                ref={selectionBoxOverlayRef}
                data-testid="canvas-selection-box"
                className="pointer-events-none absolute z-[120] hidden border border-blue-500 bg-blue-500/10"
            />

            {singleSelectionResizeOverlay && (
                <ScreenSpaceResizeOverlay
                    overlay={singleSelectionResizeOverlay}
                    onResizeStart={onResizeStart}
                />
            )}

            <VideoPlaybackOverlay
                elements={elements}
                activeVideoId={activeVideoId}
                scale={scale}
                pan={pan}
                onClose={onCloseVideo}
            />

            <ImagePreviewPanel
                element={activeImagePreviewElement}
                metrics={activeImagePreviewMetrics}
                resolvedImageSrc={activeImagePreviewResolvedSrc}
            />
        </>
    );
}