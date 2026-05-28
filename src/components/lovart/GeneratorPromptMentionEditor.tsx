"use client";

import React from 'react';
import { cachedDataUrlToBlobUrl } from '@/lib/blob-utils';
import { getImageBlobUrlWithLODResolution, isImageRef } from '@/lib/editor-kernel';
import { buildPromptComposerSegments, type PromptMentionLike } from './generator-mention-view-model';
import type { GeneratorReferencePreviewItem } from './generator-panel-sections';
import { resolveNewlineDeletionRange, resolveTokenDeletionRange, type TextareaSelection } from './textarea-mention-utils';

const MENTION_TOKEN_ATTRIBUTE = 'data-prompt-mention-token';
const ZERO_WIDTH_CARET_ANCHOR = '\u200b';
const ZERO_WIDTH_CARET_ANCHOR_REGEX = /\u200b/g;
const ASCII_WORD_CHAR_REGEX = /[A-Za-z0-9]/;
const MENTION_CHIP_CLASS_NAME = 'mx-0.5 inline-flex h-6 max-w-[180px] select-none items-center gap-1 overflow-hidden rounded-md border border-sky-200/90 bg-sky-50 px-1.5 text-[11px] font-semibold leading-none text-sky-700 shadow-sm align-[-0.25em]';
const MENTION_THUMB_CLASS_NAME = 'flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded bg-white/70 text-[8px] leading-none text-sky-700';
const MENTION_LABEL_CLASS_NAME = 'min-w-0 flex-1 truncate';

export interface GeneratorPromptMentionEditorItem extends PromptMentionLike {
    id: string;
    name: string;
    label: string;
    token: string;
    kind?: GeneratorReferencePreviewItem['kind'];
    previewImage?: string | File;
}

export interface PromptMentionEditorHandle {
    focus: () => void;
    getValue: () => string;
    getSelection: () => TextareaSelection;
    setSelectionRange: (start: number, end: number) => void;
    commitValue: (nextValue: string, selection: TextareaSelection) => void;
}

export type PromptMentionEditorContext = {
    value: string;
    selection: TextareaSelection;
};

interface GeneratorPromptMentionEditorProps {
    value: string;
    mentions: GeneratorPromptMentionEditorItem[];
    readOnly?: boolean;
    ariaLabel: string;
    placeholder: string;
    className?: string;
    placeholderClassName?: string;
    onChange: (value: string, selection: TextareaSelection) => void;
    onSelectionChange: (selection: TextareaSelection) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onCompositionStart: () => void;
    onCompositionEnd: (event: React.CompositionEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onBlur: () => void;
}

function isElementNode(node: Node | null): node is Element {
    return !!node && node.nodeType === Node.ELEMENT_NODE;
}

function isTextNode(node: Node | null): node is Text {
    return !!node && node.nodeType === Node.TEXT_NODE;
}

function getMentionToken(element: Element | null): string | null {
    return element instanceof HTMLElement ? element.getAttribute(MENTION_TOKEN_ATTRIBUTE) : null;
}

function findMentionElement(node: Node | null, root: HTMLElement): HTMLElement | null {
    let current: Element | null = isElementNode(node) ? node : node?.parentElement ?? null;
    while (current && current !== root) {
        if (getMentionToken(current)) {
            return current as HTMLElement;
        }
        current = current.parentElement;
    }
    return null;
}

function getChildIndex(node: Node): number {
    let index = 0;
    let current = node.previousSibling;
    while (current) {
        index += 1;
        current = current.previousSibling;
    }
    return index;
}

function getTextModelLength(text: string): number {
    return text.replace(ZERO_WIDTH_CARET_ANCHOR_REGEX, '').length;
}

function getTextModelOffsetFromDomOffset(text: string, domOffset: number): number {
    const safeDomOffset = Math.max(0, Math.min(domOffset, text.length));
    return getTextModelLength(text.slice(0, safeDomOffset));
}

function getTextDomOffsetFromModelOffset(text: string, modelOffset: number): number {
    const safeModelOffset = Math.max(0, modelOffset);
    let modelCursor = 0;
    let domCursor = 0;

    while (domCursor < text.length) {
        const char = text.charAt(domCursor);
        if (char === ZERO_WIDTH_CARET_ANCHOR) {
            domCursor += 1;
            continue;
        }

        if (modelCursor >= safeModelOffset) {
            return domCursor;
        }

        modelCursor += 1;
        domCursor += 1;
    }

    return domCursor;
}

function getNodeTextLength(node: Node): number {
    if (isTextNode(node)) {
        return getTextModelLength(node.textContent ?? '');
    }

    if (isElementNode(node)) {
        const token = getMentionToken(node);
        if (token) {
            return token.length;
        }

        if (node.tagName === 'BR') {
            return 1;
        }
    }

    let length = 0;
    node.childNodes.forEach((child) => {
        length += getNodeTextLength(child);
    });
    return length;
}

function extractEditorText(root: HTMLElement): string {
    const parts: string[] = [];

    const walk = (node: Node) => {
        if (isTextNode(node)) {
            parts.push((node.textContent ?? '').replace(ZERO_WIDTH_CARET_ANCHOR_REGEX, ''));
            return;
        }

        if (isElementNode(node)) {
            const token = getMentionToken(node);
            if (token) {
                parts.push(token);
                return;
            }

            if (node.tagName === 'BR') {
                parts.push('\n');
                return;
            }
        }

        node.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    return parts.join('').replace(/\u00a0/g, ' ');
}

function getRenderedMentionTokens(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll(`[${MENTION_TOKEN_ATTRIBUTE}]`))
        .map((element) => getMentionToken(element))
        .filter((token): token is string => !!token);
}

function areStringArraysEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}

