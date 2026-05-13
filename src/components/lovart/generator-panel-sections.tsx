"use client";

import React from 'react';
import { Film, Loader2, Plus, Search, Volume2, X, Zap } from 'lucide-react';
import { GeneratorStatusCard, type GeneratorStatusState } from './GeneratorStatusCard';
import { WorkbenchImage } from './WorkbenchImage';

type GeneratorKind = 'image' | 'video';
type ReferencePreviewKind = 'image' | 'video' | 'audio';

export interface GeneratorReferencePreviewItem {
    id: string;
    kind: ReferencePreviewKind;
    title: string;
    subtitle?: string;
    previewImage?: string | File;
}

interface GeneratorReferenceStackProps {
    items: GeneratorReferencePreviewItem[];
    canAddMore: boolean;
    isAddBusy?: boolean;
    addButtonTitle: string;
    confirmClear: boolean;
    clearTitle?: string;
    testId?: string;
    onAdd: () => void;
    onClear: () => void;
    onRemove: (item: GeneratorReferencePreviewItem, index: number) => void;
}

const REFERENCE_STACK_WIDTH_CLASSES = ['w-0', 'w-[32px]', 'w-[42px]', 'w-[52px]'];
const REFERENCE_STACK_PREVIEW_CLASSES = [
    'left-0 z-[1]',
    'left-[10px] z-[2]',
    'left-[20px] z-[3]',
];
const REFERENCE_STACK_DELAY_CLASSES = [
    'delay-0',
    'delay-[40ms]',
    'delay-[80ms]',
    'delay-[120ms]',
    'delay-[160ms]',
    'delay-[200ms]',
    'delay-[240ms]',
    'delay-[280ms]',
    'delay-[320ms]',
    'delay-[360ms]',
    'delay-[400ms]',
    'delay-[440ms]',
];

function ReferencePreviewTile({
    item,
    sizeClassName,
    imageClassName,
    iconSize,
}: {
    item: GeneratorReferencePreviewItem;
    sizeClassName: string;
    imageClassName: string;
    iconSize: number;
}) {
    if (item.kind === 'image' && item.previewImage) {
        const content = typeof item.previewImage === 'string' ? item.previewImage : URL.createObjectURL(item.previewImage);
        return (
            <WorkbenchImage
                content={content}
                alt={item.title}
                containerClassName={sizeClassName}
                imageClassName={imageClassName}
                fit="cover"
                showSurface={false}
                onLoad={(event) => {
                    if (typeof item.previewImage !== 'string') {
                        URL.revokeObjectURL((event.target as HTMLImageElement).src);
                    }
                }}
            />
        );
    }

    return (
        <div className={`flex items-center justify-center ${sizeClassName} ${item.kind === 'video' ? 'bg-slate-900 text-white' : 'canvas-reference-audio-tile'}`}>
            {item.kind === 'video' ? <Film size={iconSize} /> : <Volume2 size={iconSize} />}
        </div>
    );
}

