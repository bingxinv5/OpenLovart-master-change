"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock3, LocateFixed, MapPin } from 'lucide-react';
import { PanelShell, PanelBadge } from './PanelShell';

type HistorySummary = {
    lastAction: string;
    patchCount: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
};

type HistoryTimelineEntry = {
    id: number;
    label: string;
    timestamp: number;
    active: boolean;
};

type HistorySidebarChunk = {
    id: string;
    label: string;
    elementCount: number;
    topFrameId?: string;
    isActive: boolean;
    isPinned: boolean;
    isResident: boolean;
};

type ChunkResidencySummary = {
    phase: 'idle' | 'hydrating' | 'releasing';
    residentChunkCount: number;
    residentElementCount: number;
    unloadedChunkCount: number;
    unloadedElementCount: number;
    lastActivatedChunkLabel?: string;
    lastReleasedChunkLabel?: string;
};

interface CanvasHistorySidebarProps {
    summary: HistorySummary;
    timeline: HistoryTimelineEntry[];
    chunks: HistorySidebarChunk[];
    residency: ChunkResidencySummary;
    onTogglePinnedChunk: (chunkId: string) => void;
    onLocateChunk?: (chunkId: string) => void;
    onClose?: () => void;
}

function toChunkTestId(chunkId: string) {
    return chunkId.replace(/[^a-z0-9_-]/gi, '-');
}

export function CanvasHistorySidebar({
    summary,
    timeline,
    chunks,
    residency,
    onTogglePinnedChunk,
    onLocateChunk,
    onClose,
}: CanvasHistorySidebarProps) {
    const pinnedCount = chunks.filter((chunk) => chunk.isPinned).length;
    const [chunksExpanded, setChunksExpanded] = useState(true);

    return (
        <PanelShell
            data-testid="history-sidebar"
            icon={<Clock3 size={12} />}
            title="历史"
            badge={
                <>
                    <PanelBadge>{summary.patchCount} 步</PanelBadge>
                    {residency.phase !== 'idle' && (
                        <span className={`inline-flex h-2 w-2 rounded-full ${residency.phase === 'hydrating' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                    )}
                </>
            }
            onClose={onClose}
        >
            {/* Stats - compact subtitle */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
                <span>指针 <span className="font-semibold text-slate-600">{Math.max(summary.currentIndex + 1, 0)}/{summary.patchCount}</span></span>
                <span className="h-2.5 w-px bg-slate-200" />
                <span>驻留 <span className="font-semibold text-slate-600">{residency.residentChunkCount} 块 · {residency.residentElementCount} 项</span></span>
                {residency.unloadedChunkCount > 0 && (
                    <>
                        <span className="h-2.5 w-px bg-slate-200" />
                        <span>卸载 <span className="font-semibold text-slate-600">{residency.unloadedChunkCount}</span></span>
                    </>
                )}
            </div>

            <div className="panel-scroll flex-1 overflow-y-auto">
                {/* Runtime status - inline */}
                {residency.phase !== 'idle' && (
                    <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[11px]">
                        <span className={`inline-flex h-1.5 w-1.5 rounded-full ${residency.phase === 'hydrating' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                        <span className="font-medium text-slate-600">{residency.phase === 'hydrating' ? '回填中' : '释放中'}</span>
                        <span className="truncate text-slate-400">
                            {residency.phase === 'hydrating' ? residency.lastActivatedChunkLabel : residency.lastReleasedChunkLabel}
                        </span>
                    </div>
                )}

                {/* Timeline */}
                <section className="border-b border-slate-100 px-3 py-2" data-testid="history-sidebar-timeline">
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-700">增量记录</span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <span className={summary.canUndo ? 'font-medium text-slate-600' : ''}>{summary.canUndo ? '可撤销' : '起点'}</span>
                            <span className="text-slate-300">/</span>
                            <span className={summary.canRedo ? 'font-medium text-slate-600' : ''}>{summary.canRedo ? '可重做' : '最新'}</span>
                        </div>
                    </div>
                    <div className="space-y-px">
                        {timeline.length === 0 ? (
                            <div className="py-3 text-center text-[11px] text-slate-400">暂无记录</div>
                        ) : timeline.map((entry) => (
                            <div
                                key={entry.id}
                                className={`flex items-center justify-between rounded-md px-2 py-1.5 transition-colors ${
                                    entry.active
                                        ? 'border-l-2 border-blue-500 bg-blue-50/80'
                                        : 'hover:bg-slate-50'
                                }`}
                            >
                                <span className={`truncate text-[12px] font-medium ${entry.active ? 'text-blue-700' : 'text-slate-700'}`}>{entry.label}</span>
                                <span className={`ml-2 flex-shrink-0 text-[10px] tabular-nums ${entry.active ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Chunks - collapsible */}
                <section className="px-3 py-2" data-testid="history-sidebar-chunks">
                    <button
                        type="button"
                        onClick={() => setChunksExpanded((prev) => !prev)}
                        className="mb-1.5 flex w-full items-center justify-between"
                    >
                        <div className="flex items-center gap-1">
                            {chunksExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                            <span className="text-[11px] font-semibold text-slate-700">分块管理</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {pinnedCount > 0 && (
                                <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-semibold text-slate-500">{pinnedCount} 固定</span>
                            )}
                            <span className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-400">{chunks.length}</span>
                        </div>
                    </button>
                    {chunksExpanded && (
                        <div className="space-y-0.5">
                            {chunks.length === 0 ? (
                                <div className="py-3 text-center text-[11px] text-slate-400">暂无分块</div>
                            ) : chunks.map((chunk) => (
                                <div
                                    key={chunk.id}
                                    className="group flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-slate-50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                                chunk.isActive ? 'bg-emerald-500' : chunk.isResident ? 'bg-sky-400' : 'bg-slate-300'
                                            }`} />
                                            <span className="truncate text-[12px] font-medium text-slate-700">{chunk.label}</span>
                                            <span className="text-[10px] text-slate-400">{chunk.elementCount}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 pl-3 text-[10px] text-slate-400">
                                            {chunk.isActive && <span className="font-medium text-emerald-600">激活</span>}
                                            {chunk.isPinned && <span className="font-medium text-blue-600">固定</span>}
                                            {!chunk.isResident && <span>已卸载</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            type="button"
                                            data-testid={`history-sidebar-pin-${toChunkTestId(chunk.id)}`}
                                            title={chunk.isPinned ? '取消固定' : '固定激活该分块'}
                                            onClick={() => onTogglePinnedChunk(chunk.id)}
                                            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                                                chunk.isPinned
                                                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                    : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600'
                                            }`}
                                        >
                                            <MapPin size={12} />
                                        </button>
                                        {onLocateChunk && chunk.topFrameId && (
                                            <button
                                                type="button"
                                                title="定位"
                                                onClick={() => onLocateChunk(chunk.id)}
                                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
                                            >
                                                <LocateFixed size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </PanelShell>
    );
}