function getMentionsSignature(mentions: GeneratorPromptMentionEditorItem[]) {
    return mentions.map((mention) => [mention.id, mention.token, mention.name, mention.kind ?? 'image'].join(':')).join('|');
}

function setPreviewImageSource(img: HTMLImageElement, image: string | File) {
    if (typeof image !== 'string') {
        const src = URL.createObjectURL(image);
        img.src = src;
        img.onload = () => URL.revokeObjectURL(src);
        img.onerror = () => URL.revokeObjectURL(src);
        return;
    }

    if (isImageRef(image)) {
        void getImageBlobUrlWithLODResolution(image, 64).then((result) => {
            if (result && img.isConnected) {
                img.src = result.url;
            }
        });
        return;
    }

    img.src = cachedDataUrlToBlobUrl(image) || image;
}

function createPreviewNode(mention: GeneratorPromptMentionEditorItem): HTMLElement {
    const preview = document.createElement('span');
    preview.className = MENTION_THUMB_CLASS_NAME;

    if (mention.kind === 'video') {
        preview.className = `${MENTION_THUMB_CLASS_NAME} bg-slate-900 text-white`;
        preview.textContent = 'V';
        return preview;
    }

    if (mention.kind === 'audio') {
        preview.className = `${MENTION_THUMB_CLASS_NAME} canvas-reference-audio-tile`;
        preview.textContent = 'A';
        return preview;
    }

    const image = mention.previewImage;
    if (!image) {
        return preview;
    }

    if (typeof image !== 'string' && (typeof File === 'undefined' || !(image instanceof File))) {
        return preview;
    }

    const img = document.createElement('img');
    img.alt = mention.name;
    img.draggable = false;
    img.className = 'h-full w-full object-cover';
    setPreviewImageSource(img, image);
    preview.replaceChildren(img);
    return preview;
}

function createTextNodes(value: string): Node[] {
    const nodes: Node[] = [];
    const lines = value.split('\n');
    lines.forEach((line, index) => {
        if (line) {
            nodes.push(document.createTextNode(line));
        }
        if (index < lines.length - 1) {
            nodes.push(document.createElement('br'));
            if (index === lines.length - 2 && lines[index + 1] === '') {
                nodes.push(document.createTextNode(ZERO_WIDTH_CARET_ANCHOR));
            }
        }
    });
    return nodes;
}

