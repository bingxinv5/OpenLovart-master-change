"use client";

import React from 'react';
import { Film, Loader2, Search, Volume2, X, Zap } from 'lucide-react';
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
        <div className={`flex items-center justify-center ${sizeClassName} ${item.kind === 'video' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
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
                                    className={`absolute bottom-0 h-8 w-8 overflow-hidden rounded-lg border-2 border-white shadow-sm ${REFERENCE_STACK_PREVIEW_CLASSES[index] || 'left-0 z-[1]'}`}
                                >
                                    <ReferencePreviewTile item={item} sizeClassName="h-full w-full rounded-md" imageClassName="rounded-md" iconSize={10} />
                                </div>
                            ))}
                            {items.length > 3 && (
                                <div
                                    className="absolute bottom-0 left-[30px] z-[4] flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-[10px] font-medium text-slate-500 shadow-sm"
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
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600"
                            title={addButtonTitle}
                        >
                            {isAddBusy ? <Loader2 size={12} className="animate-spin" /> : <span className="text-[18px] leading-none">+</span>}
                        </button>
                    </div>
                </div>

                {items.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-end gap-1.5 transition-all duration-300 ease-out opacity-0 scale-95 pointer-events-none group-hover/refs:opacity-100 group-hover/refs:scale-100 group-hover/refs:pointer-events-auto">
                        <button
                            type="button"
                            onClick={onClear}
                            className={`relative z-20 shrink-0 self-center rounded-full p-1 transition-colors ${confirmClear ? 'bg-rose-50 text-rose-500 ring-1 ring-rose-200' : 'text-slate-300 hover:text-slate-500'}`}
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
                                    className="absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition-colors hover:bg-rose-50 hover:text-rose-500 group-hover/item:flex"
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
                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600"
                                    title={addButtonTitle}
                                >
                                    <span className="text-[24px] leading-none">+</span>
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
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500">{title}</div>
            <div className="max-h-[220px] overflow-y-auto p-2">
                {suggestions.length > 0 ? suggestions.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onApply(item)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                        {item.kind === 'video' || item.kind === 'audio' ? (
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.kind === 'video' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {item.kind === 'video' ? <Film size={16} /> : <Volume2 size={16} />}
                            </div>
                        ) : item.previewImage ? (
                            <ReferencePreviewTile item={{ id: item.id, kind: 'image', title: item.name, previewImage: item.previewImage }} sizeClassName="h-10 w-10 shrink-0 rounded-lg" imageClassName="rounded-lg" iconSize={16} />
                        ) : (
                            <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-700">{item.name}</div>
                            <div className="text-[11px] text-slate-400">{item.label}</div>
                        </div>
                    </button>
                )) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">
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
                className={`flex items-center justify-center rounded-lg px-1.5 py-1 transition-colors ${isOpen ? 'bg-sky-50 text-sky-600' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                title="任务恢复"
            >
                <Search size={13} />
            </button>
            {isOpen && (
                <div className="absolute bottom-full right-0 mb-1 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[320px] overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-700">任务恢复</div>
                    <div className="flex items-center gap-2 p-3">
                        <input
                            type="text"
                            value={taskId}
                            onChange={(event) => onTaskIdChange(event.target.value)}
                            placeholder="输入 task_id"
                            className="min-w-0 flex-1 rounded-lg border border-sky-200/80 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400"
                            disabled={isGenerating || isRecovering}
                        />
                        <button
                            type="button"
                            onClick={onRecover}
                            disabled={disabled}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
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
                    <div className="text-xs text-red-600 bg-red-50/80 border border-red-200/60 rounded-xl p-2.5 whitespace-pre-line leading-relaxed relative pr-7">
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
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
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
