"use client";

import type { CSSProperties, MouseEvent } from 'react';
import type { CanvasElement } from './canvas-types';

const SCREENSPACE_RESIZE_HANDLE_SIZE = 10;
const SCREENSPACE_RESIZE_HIT_SIZE = 24;
const SCREENSPACE_RESIZE_EDGE_THICKNESS = 14;

const SCREENSPACE_RESIZE_HANDLE_SPECS = [
    { handle: 'nw', cursor: 'nw-resize', style: { left: 0, top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 'ne', cursor: 'ne-resize', style: { left: '100%', top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 'sw', cursor: 'sw-resize', style: { left: 0, top: '100%', transform: 'translate(-50%, -50%)' } },
    { handle: 'se', cursor: 'se-resize', style: { left: '100%', top: '100%', transform: 'translate(-50%, -50%)' } },
    { handle: 'w', cursor: 'w-resize', style: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' } },
    { handle: 'e', cursor: 'e-resize', style: { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' } },
    { handle: 'n', cursor: 'n-resize', style: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 's', cursor: 's-resize', style: { left: '50%', top: '100%', transform: 'translate(-50%, -50%)' } },
] as const satisfies ReadonlyArray<{ handle: string; cursor: CSSProperties['cursor']; style: CSSProperties }>;

const SCREENSPACE_RESIZE_EDGE_SPECS = [
    {
        handle: 'n',
        cursor: 'n-resize',
        style: {
            left: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            right: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            top: -(SCREENSPACE_RESIZE_EDGE_THICKNESS / 2),
            height: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 's',
        cursor: 's-resize',
        style: {
            left: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            right: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            top: `calc(100% - ${SCREENSPACE_RESIZE_EDGE_THICKNESS / 2}px)`,
            height: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 'w',
        cursor: 'w-resize',
        style: {
            top: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            bottom: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            left: -(SCREENSPACE_RESIZE_EDGE_THICKNESS / 2),
            width: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 'e',
        cursor: 'e-resize',
        style: {
            top: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            bottom: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            left: `calc(100% - ${SCREENSPACE_RESIZE_EDGE_THICKNESS / 2}px)`,
            width: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
] as const satisfies ReadonlyArray<{ handle: string; cursor: CSSProperties['cursor']; style: CSSProperties }>;

export interface ScreenSpaceResizeOverlayState {
    element: CanvasElement;
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ScreenSpaceResizeOverlayProps {
    overlay: ScreenSpaceResizeOverlayState;
    onResizeStart: (event: MouseEvent<HTMLDivElement>, handle: string, element: CanvasElement) => void;
}

export function canUseScreenSpaceResizeOverlayForElement(element?: CanvasElement | null) {
    if (!element) {
        return false;
    }

    return element.type !== 'connector'
        && element.type !== 'image-generator'
        && element.type !== 'video-generator'
        && element.type !== 'storyboard-planner';
}

export function ScreenSpaceResizeOverlay({ overlay, onResizeStart }: ScreenSpaceResizeOverlayProps) {
    return (
        <div
            className="pointer-events-none absolute z-[118]"
            style={{
                left: overlay.left,
                top: overlay.top,
                width: overlay.width,
                height: overlay.height,
            }}
        >
            {SCREENSPACE_RESIZE_EDGE_SPECS.map((edge) => (
                <div
                    key={`${overlay.element.id}-edge-${edge.handle}`}
                    className="pointer-events-auto absolute bg-transparent"
                    style={{
                        ...edge.style,
                        cursor: edge.cursor,
                    }}
                    onMouseDown={(event) => onResizeStart(event, edge.handle, overlay.element)}
                />
            ))}
            {SCREENSPACE_RESIZE_HANDLE_SPECS.map((handle) => (
                <div
                    key={`${overlay.element.id}-handle-${handle.handle}`}
                    className="pointer-events-auto absolute flex items-center justify-center rounded-full"
                    style={{
                        ...handle.style,
                        width: SCREENSPACE_RESIZE_HIT_SIZE,
                        height: SCREENSPACE_RESIZE_HIT_SIZE,
                        cursor: handle.cursor,
                    }}
                    onMouseDown={(event) => onResizeStart(event, handle.handle, overlay.element)}
                >
                    <div
                        className="rounded-full border border-blue-500 bg-white shadow-[0_1px_4px_rgba(37,99,235,0.28)]"
                        style={{
                            width: SCREENSPACE_RESIZE_HANDLE_SIZE,
                            height: SCREENSPACE_RESIZE_HANDLE_SIZE,
                        }}
                    />
                </div>
            ))}
        </div>
    );
}