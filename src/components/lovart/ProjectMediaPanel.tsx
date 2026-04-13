"use client";

import React, { useMemo, useState } from 'react';
import { BookmarkPlus, Copy, Film, Image as ImageIcon, LocateFixed, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';
import { PanelShell, PanelBadge } from './PanelShell';
import type { ProjectMediaHistoryItem } from '@/lib/project-media-history';

type MediaFilter = 'all' | 'image' | 'video' | 'audio';

interface ProjectMediaPanelProps {
    items: ProjectMediaHistoryItem[];
    referenceImages?: string[];
    onClose?: () => void;
    onInsertItem: (item: ProjectMediaHistoryItem) => void;
    onLocateSource?: (item: ProjectMediaHistoryItem) => void;
    onSaveAsReference?: (item: ProjectMediaHistoryItem) => void;
    onClearAll?: () => void;
}

function formatRelativeTime(timestamp: number) {
    const diff = Date.now() - timestamp;
    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.round(hours / 24);
    return `${days} 天前`;
}

export function ProjectMediaPanel({
    items,
    referenceImages = [],
    onClose,
    onInsertItem,
    onLocateSource,
    onSaveAsReference,
    onClearAll,
}: ProjectMediaPanelProps) {
    const [filter, setFilter] = useState<MediaFilter>('all');
    const filteredItems = useMemo(() => {
        if (filter === 'all') return items;
        return items.filter((item) => item.kind === filter);
    }, [filter, items]);

    const imageCount = items.filter((item) => item.kind === 'image').length;
    const videoCount = items.filter((item) => item.kind === 'video').length;
    const audioCount = items.filter((item) => item.kind === 'audio').length;

    return (
        <PanelShell
            icon={<RefreshCw size={12} />}
            title="媒体历史"
            badge={<PanelBadge>{items.length}</PanelBadge>}
            onClose={onClose}
            actions={
                onClearAll && items.length > 0 ? (
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        title="清空项目媒体历史"
                    >
                        <Trash2 size={13} />
                    </button>
                ) : undefined
            }
        >
            <div className="flex items-center border-b border-slate-100 px-2">
                <div className="flex rounded-md bg-slate-100 p-0.5">
                    {([
                        ['all', `全部 ${items.length}`],
                        ['image', `图片 ${imageCount}`],
                        ['video', `视频 ${videoCount}`],
                        ['audio', `音频 ${audioCount}`],
                    ] as Array<[MediaFilter, string]>).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setFilter(id)}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${filter === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="panel-scroll flex-1 overflow-y-auto px-2 py-1.5">
                {filteredItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">
                        当前项目还没有沉淀媒体结果
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                className="group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                            >
                                {item.kind === 'image' ? (
                                    <WorkbenchImage
                                        content={item.content}
                                        alt={item.prompt || '项目图片历史'}
                                        containerClassName="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                                        imageClassName="rounded-lg"
                                        fit="cover"
                                        showSurface={false}
                                    />
                                ) : item.kind === 'audio' ? (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-600">
                                        <Volume2 size={16} />
                                    </div>
                                ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-800 text-white">
                                        <Film size={16} />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-[12px] font-medium text-slate-800">{item.prompt || '未记录提示词'}</span>
                                        {item.kind === 'image' && referenceImages.includes(item.content) && (
                                            <span className="shrink-0 rounded bg-emerald-50 px-1 py-px text-[9px] font-medium text-emerald-600">参考库</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                        {[item.model, item.aspectRatio, item.imageSize, item.duration].filter(Boolean).join(' · ')}
                                        <span className="ml-auto shrink-0">{formatRelativeTime(item.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md bg-white/95 px-0.5 shadow-sm ring-1 ring-slate-100 opacity-0 transition-opacity group-hover:opacity-100">
                                    {item.kind === 'image' && onSaveAsReference && !referenceImages.includes(item.content) && (
                                        <button
                                            type="button"
                                            onClick={() => onSaveAsReference(item)}
                                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                                            title="加入参考库"
                                        >
                                            <BookmarkPlus size={12} />
                                        </button>
                                    )}
                                    {item.prompt && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(item.prompt || '');
                                                } catch {
                                                    // Ignore clipboard failures.
                                                }
                                            }}
                                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                                            title="复制提示词"
                                        >
                                            <Copy size={12} />
                                        </button>
                                    )}
                                    {onLocateSource && item.sourceElementId && (
                                        <button
                                            type="button"
                                            onClick={() => onLocateSource(item)}
                                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                                            title="定位来源"
                                        >
                                            <LocateFixed size={12} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onInsertItem(item)}
                                        className="rounded p-1 text-slate-400 hover:text-slate-600"
                                        title={item.kind === 'audio' ? '复制素材地址' : '回流画布'}
                                    >
                                        {item.kind === 'image' ? <ImageIcon size={12} /> : item.kind === 'audio' ? <Copy size={12} /> : <Film size={12} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PanelShell>
    );
}