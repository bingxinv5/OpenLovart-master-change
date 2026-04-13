'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CanvasPoint } from './canvas-types';

interface DragNumberInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    step?: number;
}

/**
 * Figma 风格可拖拽数值输入组件
 * 鼠标左右拖动改变数值，也可双击直接输入
 */
export function DragNumberInput({ label, value, onChange, min = 10, step = 1 }: DragNumberInputProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const dragStartRef = useRef<{ x: number; value: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isEditing) return;
        e.preventDefault();
        e.stopPropagation();
        dragStartRef.current = { x: e.clientX, value };

        const handleMouseMove = (me: MouseEvent) => {
            if (!dragStartRef.current) return;
            const dx = me.clientX - dragStartRef.current.x;
            const multiplier = me.shiftKey ? 10 : 1;
            const nextValue = Math.max(min, Math.round(dragStartRef.current.value + dx * step * multiplier));
            onChange(nextValue);
        };

        const handleMouseUp = () => {
            dragStartRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditValue(String(Math.round(value)));
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const commitEdit = () => {
        setIsEditing(false);
        const parsedValue = parseInt(editValue, 10) || min;
        onChange(Math.max(min, parsedValue));
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <span className="px-1.5 text-sm text-slate-400 select-none">{label}</span>
                <input
                    ref={inputRef}
                    type="number"
                    className="w-[72px] px-2.5 py-1.5 text-sm text-slate-700 bg-white border border-indigo-400 rounded-lg text-center outline-none ring-1 ring-indigo-200"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                            setEditValue(String(Math.round(value)));
                        }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    autoFocus
                />
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-1 cursor-ew-resize select-none group/drag"
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title={`拖拽调整${label}，双击输入精确值，Shift加速`}
        >
            <span className="px-1.5 text-sm text-slate-400">{label}</span>
            <div className="w-[72px] px-2.5 py-1.5 text-sm text-slate-700 bg-slate-50/80 border border-slate-200/60 rounded-lg text-center transition-colors group-hover/drag:bg-indigo-50 group-hover/drag:border-indigo-300 group-hover/drag:text-indigo-600">
                {Math.round(value)}
            </div>
        </div>
    );
}

interface StableColorInputProps {
    value?: string;
    fallbackValue: string;
    title: string;
    className?: string;
    onChange: (value: string) => void;
    onMouseDown?: React.MouseEventHandler<HTMLInputElement>;
}

function normalizeColorInputValue(value: string | undefined, fallbackValue: string) {
    const normalizedFallback = fallbackValue.toLowerCase();
    if (!value) {
        return normalizedFallback;
    }
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : normalizedFallback;
}

export function StableColorInput({ value, fallbackValue, title, className, onChange, onMouseDown }: StableColorInputProps) {
    const resolvedValue = normalizeColorInputValue(value, fallbackValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const onChangeRef = useRef(onChange);
    const fallbackValueRef = useRef(fallbackValue);
    const committedValueRef = useRef(resolvedValue);
    const isInteractingRef = useRef(false);
    const pendingValueRef = useRef<string | null>(null);
    const commitFrameRef = useRef<number | null>(null);
    const commitValueRef = useRef<(input: HTMLInputElement) => void>(() => {});

    useEffect(() => {
        onChangeRef.current = onChange;
        fallbackValueRef.current = fallbackValue;
    }, [fallbackValue, onChange]);

    commitValueRef.current = (input: HTMLInputElement) => {
        const nextValue = normalizeColorInputValue(input.value, fallbackValueRef.current);
        if (nextValue === committedValueRef.current || nextValue === pendingValueRef.current) {
            return;
        }
        pendingValueRef.current = nextValue;

        if (commitFrameRef.current !== null) {
            return;
        }

        commitFrameRef.current = window.requestAnimationFrame(() => {
            commitFrameRef.current = null;
            const queuedValue = pendingValueRef.current;
            pendingValueRef.current = null;
            if (!queuedValue || queuedValue === committedValueRef.current) {
                return;
            }
            committedValueRef.current = queuedValue;
            onChangeRef.current(queuedValue);
        });
    };

    useEffect(() => {
        return () => {
            if (commitFrameRef.current !== null) {
                window.cancelAnimationFrame(commitFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) {
            return;
        }

        const handleNativeChange = () => {
            commitValueRef.current(input);
        };

        input.addEventListener('input', handleNativeChange);
        input.addEventListener('change', handleNativeChange);

        return () => {
            input.removeEventListener('input', handleNativeChange);
            input.removeEventListener('change', handleNativeChange);
        };
    }, []);

    useEffect(() => {
        committedValueRef.current = resolvedValue;
        if (pendingValueRef.current === resolvedValue) {
            pendingValueRef.current = null;
        }
        const input = inputRef.current;
        if (!input || isInteractingRef.current || document.activeElement === input) {
            return;
        }
        if (input.value !== resolvedValue) {
            input.value = resolvedValue;
        }
    }, [resolvedValue]);

    return (
        <input
            ref={inputRef}
            type="color"
            className={className}
            defaultValue={resolvedValue}
            title={title}
            aria-label={title}
            onFocus={() => {
                isInteractingRef.current = true;
            }}
            onBlur={() => {
                isInteractingRef.current = false;
                const input = inputRef.current;
                if (input) {
                    commitValueRef.current(input);
                }
            }}
            onMouseDown={(e) => {
                isInteractingRef.current = true;
                onMouseDown?.(e);
            }}
        />
    );
}

export function renderPathPoints(points: CanvasPoint[]) {
    if (!points || points.length === 0) return '';
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}