function renderEditorContent(root: HTMLElement, value: string, mentions: GeneratorPromptMentionEditorItem[]): string[] {
    const segments = buildPromptComposerSegments(value, mentions);
    const expectedMentionTokens: string[] = [];
    const nodes = segments.flatMap((segment) => {
        if (segment.type === 'text') {
            return createTextNodes(segment.value);
        }

        const mention = segment.mention;
        expectedMentionTokens.push(mention.token);

        const chip = document.createElement('span');
        chip.setAttribute(MENTION_TOKEN_ATTRIBUTE, mention.token);
        chip.contentEditable = 'false';
        chip.draggable = true;
        chip.className = MENTION_CHIP_CLASS_NAME;
        chip.title = `${mention.token} · ${mention.name}`;

        const label = document.createElement('span');
        label.className = MENTION_LABEL_CLASS_NAME;
        label.textContent = mention.kind === 'image' ? mention.name : mention.token.replace(/^@/, '');

        chip.replaceChildren(createPreviewNode(mention), label);
        return chip;
    });

    root.replaceChildren(...nodes);
    return expectedMentionTokens;
}

function getOffsetBeforeNode(root: HTMLElement, target: Node): number {
    let offset = 0;
    let found = false;

    const walk = (node: Node) => {
        if (found) {
            return;
        }

        if (node === target) {
            found = true;
            return;
        }

        if (isElementNode(node) && getMentionToken(node)) {
            offset += getNodeTextLength(node);
            return;
        }

        if (isTextNode(node) || (isElementNode(node) && node.tagName === 'BR')) {
            offset += getNodeTextLength(node);
            return;
        }

        node.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    return offset;
}

function getOffsetFromDomPoint(root: HTMLElement, container: Node, offset: number): number {
    if (container === root) {
        const children = Array.from(root.childNodes);
        let rootOffset = 0;
        for (let index = 0; index < Math.min(offset, children.length); index += 1) {
            rootOffset += getNodeTextLength(children[index]);
        }
        return rootOffset;
    }

    const mentionElement = findMentionElement(container, root);
    if (mentionElement) {
        return getOffsetBeforeNode(root, mentionElement) + (offset > 0 ? getNodeTextLength(mentionElement) : 0);
    }

    let currentOffset = 0;
    let found = false;

    const walk = (node: Node) => {
        if (found) {
            return;
        }

        if (node === container) {
            if (isTextNode(node)) {
                currentOffset += getTextModelOffsetFromDomOffset(node.textContent ?? '', offset);
            } else {
                const children = Array.from(node.childNodes);
                for (let index = 0; index < Math.min(offset, children.length); index += 1) {
                    currentOffset += getNodeTextLength(children[index]);
                }
            }
            found = true;
            return;
        }

        if (isElementNode(node) && getMentionToken(node)) {
            currentOffset += getNodeTextLength(node);
            return;
        }

        if (isTextNode(node) || (isElementNode(node) && node.tagName === 'BR')) {
            currentOffset += getNodeTextLength(node);
            return;
        }

        node.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    return currentOffset;
}

function readEditorSelection(root: HTMLElement, fallbackValue: string): TextareaSelection {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        const offset = fallbackValue.length;
        return { start: offset, end: offset };
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) {
        const offset = fallbackValue.length;
        return { start: offset, end: offset };
    }

    const anchorOffset = getOffsetFromDomPoint(root, anchorNode, selection.anchorOffset);
    const focusOffset = getOffsetFromDomPoint(root, focusNode, selection.focusOffset);
    return {
        start: Math.min(anchorOffset, focusOffset),
        end: Math.max(anchorOffset, focusOffset),
    };
}

function getPositionForOffset(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
    const safeOffset = Math.max(0, Math.min(targetOffset, getNodeTextLength(root)));
    let currentOffset = 0;
    let position: { node: Node; offset: number } | null = null;

    const setPositionAroundNode = (node: Node, after: boolean) => {
        const parent = node.parentNode ?? root;
        position = {
            node: parent,
            offset: getChildIndex(node) + (after ? 1 : 0),
        };
    };

    const walk = (node: Node) => {
        if (position) {
            return;
        }

        if (isTextNode(node)) {
            const text = node.textContent ?? '';
            const textLength = getTextModelLength(text);
            if (safeOffset <= currentOffset + textLength) {
                position = { node, offset: getTextDomOffsetFromModelOffset(text, safeOffset - currentOffset) };
                return;
            }
            currentOffset += textLength;
            return;
        }

        if (isElementNode(node)) {
            const token = getMentionToken(node);
            if (token) {
                const mentionEnd = currentOffset + token.length;
                if (safeOffset <= currentOffset) {
                    setPositionAroundNode(node, false);
                    return;
                }
                if (safeOffset <= mentionEnd) {
                    setPositionAroundNode(node, true);
                    return;
                }
                currentOffset = mentionEnd;
                return;
            }

            if (node.tagName === 'BR') {
                const brEnd = currentOffset + 1;
                if (safeOffset <= brEnd) {
                    setPositionAroundNode(node, true);
                    return;
                }
                currentOffset = brEnd;
                return;
            }
        }

        node.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    return position ?? { node: root, offset: root.childNodes.length };
}

function applyEditorSelection(root: HTMLElement, selection: TextareaSelection) {
    const domSelection = window.getSelection();
    if (!domSelection) {
        return;
    }

    const range = document.createRange();
    const start = getPositionForOffset(root, selection.start);
    const end = getPositionForOffset(root, selection.end);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    domSelection.removeAllRanges();
    domSelection.addRange(range);
}

function getDomPointFromClientPoint(root: HTMLElement, clientX: number, clientY: number): { node: Node; offset: number } | null {
    const doc = root.ownerDocument;
    const caretPositionFromPoint = (doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    }).caretPositionFromPoint;
    if (caretPositionFromPoint) {
        const position = caretPositionFromPoint.call(doc, clientX, clientY);
        if (position && root.contains(position.offsetNode)) {
            return { node: position.offsetNode, offset: position.offset };
        }
    }

    const caretRangeFromPoint = (doc as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }).caretRangeFromPoint;
    if (caretRangeFromPoint) {
        const range = caretRangeFromPoint.call(doc, clientX, clientY);
        if (range && root.contains(range.startContainer)) {
            return { node: range.startContainer, offset: range.startOffset };
        }
    }

    return null;
}

