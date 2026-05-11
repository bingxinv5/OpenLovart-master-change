"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatCanvasZoomPercent } from '@/components/lovart/canvas-viewport-utils';

export interface ZoomControlProps {
    scale: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomTo: (value: number) => void;
    onFitToScreen: () => void;
}

export function ZoomControl({ scale, onZoomIn, onZoomOut, onZoomTo, onFitToScreen }: ZoomControlProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handler);
        }
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const presets = [
        { label: '放大', shortcut: '⌘ +', action: onZoomIn },
        { label: '缩小', shortcut: '⌘ -', action: onZoomOut },
        { label: '适合屏幕', shortcut: '⇧ 1', action: () => { onFitToScreen(); setOpen(false); } },
        { type: 'divider' as const },
        { label: '缩放至50%', action: () => { onZoomTo(0.5); setOpen(false); } },
        { label: '缩放至100%', shortcut: '⌘ 0', action: () => { onZoomTo(1); setOpen(false); } },
        { label: '缩放至200%', action: () => { onZoomTo(2); setOpen(false); } },
    ];

    return (
        <div ref={ref} className="absolute bottom-4 left-4 z-50">
            {open && (
                <div className="canvas-popover absolute bottom-full left-0 mb-2 min-w-[200px] rounded-xl p-1.5 animate-in slide-in-from-bottom-2 duration-150">
                    {presets.map((item, index) => (
                        'type' in item && item.type === 'divider' ? (
                            <div key={index} className="my-1 h-px bg-[var(--divider)]" />
                        ) : (
                            <button
                                key={index}
                                onClick={item.action}
                                className="canvas-control-button flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors"
                            >
                                <span>{item.label}</span>
                                {'shortcut' in item && item.shortcut && (
                                    <span className="ml-4 text-xs text-[var(--canvas-text-tertiary)]">{item.shortcut}</span>
                                )}
                            </button>
                        )
                    ))}
                </div>
            )}
            <div className="canvas-control-bar flex items-center rounded-lg p-1">
                <button onClick={onZoomOut} className="canvas-control-button rounded p-1.5" title="缩小 (Ctrl+-)">
                    <Minus size={16} />
                </button>
                <button
                    onClick={() => setOpen((prev) => !prev)}
                    className="canvas-control-button min-w-[3.5rem] rounded px-2 py-1 text-center text-xs font-medium"
                    title="缩放选项"
                >
                    {formatCanvasZoomPercent(scale)}
                </button>
                <button onClick={onZoomIn} className="canvas-control-button rounded p-1.5" title="放大 (Ctrl++)">
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}