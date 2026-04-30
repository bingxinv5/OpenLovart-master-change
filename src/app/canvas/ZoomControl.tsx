"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

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
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 min-w-[200px] animate-in slide-in-from-bottom-2 duration-150">
                    {presets.map((item, index) => (
                        'type' in item && item.type === 'divider' ? (
                            <div key={index} className="h-px bg-gray-100 my-1" />
                        ) : (
                            <button
                                key={index}
                                onClick={item.action}
                                className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                            >
                                <span>{item.label}</span>
                                {'shortcut' in item && item.shortcut && (
                                    <span className="text-xs text-gray-400 ml-4">{item.shortcut}</span>
                                )}
                            </button>
                        )
                    ))}
                </div>
            )}
            <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-100 p-1">
                <button onClick={onZoomOut} className="p-1.5 hover:bg-gray-50 rounded text-gray-500" title="缩小 (Ctrl+-)">
                    <Minus size={16} />
                </button>
                <button
                    onClick={() => setOpen((prev) => !prev)}
                    className="px-2 text-xs font-medium text-gray-600 min-w-[3rem] text-center hover:bg-gray-50 rounded py-1"
                    title="缩放选项"
                >
                    {Math.round(scale * 100)}%
                </button>
                <button onClick={onZoomIn} className="p-1.5 hover:bg-gray-50 rounded text-gray-500" title="放大 (Ctrl++)">
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}