function isWordLikeChar(char: string | undefined): boolean {
    return !!char && ASCII_WORD_CHAR_REGEX.test(char);
}

function isImeCompositionKeyEvent(event: React.KeyboardEvent<HTMLDivElement>) {
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    return nativeEvent.isComposing || event.key === 'Process' || event.keyCode === 229;
}

function removeMentionForDragMove(value: string, mentionStart: number, mentionEnd: number): { value: string; removedLength: number } {
    const tokenLength = mentionEnd - mentionStart;

    if (mentionStart > 0 && mentionEnd < value.length && value.charAt(mentionStart - 1) === ' ' && value.charAt(mentionEnd) === ' ') {
        const nextValue = `${value.slice(0, mentionStart - 1)}${value.slice(mentionEnd + 1)}`;
        return { value: nextValue, removedLength: value.length - nextValue.length };
    }

    return {
        value: `${value.slice(0, mentionStart)}${value.slice(mentionEnd)}`,
        removedLength: tokenLength,
    };
}

function buildMentionInsertionText(baseValue: string, insertionOffset: number, token: string): { text: string; tokenStart: number } {
    const previousChar = insertionOffset > 0 ? baseValue.charAt(insertionOffset - 1) : undefined;
    const nextChar = insertionOffset < baseValue.length ? baseValue.charAt(insertionOffset) : undefined;
    const needsLeadingSpace = isWordLikeChar(previousChar);
    const needsTrailingSpace = isWordLikeChar(nextChar);
    const text = `${needsLeadingSpace ? ' ' : ''}${token}${needsTrailingSpace ? ' ' : ''}`;
    return {
        text,
        tokenStart: insertionOffset + (needsLeadingSpace ? 1 : 0),
    };
}

