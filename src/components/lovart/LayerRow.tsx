import React from 'react';
import {
    AlertCircle,
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    Eye,
    EyeOff,
    Frame,
    GripVertical,
    Image as ImageIcon,
    Lock,
    Pencil,
    Shapes,
    Sparkles,
    Square,
    Trash2,
    Type,
    Unlock,
    Video,
} from 'lucide-react';
import type { StoryboardMetaTemplateEntry, StoryboardMetaTemplateValue } from '@/lib/storyboard-meta-presets';
import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';
import { getLayerDropPlacement, type LayerDropIndicator, type LayerParentDropTarget } from './layers-dnd-model';
import { getLayerLabel, type FlattenedLayerRow } from './layers-tree-model';
import { getStoryboardSummaryParts, isElementLocked, type StoryboardDraftKey, type StoryboardDraftValue } from './layers-panel-utils';

function LayerTypeIcon({ element, size }: { element: CanvasElement; size: number }) {
    switch (element.type) {
        case 'image':
            return <ImageIcon size={size} />;
        case 'text':
            return <Type size={size} />;
        case 'shape':
            return <Shapes size={size} />;
        case 'path':
            return <Pencil size={size} />;
        case 'video':
            return <Video size={size} />;
        case 'image-generator':
        case 'video-generator':
            return <Sparkles size={size} />;
        case 'frame':
            return <Frame size={size} />;
        default:
            return <Square size={size} />;
    }
}

function StoryboardMetaEditor({
    depth,
    hasValidationError,
    children,
}: {
    depth: number;
    hasValidationError: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`mt-1 rounded-md border bg-white p-2.5 shadow-sm ${hasValidationError ? 'border-rose-200' : 'border-slate-200'}`}
            style={{ marginLeft: `${depth * 12 + 30}px` }}
        >
            {children}
        </div>
    );
}

export interface LayerRowProps {
    row: FlattenedLayerRow;
    selectedIdSet: ReadonlySet<string>;
    highlightedIdSet: ReadonlySet<string>;
    draggingId: string | null;
    dropIndicator: LayerDropIndicator | null;
    parentDropTarget: LayerParentDropTarget;
    editingNameId: string | null;
    editingNameValue: string;
    storyboardTemplates: StoryboardMetaTemplateEntry[];
    getStoryboardDraft: (element: CanvasElement) => StoryboardDraftValue;
    onToggleExpanded: (id: string) => void;
    onSelect: (event: React.MouseEvent<HTMLButtonElement>, id: string) => void;
    onLocate: (id: string) => void;
    onStartRename: (element: CanvasElement) => void;
    onSetEditingNameValue: (value: string) => void;
    onCancelRename: () => void;
    onCommitRename: () => void;
    onUpdateStoryboardDraft: (id: string, key: StoryboardDraftKey, value: string, element: CanvasElement) => void;
    onCommitStoryboardDraft: (id: string, element: CanvasElement) => void;
    onResetStoryboardDraft: (id: string) => void;
    onApplyStoryboardTemplateToElement: (element: CanvasElement, templateValue: StoryboardMetaTemplateValue) => void;
    onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
    onDragEnd: () => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>, targetId: string, placement: 'before' | 'after') => void;
    onUpdateDragAutoScroll: (clientY: number) => void;
    onDropIndicatorChange: React.Dispatch<React.SetStateAction<LayerDropIndicator | null>>;
    onParentDropTargetChange: React.Dispatch<React.SetStateAction<LayerParentDropTarget>>;
    onUpdateRowDropIndicator: (event: React.DragEvent<HTMLDivElement>, targetId: string) => void;
    onMoveToParentDrop: (event: React.DragEvent<HTMLDivElement>, parentId?: string) => void;
    onToggleHidden: (ids: string[]) => void;
    onToggleLocked: (ids: string[]) => void;
    onBringForward: (ids: string[]) => void;
    onSendBackward: (ids: string[]) => void;
    onBringToFront: (ids: string[]) => void;
    onSendToBack: (ids: string[]) => void;
    onDeleteSelection: (ids: string[]) => void;
}

