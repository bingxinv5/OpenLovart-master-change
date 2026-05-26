"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Maximize2, X } from 'lucide-react';
import {
    GeneratorPromptMentionEditor,
    type GeneratorPromptMentionEditorItem,
    type PromptMentionEditorContext,
    type PromptMentionEditorHandle,
} from './GeneratorPromptMentionEditor';
import type { TextareaSelection } from './textarea-mention-utils';

interface ExpandedPromptEditorDialogProps {
    title: string;
    value: string;
    mentions: GeneratorPromptMentionEditorItem[];
    placeholder: string;
    ariaLabel: string;
    readOnly?: boolean;
    onApply: (value: string, selection: TextareaSelection) => void;
    onClose: () => void;
}

export function ExpandedPromptEditorDialog({
    title,
    value,
    mentions,
    placeholder,
    ariaLabel,
    readOnly = false,
    onApply,
    onClose,
}: ExpandedPromptEditorDialogProps) {
    const [draft, setDraft] = React.useState(value);
    const editorRef = React.useRef<PromptMentionEditorHandle>(null);
    const selectionRef = React.useRef<TextareaSelection>({ start: value.length, end: value.length });
    const isComposingRef = React.useRef(false);

    React.useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.focus();
            editor.setSelectionRange(value.length, value.length);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [value.length]);

    const applyDraft = React.useCallback((nextValue?: string, nextSelection?: TextareaSelection) => {
        const valueToApply = nextValue ?? editorRef.current?.getValue() ?? draft;
        const selectionToApply = nextSelection ?? editorRef.current?.getSelection() ?? selectionRef.current;
        onApply(valueToApply, selectionToApply);
    }, [draft, onApply]);

    const handleEditorKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>, context: PromptMentionEditorContext) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !readOnly) {
            event.preventDefault();
            applyDraft(context.value, context.selection);
        }
    }, [applyDraft, onClose, readOnly]);

    const handleSelectionChange = React.useCallback((selection: TextareaSelection) => {
        selectionRef.current = selection;
    }, []);

    const handleChange = React.useCallback((nextValue: string, selection: TextareaSelection) => {
        selectionRef.current = selection;
        setDraft(nextValue);
    }, []);

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[245] flex items-center justify-center bg-slate-950/45 px-5 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={onClose}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                }
            }}
        >
            <div
                className="expanded-prompt-editor-dialog canvas-theme-panel-elevated flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 border-b border-[var(--canvas-border)] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
                            <Maximize2 size={14} />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--canvas-text-primary)]">{title}</div>
                            <div className="text-[11px] text-[var(--canvas-text-tertiary)]">{draft.length.toLocaleString()} 字符</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="canvas-panel-close flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                        title="关闭"
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 p-4">
                    <div className="expanded-prompt-editor-surface canvas-settings-input min-h-0 rounded-2xl px-4 py-3 shadow-inner">
                        <GeneratorPromptMentionEditor
                            ref={editorRef}
                            value={draft}
                            mentions={mentions}
                            readOnly={readOnly}
                            ariaLabel={ariaLabel}
                            placeholder={placeholder}
                            onChange={handleChange}
                            onKeyDown={handleEditorKeyDown}
                            onSelectionChange={handleSelectionChange}
                            onCompositionStart={() => { isComposingRef.current = true; }}
                            onCompositionEnd={(_event, context) => {
                                isComposingRef.current = false;
                                handleChange(context.value, context.selection);
                            }}
                            onBlur={() => {
                                if (!isComposingRef.current) {
                                    selectionRef.current = editorRef.current?.getSelection() ?? selectionRef.current;
                                }
                            }}
                            className="text-[var(--canvas-text-primary)] caret-[var(--canvas-text-primary)]"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--canvas-border)] px-4 py-3">
                    <div />
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-[var(--canvas-border)] px-3 py-2 text-sm font-medium text-[var(--canvas-text-secondary)] transition-colors hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-primary)]"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => applyDraft()}
                            disabled={readOnly}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${readOnly ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        >
                            <Check size={14} />
                            应用
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}