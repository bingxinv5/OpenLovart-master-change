"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';

export interface CanvasCommandAction {
    id: string;
    label: string;
    description?: string;
    shortcut?: string;
    section: string;
    keywords?: string[];
    active?: boolean;
    perform: () => void;
}

interface CanvasCommandPaletteProps {
    visible: boolean;
    actions: CanvasCommandAction[];
    onClose: () => void;
}

function matchesAction(action: CanvasCommandAction, query: string) {
    if (!query) return true;
    const haystack = [
        action.label,
        action.description || '',
        action.section,
        ...(action.keywords || []),
        action.shortcut || '',
    ].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
}

export function CanvasCommandPalette({ visible, actions, onClose }: CanvasCommandPaletteProps) {
    if (!visible) return null;

    return <CanvasCommandPaletteContent actions={actions} onClose={onClose} />;
}

function CanvasCommandPaletteContent({ actions, onClose }: Omit<CanvasCommandPaletteProps, 'visible'>) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const filteredActions = useMemo(
        () => actions.filter((action) => matchesAction(action, query)),
        [actions, query],
    );

    const groupedActions = useMemo(() => {
        const groups = new Map<string, CanvasCommandAction[]>();
        filteredActions.forEach((action) => {
            const current = groups.get(action.section) || [];
            current.push(action);
            groups.set(action.section, current);
        });
        return Array.from(groups.entries());
    }, [filteredActions]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 30);

        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (filteredActions.length === 0) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % filteredActions.length);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => (current - 1 + filteredActions.length) % filteredActions.length);
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                const action = filteredActions[activeIndex];
                if (!action) return;
                action.perform();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeIndex, filteredActions, onClose]);

    return (
        <div className="absolute inset-0 z-[70] flex items-start justify-center bg-slate-950/28 px-4 pb-6 pt-20 backdrop-blur-sm">
            <div className="canvas-theme-panel-elevated w-full max-w-3xl overflow-hidden rounded-[28px]">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                        <Search size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">命令面板</div>
                        <div className="text-xs text-slate-500">搜索工具、视图和工作台动作，直接执行当前最常用命令。</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="关闭命令面板"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-inner shadow-slate-100/50">
                        <Search size={16} className="text-slate-400" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActiveIndex(0);
                            }}
                            placeholder="例如：图层、历史、适应屏幕、生成器、保存"
                            className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        />
                    </div>
                </div>

                <div className="max-h-[62vh] overflow-y-auto px-3 py-3">
                    {filteredActions.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
                            <div className="text-sm font-medium text-slate-700">没有匹配的命令</div>
                            <div className="mt-1 text-xs text-slate-500">换一个关键词试试，比如“缩放”、“图层”、“生成”。</div>
                        </div>
                    ) : groupedActions.map(([section, sectionActions]) => (
                        <section key={section} className="mb-4 last:mb-0">
                            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                {section}
                            </div>
                            <div className="space-y-1">
                                {sectionActions.map((action) => {
                                    const index = filteredActions.findIndex((item) => item.id === action.id);
                                    const isActive = index === activeIndex;

                                    return (
                                        <button
                                            key={action.id}
                                            type="button"
                                            onClick={() => {
                                                action.perform();
                                                onClose();
                                            }}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${isActive ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <div className={`min-w-0 flex-1 ${isActive ? 'text-white' : 'text-slate-700'}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">{action.label}</span>
                                                    {action.active && (
                                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isActive ? 'bg-white/16 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            当前启用
                                                        </span>
                                                    )}
                                                </div>
                                                {action.description && (
                                                    <div className={`mt-1 text-xs ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{action.description}</div>
                                                )}
                                            </div>
                                            {action.shortcut && (
                                                <span className={`rounded-xl px-2.5 py-1 text-[11px] font-medium ${isActive ? 'bg-white/14 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                    {action.shortcut}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-[11px] text-slate-500">
                    <div>支持方向键切换，按 Enter 执行。</div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
                        <CornerDownLeft size={12} />
                        <span>执行命令</span>
                    </div>
                </div>
            </div>
        </div>
    );
}