function applyCollapsedDeletion(params: {
    value: string;
    selection: TextareaSelection;
    key: 'Backspace' | 'Delete';
    mentionTokens: string[];
}): { nextValue: string; nextSelection: TextareaSelection } | null {
    const { value, selection, key, mentionTokens } = params;
    if (selection.start !== selection.end) {
        return null;
    }

    const newlineDeletion = resolveNewlineDeletionRange({
        value,
        selectionOffset: selection.start,
        key,
    });
    if (newlineDeletion) {
        const nextValue = `${value.slice(0, newlineDeletion.start)}${value.slice(newlineDeletion.end)}`;
        const nextSelection = {
            start: newlineDeletion.nextCaretOffset,
            end: newlineDeletion.nextCaretOffset,
        };
        return { nextValue, nextSelection };
    }

    const mentionDeletion = resolveTokenDeletionRange({
        value,
        tokens: mentionTokens,
        selectionOffset: selection.start,
        key,
    });
    if (!mentionDeletion) {
        return null;
    }

    const nextValue = `${value.slice(0, mentionDeletion.start)}${value.slice(mentionDeletion.end)}`;
    const nextSelection = {
        start: mentionDeletion.nextCaretOffset,
        end: mentionDeletion.nextCaretOffset,
    };
    return { nextValue, nextSelection };
}