export function LayerRow({
    row,
    selectedIdSet,
    highlightedIdSet,
    draggingId,
    dropIndicator,
    parentDropTarget,
    editingNameId,
    editingNameValue,
    storyboardTemplates,
    getStoryboardDraft,
    onToggleExpanded,
    onSelect,
    onLocate,
    onStartRename,
    onSetEditingNameValue,
    onCancelRename,
    onCommitRename,
    onUpdateStoryboardDraft,
    onCommitStoryboardDraft,
    onResetStoryboardDraft,
    onApplyStoryboardTemplateToElement,
    onDragStart,
    onDragEnd,
    onDrop,
    onUpdateDragAutoScroll,
    onDropIndicatorChange,
    onParentDropTargetChange,
    onUpdateRowDropIndicator,
    onMoveToParentDrop,
    onToggleHidden,
    onToggleLocked,
    onBringForward,
    onSendBackward,
    onBringToFront,
    onSendToBack,
    onDeleteSelection,
}: LayerRowProps) {
    const { element, children, depth, hasChildren, expanded, top, height } = row;
    const selected = selectedIdSet.has(element.id);
    const locked = isElementLocked(element);
    const hidden = !!element.hidden;
    const isDragging = draggingId === element.id;
    const isHighlighted = highlightedIdSet.has(element.id);
    const storyboardDraft = getStoryboardDraft(element);
    const storyboardShotCodeError = validateStoryboardShotCode(storyboardDraft.storyboardShotCode);
    const storyboardDurationError = validateStoryboardDuration(storyboardDraft.storyboardDuration);
    const hasStoryboardValidationError = !!(storyboardShotCodeError || storyboardDurationError);
    const showStoryboardEditor = selected && element.type === 'image';
    const storyboardSummaryParts = getStoryboardSummaryParts(element);
    const storyboardNote = element.storyboardNote?.trim();

    return (
        <div
            className="absolute left-0 right-0"
            style={{ transform: `translateY(${top}px)`, height: `${height}px` }}
        >
            <div
                data-testid={`layer-drop-before-${element.id}`}
                className={`h-1 rounded-full transition-all ${dropIndicator?.targetId === element.id && dropIndicator.placement === 'before' ? 'bg-blue-400/80' : 'bg-transparent'}`}
                style={{ marginLeft: `${depth * 12 + 8}px` }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!draggingId || draggingId === element.id) return;
                    onUpdateDragAutoScroll(event.clientY);
                    onDropIndicatorChange({ targetId: element.id, placement: 'before' });
                }}
                onDragLeave={() => {
                    onDropIndicatorChange((prev) => prev?.targetId === element.id && prev.placement === 'before' ? null : prev);
                }}
                onDrop={(event) => onDrop(event, element.id, 'before')}
            />
            <div
                data-testid={`layer-row-${element.id}`}
                onDragOver={(event) => onUpdateRowDropIndicator(event, element.id)}
                onDrop={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const placement = getLayerDropPlacement(event.clientY, rect.top, rect.height);
                    onDrop(event, element.id, placement);
                }}
                className={`group relative flex items-center gap-1 rounded-md border px-1 py-1 transition-all duration-200 ${selected ? 'border-blue-200 bg-blue-50/70' : 'border-transparent bg-white/80 hover:border-slate-200 hover:bg-white'} ${isHighlighted ? 'border-amber-300 bg-amber-50/95 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]' : ''} ${hidden ? 'opacity-60' : ''} ${isDragging ? 'opacity-40' : ''}`}
                style={{ marginLeft: `${depth * 12}px` }}
            >
                <div
                    data-testid={`layer-drag-${element.id}`}
                    draggable={editingNameId !== element.id}
                    onDragStart={(event) => onDragStart(event, element.id)}
                    onDragEnd={onDragEnd}
                    className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                    title="拖拽排序或跨画板移动图层"
                >
                    <GripVertical size={12} />
                </div>
                <button
                    type="button"
                    aria-label={hasChildren ? (expanded ? '收起图层分组' : '展开图层分组') : '图层无子项'}
                    onClick={() => hasChildren && onToggleExpanded(element.id)}
                    className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors ${hasChildren ? 'hover:text-slate-700' : 'cursor-default opacity-30'}`}
                >
                    {hasChildren ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="h-1.5 w-1.5" />}
                </button>

                <button
                    type="button"
                    data-testid={`layer-select-${element.id}`}
                    onClick={(event) => onSelect(event, element.id)}
                    onDoubleClick={() => onLocate(element.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left"
                >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${selected ? 'bg-violet-100 text-blue-700 ring-violet-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                        <LayerTypeIcon element={element} size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                            {editingNameId === element.id ? (
                                <input
                                    data-testid={`layer-name-input-${element.id}`}
                                    value={editingNameValue}
                                    autoFocus
                                    onChange={(event) => onSetEditingNameValue(event.target.value)}
                                    onBlur={onCommitRename}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === 'Enter') onCommitRename();
                                        if (event.key === 'Escape') {
                                            onCancelRename();
                                        }
                                    }}
                                    className="h-6 min-w-0 max-w-[160px] rounded border border-blue-200 bg-white px-1.5 text-[12px] font-medium text-slate-800 outline-none ring-2 ring-blue-100"
                                />
                            ) : (
                                <span
                                    className="truncate text-[12px] font-medium text-slate-800"
                                    title="双击重命名"
                                    onDoubleClick={(event) => {
                                        event.stopPropagation();
                                        onStartRename(element);
                                    }}
                                >
                                    {getLayerLabel(element)}
                                </span>
                            )}
                            {element.groupFrame && (
                                <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-semibold text-blue-700">组</span>
                            )}
                            {element.type === 'frame' && !element.groupFrame && (
                                <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold text-sky-700">板</span>
                            )}
                            {hidden && <span className="rounded bg-slate-100 px-1 py-px text-[9px] text-slate-500">隐</span>}
                            {locked && <span className="rounded bg-amber-50 px-1 py-px text-[9px] text-amber-600">锁</span>}
                            {hasChildren && <span className="text-[9px] text-slate-400">{children.length}</span>}
                        </div>
                        {element.type === 'image' && (storyboardSummaryParts.length > 0 || storyboardNote) && (
                            <div className="mt-px flex flex-wrap items-center gap-0.5">
                                {storyboardSummaryParts.map((part, index) => (
                                    <span
                                        key={`${element.id}-storyboard-${index}-${part}`}
                                        className="rounded border border-amber-200/70 bg-amber-50/80 px-1 py-px text-[8px] font-medium text-amber-700"
                                    >
                                        {part}
                                    </span>
                                ))}
                                {storyboardNote && (
                                    <span
                                        className="max-w-[120px] truncate rounded border border-slate-200/70 bg-slate-50/80 px-1 py-px text-[8px] text-slate-500"
                                        title={storyboardNote}
                                    >
                                        {storyboardNote}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </button>

                <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-lg bg-white/95 shadow-sm ring-1 ring-slate-100 px-0.5 backdrop-blur-sm transition-opacity ${selected ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
                    <button
                        type="button"
                        title={hidden ? '显示图层' : '隐藏图层'}
                        aria-label={hidden ? '显示图层' : '隐藏图层'}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleHidden([element.id]);
                        }}
                        className={`rounded p-1 transition-colors ${hidden ? 'text-slate-600 hover:text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                        type="button"
                        title={locked ? '解锁图层' : '锁定图层'}
                        aria-label={locked ? '解锁图层' : '锁定图层'}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleLocked([element.id]);
                        }}
                        className={`rounded p-1 transition-colors ${locked ? 'text-amber-600 hover:text-amber-700' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {locked ? <Unlock size={13} /> : <Lock size={13} />}
                    </button>
                    <button
                        type="button"
                        data-testid={`layer-rename-${element.id}`}
                        title="重命名图层"
                        aria-label="重命名图层"
                        onClick={(event) => {
                            event.stopPropagation();
                            onStartRename(element);
                        }}
                        className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
                    >
                        <Pencil size={13} />
                    </button>
                    <button
                        type="button"
                        data-testid={`layer-delete-${element.id}`}
                        title="删除图层"
                        aria-label="删除图层"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSelection([element.id]);
                        }}
                        className="rounded p-1 text-slate-400 transition-colors hover:text-red-500"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
            <div
                data-testid={`layer-drop-after-${element.id}`}
                className={`h-2 rounded-full transition-all ${dropIndicator?.targetId === element.id && dropIndicator.placement === 'after' ? 'bg-violet-400/80' : 'bg-transparent'}`}
                style={{ marginLeft: `${depth * 14 + 10}px` }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!draggingId || draggingId === element.id) return;
                    onUpdateDragAutoScroll(event.clientY);
                    onDropIndicatorChange({ targetId: element.id, placement: 'after' });
                }}
                onDragLeave={() => {
                    onDropIndicatorChange((prev) => prev?.targetId === element.id && prev.placement === 'after' ? null : prev);
                }}
                onDrop={(event) => onDrop(event, element.id, 'after')}
            />

            {element.type === 'frame' && draggingId !== element.id && (
                <div
                    data-testid={`layer-nest-target-${element.id}`}
                    className={`ml-10 rounded-2xl border border-dashed text-[11px] font-medium transition-all ${draggingId ? 'px-3 py-2' : 'min-h-[8px] px-0 py-0 border-transparent bg-transparent text-transparent'} ${parentDropTarget === element.id ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : draggingId ? 'border-slate-200 bg-slate-50/80 text-slate-500' : ''}`}
                    style={{ marginLeft: `${depth * 14 + 42}px` }}
                    onDragOver={(event) => {
                        if (!draggingId) return;
                        event.preventDefault();
                        onUpdateDragAutoScroll(event.clientY);
                        onParentDropTargetChange(element.id);
                        onDropIndicatorChange(null);
                    }}
                    onDragLeave={() => {
                        onParentDropTargetChange((prev) => prev === element.id ? null : prev);
                    }}
                    onDrop={(event) => onMoveToParentDrop(event, element.id)}
                >
                    拖到这里加入“{getLayerLabel(element)}”
                </div>
            )}

            {selected && (
                <div className="flex items-center gap-0.5 py-0.5" style={{ marginLeft: `${depth * 12 + 30}px` }}>
                    <button
                        type="button"
                        title="上移一层"
                        aria-label="上移一层"
                        onClick={() => onBringForward([element.id])}
                        className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                    >
                        <ArrowUp size={12} />
                    </button>
                    <button
                        type="button"
                        title="下移一层"
                        aria-label="下移一层"
                        onClick={() => onSendBackward([element.id])}
                        className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                    >
                        <ArrowDown size={12} />
                    </button>
                    <button
                        type="button"
                        title="置于顶层"
                        aria-label="置于顶层"
                        onClick={() => onBringToFront([element.id])}
                        className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                    >
                        <ChevronsUp size={12} />
                    </button>
                    <button
                        type="button"
                        title="置于底层"
                        aria-label="置于底层"
                        onClick={() => onSendToBack([element.id])}
                        className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                    >
                        <ChevronsDown size={12} />
                    </button>
                </div>
            )}

            {showStoryboardEditor && (
                <StoryboardMetaEditor depth={depth} hasValidationError={hasStoryboardValidationError}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <div className="text-[11px] font-semibold text-slate-700">分镜字段</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {hasStoryboardValidationError && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                    <AlertCircle size={10} />
                                    需校验
                                </span>
                            )}
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">快捷编辑</span>
                        </div>
                    </div>

                    {hasStoryboardValidationError && (
                        <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-700">
                            镜头号或时长格式不符合约定，修正后会自动保存。
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${storyboardShotCodeError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                            <div className="text-[10px] font-medium text-slate-500">镜头号</div>
                            <input
                                type="text"
                                value={storyboardDraft.storyboardShotCode}
                                onChange={(event) => onUpdateStoryboardDraft(element.id, 'storyboardShotCode', event.target.value, element)}
                                onBlur={() => onCommitStoryboardDraft(element.id, element)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        onCommitStoryboardDraft(element.id, element);
                                    }
                                    if (event.key === 'Escape') {
                                        onResetStoryboardDraft(element.id);
                                    }
                                }}
                                placeholder="A01"
                                className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                            {storyboardShotCodeError && (
                                <div className="mt-1 text-[10px] leading-4 text-rose-600">{storyboardShotCodeError}</div>
                            )}
                        </label>
                        <label className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                            <div className="text-[10px] font-medium text-slate-500">景别</div>
                            <input
                                type="text"
                                value={storyboardDraft.storyboardSceneType}
                                onChange={(event) => onUpdateStoryboardDraft(element.id, 'storyboardSceneType', event.target.value, element)}
                                onBlur={() => onCommitStoryboardDraft(element.id, element)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        onCommitStoryboardDraft(element.id, element);
                                    }
                                    if (event.key === 'Escape') {
                                        onResetStoryboardDraft(element.id);
                                    }
                                }}
                                placeholder="中景"
                                className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                        </label>
                        <label className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                            <div className="text-[10px] font-medium text-slate-500">运镜</div>
                            <input
                                type="text"
                                value={storyboardDraft.storyboardCameraMove}
                                onChange={(event) => onUpdateStoryboardDraft(element.id, 'storyboardCameraMove', event.target.value, element)}
                                onBlur={() => onCommitStoryboardDraft(element.id, element)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        onCommitStoryboardDraft(element.id, element);
                                    }
                                    if (event.key === 'Escape') {
                                        onResetStoryboardDraft(element.id);
                                    }
                                }}
                                placeholder="推镜"
                                className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                        </label>
                        <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${storyboardDurationError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                            <div className="text-[10px] font-medium text-slate-500">时长</div>
                            <input
                                type="text"
                                value={storyboardDraft.storyboardDuration}
                                onChange={(event) => onUpdateStoryboardDraft(element.id, 'storyboardDuration', event.target.value, element)}
                                onBlur={() => onCommitStoryboardDraft(element.id, element)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        onCommitStoryboardDraft(element.id, element);
                                    }
                                    if (event.key === 'Escape') {
                                        onResetStoryboardDraft(element.id);
                                    }
                                }}
                                placeholder="3s"
                                className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                            {storyboardDurationError && (
                                <div className="mt-1 text-[10px] leading-4 text-rose-600">{storyboardDurationError}</div>
                            )}
                        </label>
                    </div>

                    <label className="mt-2 block rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                        <div className="text-[10px] font-medium text-slate-500">备注</div>
                        <input
                            type="text"
                            value={storyboardDraft.storyboardNote}
                            onChange={(event) => onUpdateStoryboardDraft(element.id, 'storyboardNote', event.target.value, element)}
                            onBlur={() => onCommitStoryboardDraft(element.id, element)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    onCommitStoryboardDraft(element.id, element);
                                }
                                if (event.key === 'Escape') {
                                    onResetStoryboardDraft(element.id);
                                }
                            }}
                            placeholder="补充剧情动作或画面说明"
                            className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                        />
                    </label>

                    {storyboardTemplates.length > 0 && (
                        <div className="mt-2 rounded-md border border-sky-100 bg-sky-50/60 px-2.5 py-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div>
                                    <div className="text-[10px] font-semibold tracking-[0.08em] text-sky-700">模板快速套用</div>
                                    <div className="text-[10px] text-sky-500">点击模板即可将字段填入当前分镜。</div>
                                </div>
                                <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-sky-600 ring-1 ring-sky-100">{storyboardTemplates.length} 个模板</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {storyboardTemplates.slice(0, 6).map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => onApplyStoryboardTemplateToElement(element, template.value)}
                                        className="group rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                                        title={[
                                            template.value.storyboardSceneType,
                                            template.value.storyboardCameraMove,
                                            template.value.storyboardDuration,
                                            template.value.storyboardNote,
                                        ].filter(Boolean).join(' · ') || template.name}
                                    >
                                        {template.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </StoryboardMetaEditor>
            )}
        </div>
    );
}