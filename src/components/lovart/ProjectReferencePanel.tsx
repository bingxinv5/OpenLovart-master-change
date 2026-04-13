"use client";

import React, { useMemo, useState } from 'react';
import { Bookmark, CheckSquare, Copy, Image as ImageIcon, LocateFixed, Square, Trash2 } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';
import { PanelShell, PanelBadge } from './PanelShell';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';

interface ProjectReferencePanelProps {
    items: ProjectReferenceImageItem[];
    onClose?: () => void;
    onInsertItem: (item: ProjectReferenceImageItem) => void;
    onInsertItems?: (items: ProjectReferenceImageItem[]) => void;
    onLocateSource?: (item: ProjectReferenceImageItem) => void;
    onDeleteItem?: (item: ProjectReferenceImageItem) => void;
    onDeleteItems?: (items: ProjectReferenceImageItem[]) => void;
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

export function ProjectReferencePanel({
    items,
    onClose,
    onInsertItem,
    onInsertItems,
    onLocateSource,
    onDeleteItem,
    onDeleteItems,
    onClearAll,
}: ProjectReferencePanelProps) {
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
    const allSelected = items.length > 0 && selectedIds.length === items.length;

    const toggleItem = (id: string) => {
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        setSelectedIds((prev) => prev.length === items.length ? [] : items.map((item) => item.id));
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds([]);
    };

    const handleBatchInsert = () => {
        if (selectedItems.length === 0) return;
        if (onInsertItems) {
            onInsertItems(selectedItems);
        } else {
            selectedItems.forEach((item) => onInsertItem(item));
        }
        setSelectedIds([]);
        setSelectMode(false);
    };

    const handleBatchDelete = () => {
        if (selectedItems.length === 0 || !onDeleteItems) return;
        onDeleteItems(selectedItems);
        setSelectedIds([]);
        setSelectMode(false);
    };

    return (
        <PanelShell
            icon={<Bookmark size={12} />}
            title="项目参考库"
            badge={<PanelBadge>{items.length}</PanelBadge>}
            onClose={onClose}
            actions={
                <>
                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                            className={`flex h-6 items-center rounded-md px-1.5 text-[11px] font-medium transition-colors ${selectMode ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                        >
                            {selectMode ? '完成' : '选择'}
                        </button>
                    )}
                    {onClearAll && items.length > 0 && (
                        <button
                            type="button"
                            onClick={onClearAll}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            title="清空项目参考库"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </>
            }
        >
            {selectMode && items.length > 0 && (
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
                    <button
                        type="button"
                        onClick={toggleSelectAll}
                        data-testid="project-reference-select-all"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
                    >
                        {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                        {allSelected ? '取消全选' : '全选'}
                    </button>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-medium text-slate-500">{selectedIds.length} 项</span>
                            {onDeleteItems && (
                                <button
                                    type="button"
                                    onClick={handleBatchDelete}
                                    data-testid="project-reference-batch-delete"
                                    className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-red-500 hover:bg-red-50"
                                >
                                    移出
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleBatchInsert}
                                className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-700"
                            >
                                回流
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="panel-scroll flex-1 overflow-y-auto px-2 py-1.5">
                {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">
                        当前项目还没有沉淀参考图
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className={`group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${selectedIds.includes(item.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                            >
                                {selectMode && (
                                    <button
                                        type="button"
                                        onClick={() => toggleItem(item.id)}
                                        data-testid={`project-reference-select-${item.id}`}
                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${selectedIds.includes(item.id) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white hover:border-slate-400'}`}
                                    >
                                        {selectedIds.includes(item.id) && <CheckSquare size={10} />}
                                    </button>
                                )}
                                <WorkbenchImage
                                    content={item.image}
                                    alt={item.label}
                                    containerClassName="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                                    imageClassName="rounded-lg"
                                    fit="cover"
                                    showSurface={false}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12px] font-medium text-slate-800">{item.label}</div>
                                    <div className="truncate text-[11px] text-slate-400">
                                        {item.prompt ? item.prompt.slice(0, 40) : '未记录提示词'}
                                        <span className="ml-1.5">{formatRelativeTime(item.lastUsedAt || item.createdAt)}</span>
                                    </div>
                                </div>
                                {!selectMode && (
                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md bg-white/95 px-0.5 shadow-sm ring-1 ring-slate-100 opacity-0 transition-opacity group-hover:opacity-100">
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
                                        {onDeleteItem && (
                                            <button
                                                type="button"
                                                onClick={() => onDeleteItem(item)}
                                                className="rounded p-1 text-slate-400 hover:text-red-500"
                                                title="移出参考库"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onInsertItem(item)}
                                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                                            title="回流画布"
                                        >
                                            <ImageIcon size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PanelShell>
    );
}