export const GeneratorPromptMentionEditor = React.forwardRef<PromptMentionEditorHandle, GeneratorPromptMentionEditorProps>(function GeneratorPromptMentionEditor({
    value,
    mentions,
    readOnly = false,
    ariaLabel,
    placeholder,
    className = '',
    placeholderClassName = 'text-[var(--canvas-text-tertiary)]',
    onChange,
    onSelectionChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    onBlur,
}, ref) {
    const editorRef = React.useRef<HTMLDivElement>(null);
    const pendingSelectionRef = React.useRef<TextareaSelection | null>(null);
    const renderedMentionsSignatureRef = React.useRef('');
    const draggingMentionRef = React.useRef<{ token: string; start: number; end: number } | null>(null);
    const isComposingRef = React.useRef(false);
    const [hasEditorContent, setHasEditorContent] = React.useState(() => value.length > 0);
    const hasEditorContentRef = React.useRef(value.length > 0);

    const updateHasEditorContent = React.useCallback((nextValue: string) => {
        const nextHasContent = nextValue.length > 0;
        if (hasEditorContentRef.current === nextHasContent) {
            return;
        }

        hasEditorContentRef.current = nextHasContent;
        setHasEditorContent(nextHasContent);
    }, []);

    React.useEffect(() => {
        updateHasEditorContent(value);
    }, [updateHasEditorContent, value]);

    const readValue = React.useCallback(() => {
        return editorRef.current ? extractEditorText(editorRef.current) : value;
    }, [value]);

    const readSelection = React.useCallback(() => {
        const currentValue = readValue();
        return editorRef.current ? readEditorSelection(editorRef.current, currentValue) : { start: currentValue.length, end: currentValue.length };
    }, [readValue]);

    const setSelectionRange = React.useCallback((start: number, end: number) => {
        const currentValue = readValue();
        const nextSelection = {
            start: Math.max(0, Math.min(start, currentValue.length)),
            end: Math.max(0, Math.min(end, currentValue.length)),
        };
        const normalizedSelection = {
            start: Math.min(nextSelection.start, nextSelection.end),
            end: Math.max(nextSelection.start, nextSelection.end),
        };
        pendingSelectionRef.current = normalizedSelection;
        if (editorRef.current) {
            editorRef.current.focus();
            applyEditorSelection(editorRef.current, normalizedSelection);
        }
    }, [readValue]);

    const commitValue = React.useCallback((nextValue: string, selection: TextareaSelection) => {
        pendingSelectionRef.current = selection;
        if (!editorRef.current) {
            return;
        }

        updateHasEditorContent(nextValue);
        renderEditorContent(editorRef.current, nextValue, mentions);
        renderedMentionsSignatureRef.current = getMentionsSignature(mentions);
        editorRef.current.focus();
        applyEditorSelection(editorRef.current, selection);
    }, [mentions, updateHasEditorContent]);

    React.useImperativeHandle(ref, () => ({
        focus: () => editorRef.current?.focus(),
        getValue: readValue,
        getSelection: readSelection,
        setSelectionRange,
        commitValue,
    }), [commitValue, readSelection, readValue, setSelectionRange]);

    React.useLayoutEffect(() => {
        const editor = editorRef.current;
        if (!editor) {
            return;
        }

        if (isComposingRef.current && document.activeElement === editor) {
            return;
        }

        const currentValue = extractEditorText(editor);
        const mentionsSignature = getMentionsSignature(mentions);
        const expectedMentionTokens = buildPromptComposerSegments(value, mentions)
            .filter((segment) => segment.type === 'mention')
            .map((segment) => segment.mention.token);
        const canKeepDom = currentValue === value
            && renderedMentionsSignatureRef.current === mentionsSignature
            && areStringArraysEqual(getRenderedMentionTokens(editor), expectedMentionTokens);

        if (canKeepDom) {
            pendingSelectionRef.current = null;
            return;
        }

        renderEditorContent(editor, value, mentions);
        renderedMentionsSignatureRef.current = mentionsSignature;

        const nextSelection = pendingSelectionRef.current;
        if (!nextSelection || document.activeElement !== editor) {
            pendingSelectionRef.current = null;
            return;
        }

        applyEditorSelection(editor, nextSelection);
        pendingSelectionRef.current = null;
    }, [mentions, value]);

    const emitSelectionChange = React.useCallback(() => {
        onSelectionChange(readSelection());
    }, [onSelectionChange, readSelection]);

    const replaceSelection = React.useCallback((insertText: string) => {
        const currentValue = readValue();
        const selection = readSelection();
        const nextValue = `${currentValue.slice(0, selection.start)}${insertText}${currentValue.slice(selection.end)}`;
        const nextCaret = selection.start + insertText.length;
        const nextSelection = { start: nextCaret, end: nextCaret };
        pendingSelectionRef.current = nextSelection;
        updateHasEditorContent(nextValue);
        if (editorRef.current) {
            renderEditorContent(editorRef.current, nextValue, mentions);
            renderedMentionsSignatureRef.current = getMentionsSignature(mentions);
            editorRef.current.focus();
            applyEditorSelection(editorRef.current, nextSelection);
        }
        onChange(nextValue, nextSelection);
    }, [mentions, onChange, readSelection, readValue, updateHasEditorContent]);

    const applyStructuredDeletion = React.useCallback((key: 'Backspace' | 'Delete') => {
        const currentValue = readValue();
        const selection = readSelection();
        const mentionTokens = mentions.map((mention) => mention.token);
        const deletion = applyCollapsedDeletion({
            value: currentValue,
            selection,
            key,
            mentionTokens,
        });
        if (!deletion) {
            return false;
        }

        const { nextValue, nextSelection } = deletion;
        pendingSelectionRef.current = nextSelection;
        updateHasEditorContent(nextValue);
        if (editorRef.current) {
            renderEditorContent(editorRef.current, nextValue, mentions);
            renderedMentionsSignatureRef.current = getMentionsSignature(mentions);
            editorRef.current.focus();
            applyEditorSelection(editorRef.current, nextSelection);
        }
        onChange(nextValue, nextSelection);
        return true;
    }, [mentions, onChange, readSelection, readValue, updateHasEditorContent]);

    const handleInput = React.useCallback(() => {
        if (readOnly || !editorRef.current) {
            return;
        }

        const nextValue = extractEditorText(editorRef.current);
        const nextSelection = readEditorSelection(editorRef.current, nextValue);
        pendingSelectionRef.current = nextSelection;
        updateHasEditorContent(nextValue);
        onChange(nextValue, nextSelection);
    }, [onChange, readOnly, updateHasEditorContent]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const isImeComposing = isComposingRef.current || isImeCompositionKeyEvent(event);
        const currentValue = readValue();
        const selection = readSelection();
        if (!isImeComposing) {
            onKeyDown(event, { value: currentValue, selection });
        }
        if (isImeComposing || event.defaultPrevented || readOnly) {
            return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
            const handled = applyStructuredDeletion(event.key);
            if (handled) {
                event.preventDefault();
                return;
            }
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            replaceSelection('\n');
        }
    }, [applyStructuredDeletion, onKeyDown, readOnly, readSelection, readValue, replaceSelection]);

    const handlePaste = React.useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        if (readOnly) {
            return;
        }

        const text = event.clipboardData.getData('text/plain');
        if (!text) {
            return;
        }

        event.preventDefault();
        replaceSelection(text.replace(/\r\n?/g, '\n'));
    }, [readOnly, replaceSelection]);

    const handleCompositionStart = React.useCallback(() => {
        isComposingRef.current = true;
        onCompositionStart();
    }, [onCompositionStart]);

    const handleCompositionEnd = React.useCallback((event: React.CompositionEvent<HTMLDivElement>) => {
        isComposingRef.current = false;
        const currentValue = readValue();
        const selection = readSelection();
        pendingSelectionRef.current = selection;
        updateHasEditorContent(currentValue);
        onCompositionEnd(event, { value: currentValue, selection });
    }, [onCompositionEnd, readSelection, readValue, updateHasEditorContent]);

    const handleDragStart = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        if (readOnly || !editorRef.current) {
            event.preventDefault();
            return;
        }

        const mentionElement = findMentionElement(event.target as Node | null, editorRef.current);
        const token = getMentionToken(mentionElement);
        if (!mentionElement || !token) {
            event.preventDefault();
            return;
        }

        const start = getOffsetBeforeNode(editorRef.current, mentionElement);
        draggingMentionRef.current = { token, start, end: start + token.length };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', token);
    }, [readOnly]);

    const handleDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        const editor = editorRef.current;
        if (readOnly || !draggingMentionRef.current || !editor) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const point = getDomPointFromClientPoint(editor, event.clientX, event.clientY);
        if (!point) {
            return;
        }

        const caretOffset = getOffsetFromDomPoint(editor, point.node, point.offset);
        applyEditorSelection(editor, { start: caretOffset, end: caretOffset });
    }, [readOnly]);

    const handleDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        const editor = editorRef.current;
        const draggingMention = draggingMentionRef.current;
        draggingMentionRef.current = null;

        if (readOnly || !editor || !draggingMention) {
            return;
        }

        const point = getDomPointFromClientPoint(editor, event.clientX, event.clientY);
        if (!point) {
            return;
        }

        event.preventDefault();
        const currentValue = extractEditorText(editor);
        const dropOffset = getOffsetFromDomPoint(editor, point.node, point.offset);
        if (dropOffset >= draggingMention.start && dropOffset <= draggingMention.end) {
            const selection = { start: draggingMention.end, end: draggingMention.end };
            pendingSelectionRef.current = selection;
            applyEditorSelection(editor, selection);
            return;
        }

        const removalResult = removeMentionForDragMove(currentValue, draggingMention.start, draggingMention.end);
        const valueWithoutMention = removalResult.value;
        const insertionOffset = Math.max(0, Math.min(
            dropOffset > draggingMention.end ? dropOffset - removalResult.removedLength : dropOffset,
            valueWithoutMention.length,
        ));
        const insertion = buildMentionInsertionText(valueWithoutMention, insertionOffset, draggingMention.token);
        const nextValue = `${valueWithoutMention.slice(0, insertionOffset)}${insertion.text}${valueWithoutMention.slice(insertionOffset)}`;
        const nextCaret = insertion.tokenStart + draggingMention.token.length;
        const nextSelection = { start: nextCaret, end: nextCaret };

        pendingSelectionRef.current = nextSelection;
        updateHasEditorContent(nextValue);
        renderEditorContent(editor, nextValue, mentions);
        renderedMentionsSignatureRef.current = getMentionsSignature(mentions);
        editor.focus();
        applyEditorSelection(editor, nextSelection);
        onChange(nextValue, nextSelection);
    }, [mentions, onChange, readOnly, updateHasEditorContent]);

    const handleDragEnd = React.useCallback(() => {
        draggingMentionRef.current = null;
    }, []);

    return (
        <div className="relative">
            {!hasEditorContent && (
                <div className={`pointer-events-none absolute left-0 top-0 text-sm leading-6 ${placeholderClassName}`}>
                    {placeholder}
                </div>
            )}
            <div
                ref={editorRef}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                spellCheck={false}
                role="textbox"
                aria-multiline="true"
                aria-label={ariaLabel}
                tabIndex={readOnly ? -1 : 0}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={emitSelectionChange}
                onMouseUp={emitSelectionChange}
                onClick={emitSelectionChange}
                onFocus={emitSelectionChange}
                onPaste={handlePaste}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={onBlur}
                className={`min-h-12 max-h-[192px] w-full overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none ${readOnly ? 'cursor-default' : ''} ${className}`}
            />
        </div>
    );
});