export function GeneratorReferenceStack({
    items,
    canAddMore,
    isAddBusy = false,
    addButtonTitle,
    confirmClear,
    clearTitle = '清空素材',
    testId,
    onAdd,
    onClear,
    onRemove,
}: GeneratorReferenceStackProps) {
    return (
        <div
            className={`${items.length > 0 ? 'group/refs' : ''} relative px-3 pb-2.5`}
            data-testid={testId}
            data-reference-count={items.length}
        >
            <div className="relative min-h-8">
                <div className={`relative z-0 flex items-end gap-1 transition-all duration-300 ease-out ${items.length > 0 ? 'group-hover/refs:opacity-0 group-hover/refs:scale-95 group-hover/refs:pointer-events-none' : ''}`}>
                    {items.length > 0 && (
                        <div
                            className={`relative flex h-8 items-end ${REFERENCE_STACK_WIDTH_CLASSES[Math.min(items.length, 3)] || 'w-[52px]'}`}
                        >
                            {items.slice(0, 3).map((item, index) => (
                                <div
                                    key={item.id}
                                    className={`canvas-reference-tile-border absolute bottom-0 h-8 w-8 overflow-hidden rounded-lg border-2 shadow-sm ${REFERENCE_STACK_PREVIEW_CLASSES[index] || 'left-0 z-[1]'}`}
                                >
                                    <ReferencePreviewTile item={item} sizeClassName="h-full w-full rounded-md" imageClassName="rounded-md" iconSize={10} />
                                </div>
                            ))}
                            {items.length > 3 && (
                                <div
                                    className="canvas-reference-tile-border canvas-reference-audio-tile absolute bottom-0 left-[30px] z-[4] flex h-8 w-8 items-center justify-center rounded-lg border-2 text-[10px] font-medium shadow-sm"
                                >
                                    +{items.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="relative shrink-0" data-popover-menu>
                        <button
                            type="button"
                            onClick={onAdd}
                            className="canvas-reference-add-button flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                            title={addButtonTitle}
                        >
                            {isAddBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={14} strokeWidth={2.25} className="shrink-0" />}
                        </button>
                    </div>
                </div>

                {items.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-end gap-1.5 transition-all duration-300 ease-out opacity-0 scale-95 pointer-events-none group-hover/refs:opacity-100 group-hover/refs:scale-100 group-hover/refs:pointer-events-auto">
                        <button
                            type="button"
                            onClick={onClear}
                            className={`relative z-20 shrink-0 self-center rounded-full p-1 transition-colors ${confirmClear ? 'canvas-danger-soft' : 'text-slate-300 hover:text-slate-500'}`}
                            title={confirmClear ? '再次点击确认清空' : clearTitle}
                        >
                            <X size={14} />
                        </button>
                        {items.map((item, index) => (
                            <div
                                key={item.id}
                                className={`group/item relative shrink-0 transition-all duration-300 ease-out ${REFERENCE_STACK_DELAY_CLASSES[index] || 'delay-[440ms]'}`}
                                title={`${item.title}${item.subtitle ? ` · ${item.subtitle}` : ''}`}
                            >
                                <ReferencePreviewTile item={item} sizeClassName="h-10 w-10 rounded-xl border border-slate-200/60" imageClassName="rounded-xl" iconSize={14} />
                                <button
                                    type="button"
                                    onClick={() => onRemove(item, index)}
                                    className="canvas-reference-remove-button absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center rounded-full transition-colors group-hover/item:flex"
                                    title={`移除${item.subtitle || item.title}`}
                                >
                                    <X size={9} />
                                </button>
                            </div>
                        ))}
                        {canAddMore && !isAddBusy && (
                            <div className="relative shrink-0" data-popover-menu>
                                <button
                                    type="button"
                                    onClick={onAdd}
                                    className="canvas-reference-add-button flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                                    title={addButtonTitle}
                                >
                                    <Plus size={18} strokeWidth={2.25} className="shrink-0" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export interface GeneratorMentionSuggestionItem {
    id: string;
    name: string;
    label: string;
    kind?: ReferencePreviewKind;
    previewImage?: string | File;
}

export function MentionComposerSuggestions({
    title,
    suggestions,
    emptyText,
    onApply,
}: {
    title: string;
    suggestions: GeneratorMentionSuggestionItem[];
    emptyText: string;
    onApply: (item: GeneratorMentionSuggestionItem) => void;
}) {
    return (
        <div className="canvas-popover absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl">
            <div className="border-b border-[var(--canvas-border)] px-3 py-2 text-[11px] font-medium text-[var(--canvas-text-secondary)]">{title}</div>
            <div className="max-h-[220px] overflow-y-auto p-2">
                {suggestions.length > 0 ? suggestions.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onApply(item)}
                        className="canvas-menu-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                    >
                        {item.kind === 'video' || item.kind === 'audio' ? (
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.kind === 'video' ? 'bg-slate-900 text-white' : 'canvas-reference-audio-tile'}`}>
                                {item.kind === 'video' ? <Film size={16} /> : <Volume2 size={16} />}
                            </div>
                        ) : item.previewImage ? (
                            <ReferencePreviewTile item={{ id: item.id, kind: 'image', title: item.name, previewImage: item.previewImage }} sizeClassName="h-10 w-10 shrink-0 rounded-lg" imageClassName="rounded-lg" iconSize={16} />
                        ) : (
                            <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--canvas-surface-subtle)]" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[var(--canvas-text-primary)]">{item.name}</div>
                            <div className="text-[11px] text-[var(--canvas-text-tertiary)]">{item.label}</div>
                        </div>
                    </button>
                )) : (
                    <div className="rounded-xl border border-dashed border-[var(--canvas-border)] px-3 py-5 text-center text-[12px] text-[var(--canvas-text-tertiary)]">
                        {emptyText}
                    </div>
                )}
            </div>
        </div>
    );
}

export function GeneratorRecoveryTaskCard({
    isOpen,
    taskId,
    isGenerating,
    isRecovering,
    onToggle,
    onTaskIdChange,
    onRecover,
}: {
    isOpen: boolean;
    taskId: string;
    isGenerating: boolean;
    isRecovering: boolean;
    onToggle: () => void;
    onTaskIdChange: (value: string) => void;
    onRecover: () => void;
}) {
    const disabled = !taskId.trim() || isGenerating || isRecovering;

    return (
        <div className="relative" data-popover-menu>
            <button
                type="button"
                onClick={onToggle}
                className={`canvas-control-button flex items-center justify-center rounded-lg px-1.5 py-1 transition-colors ${isOpen ? 'is-active' : ''}`}
                title="任务恢复"
            >
                <Search size={13} />
            </button>
            {isOpen && (
                <div className="canvas-popover absolute bottom-full right-0 mb-1 rounded-2xl z-30 w-[320px] overflow-hidden">
                    <div className="px-3 py-2 border-b border-[var(--canvas-border)] text-xs font-medium text-[var(--canvas-text-primary)]">任务恢复</div>
                    <div className="flex items-center gap-2 p-3">
                        <input
                            type="text"
                            value={taskId}
                            onChange={(event) => onTaskIdChange(event.target.value)}
                            placeholder="输入 task_id"
                            className="canvas-settings-input min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-[var(--canvas-text-tertiary)]"
                            disabled={isGenerating || isRecovering}
                        />
                        <button
                            type="button"
                            onClick={onRecover}
                            disabled={disabled}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${disabled ? 'cursor-not-allowed bg-[var(--canvas-hover)] text-[var(--canvas-text-tertiary)]' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                        >
                            {isRecovering ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                            <span>{isRecovering ? '查询中' : '接管'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function GeneratorStatusSection({
    kind,
    state,
    error,
    onClearError,
}: {
    kind: GeneratorKind;
    state: GeneratorStatusState;
    error: string | null;
    onClearError: () => void;
}) {
    return (
        <>
            <GeneratorStatusCard kind={kind} state={state} />
            {error && (
                <div className="px-3 pb-2">
                    <div className="canvas-danger-soft text-xs rounded-xl p-2.5 whitespace-pre-line leading-relaxed relative pr-7">
                        {error}
                        <button
                            onClick={onClearError}
                            className="absolute top-2 right-2 text-red-300 hover:text-red-500 transition-colors"
                            title="关闭"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export function GeneratorSubmitButton({
    disabled,
    busy,
    label,
    busyLabel,
    onClick,
}: {
    disabled: boolean;
    busy: boolean;
    label: string;
    busyLabel?: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-all ${
                !disabled
                    ? 'bg-slate-700 text-white hover:bg-slate-600 active:scale-[0.97]'
                    : 'bg-[var(--canvas-hover)] text-[var(--canvas-text-tertiary)] cursor-not-allowed'
            }`}
        >
            {busy ? (
                <Loader2 size={14} className="animate-spin" />
            ) : (
                <Zap size={14} className="fill-current" />
            )}
            <span className="font-medium">{busy && busyLabel ? busyLabel : label}</span>
        </button>
    );
}
