"use client";

import React from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock3, Loader2, LocateFixed, Rows3, Wand2 } from 'lucide-react';

export interface GenerationQueueItem {
    id: string;
    kind: 'image' | 'video' | 'group';
    entityType?: 'item' | 'group';
    title: string;
    subtitle: string;
    metaChips?: string[];
    statusHint?: string;
    canResume?: boolean;
    statusLabel: string;
    progress: number;
    tone: 'submitting' | 'queued' | 'running' | 'finishing' | 'failed';
    locateTargetId?: string;
    resumeTargetIds?: string[];
}

interface GenerationQueuePanelProps {
    items: GenerationQueueItem[];
    collapsed: boolean;
    onToggleCollapsed: () => void;
    onLocateItem: (item: GenerationQueueItem) => void;
    onResumeItem?: (item: GenerationQueueItem) => void;
}

function getToneStyles(tone: GenerationQueueItem['tone']) {
    switch (tone) {
        case 'submitting':
            return {
                badge: 'bg-sky-100 text-sky-700',
                progress: 'bg-sky-500',
                dot: 'bg-sky-500',
            };
        case 'queued':
            return {
                badge: 'bg-amber-100 text-amber-700',
                progress: 'bg-amber-500',
                dot: 'bg-amber-500',
            };
        case 'running':
            return {
                badge: 'bg-violet-100 text-violet-700',
                progress: 'bg-violet-500',
                dot: 'bg-violet-500',
            };
        case 'finishing':
            return {
                badge: 'bg-emerald-100 text-emerald-700',
                progress: 'bg-emerald-500',
                dot: 'bg-emerald-500',
            };
        case 'failed':
            return {
                badge: 'bg-rose-100 text-rose-700',
                progress: 'bg-rose-500',
                dot: 'bg-rose-500',
            };
    }
}

export function GenerationQueuePanel({
    items,
    collapsed,
    onToggleCollapsed,
    onLocateItem,
    onResumeItem,
}: GenerationQueuePanelProps) {
    if (items.length === 0) {
        return null;
    }

    const actionableItems = items.filter((item) => item.entityType !== 'group');
    const runningCount = actionableItems.filter((item) => item.tone === 'running' || item.tone === 'finishing').length;
    const failedCount = actionableItems.filter((item) => item.tone === 'failed').length;

    return (
        <div className="absolute top-20 left-4 z-50 w-[300px] rounded-2xl border border-slate-200/80 bg-white/98 shadow-xl backdrop-blur-md pointer-events-auto">
            {/* Header */}
            <button
                type="button"
                onClick={onToggleCollapsed}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-slate-50/60 rounded-t-2xl"
            >
                <div className="relative flex h-6 w-6 items-center justify-center">
                    {runningCount > 0 && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />
                    )}
                    <Rows3 size={14} className="relative text-slate-700" />
                </div>
                <span className="text-[13px] font-semibold text-slate-800">生成队列</span>
                <span className="min-w-[20px] rounded-full bg-violet-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white leading-none">
                    {items.length}
                </span>
                {failedCount > 0 && (
                    <span className="min-w-[20px] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white leading-none">
                        {failedCount} 失败
                    </span>
                )}
                <div className="flex-1" />
                {collapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
            </button>

            {/* Item list */}
            {!collapsed && (
                <div className="border-t border-slate-100 max-h-[320px] overflow-y-auto panel-scroll">
                    {items.map((item, idx) => {
                        const toneStyles = getToneStyles(item.tone);
                        const isGroupRow = item.entityType === 'group';
                        const isLast = idx === items.length - 1;

                        return (
                            <div
                                key={item.id}
                                className={`relative px-3.5 py-2.5 transition-colors hover:bg-slate-50/70 ${!isLast ? 'border-b border-slate-100/80' : ''} ${isGroupRow ? 'bg-sky-50/40' : ''}`}
                            >
                                {/* Progress bar (thin stripe at top of each item) */}
                                {item.progress > 0 && item.tone !== 'failed' && (
                                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-100">
                                        <div
                                            className={`h-full transition-all duration-500 ${toneStyles.progress}`}
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                )}

                                {/* Row 1: status + title + actions */}
                                <div className="flex items-center gap-2">
                                    {/* Status indicator */}
                                    <div className="flex-shrink-0">
                                        {item.tone === 'running' || item.tone === 'submitting' ? (
                                            <Loader2 size={13} className={`animate-spin ${toneStyles.dot === 'bg-sky-500' ? 'text-sky-500' : 'text-violet-500'}`} />
                                        ) : item.tone === 'finishing' ? (
                                            <CheckCircle2 size={13} className="text-emerald-500" />
                                        ) : item.tone === 'failed' ? (
                                            <AlertCircle size={13} className="text-rose-500" />
                                        ) : (
                                            <Clock3 size={13} className="text-amber-500" />
                                        )}
                                    </div>

                                    {/* Title */}
                                    <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">
                                        {item.title}
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {item.canResume && onResumeItem && (
                                            <button
                                                type="button"
                                                onClick={() => onResumeItem(item)}
                                                className="rounded-md p-1 text-rose-500 transition-colors hover:bg-rose-50"
                                                title="继续编辑"
                                            >
                                                <Wand2 size={12} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onLocateItem(item)}
                                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                            title="定位"
                                        >
                                            <LocateFixed size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Row 2: meta chips inline */}
                                <div className="mt-1 flex items-center gap-1.5 pl-[21px]">
                                    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${toneStyles.badge}`}>
                                        {item.statusLabel}
                                    </span>
                                    {item.metaChips && item.metaChips.map((chip) => (
                                        <span key={`${item.id}-${chip}`} className="text-[10px] text-slate-400">
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}