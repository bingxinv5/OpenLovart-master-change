"use client";

import React from 'react';
import { Keyboard, X } from 'lucide-react';

export interface CanvasShortcutSection {
    title: string;
    items: Array<{
        keys: string;
        label: string;
    }>;
}

interface CanvasShortcutHelpProps {
    visible: boolean;
    sections: CanvasShortcutSection[];
    onClose: () => void;
}

export function CanvasShortcutHelp({ visible, sections, onClose }: CanvasShortcutHelpProps) {
    if (!visible) return null;

    return (
        <div className="absolute inset-0 z-[68] flex items-start justify-center bg-slate-950/22 px-4 pb-6 pt-24 backdrop-blur-sm">
            <div className="canvas-theme-panel-elevated w-full max-w-4xl overflow-hidden rounded-[28px]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
                            <Keyboard size={18} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-slate-900">快捷键总览</div>
                            <div className="text-xs text-slate-500">把高频画布操作集中放在一处，减少反复找入口。</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭快捷键面板"
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
                    {sections.map((section) => (
                        <section key={section.title} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {section.title}
                            </div>
                            <div className="space-y-2.5">
                                {section.items.map((item) => (
                                    <div key={`${section.title}-${item.keys}-${item.label}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-100">
                                        <span className="text-sm text-slate-700">{item.label}</span>
                                        <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                            {item.keys}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}