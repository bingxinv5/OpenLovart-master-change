export type TextareaSelection = {
    start: number;
    end: number;
};

export type TextareaMentionQuery = {
    start: number;
    end: number;
    query: string;
};

export type TextareaTokenDeletion = {
    start: number;
    end: number;
    nextCaretOffset: number;
};

function clampSelection(value: string, selection: TextareaSelection): TextareaSelection {
    const safeStart = Math.max(0, Math.min(selection.start, value.length));
    const safeEnd = Math.max(0, Math.min(selection.end, value.length));

    return {
        start: Math.min(safeStart, safeEnd),
        end: Math.max(safeStart, safeEnd),
    };
}

function escapeTokenForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveTextareaMentionQuery(
    value: string,
    caretIndex: number,
    trigger = '@',
): TextareaMentionQuery | null {
    const safeCaret = Math.max(0, Math.min(caretIndex, value.length));
    const beforeCaret = value.slice(0, safeCaret);
    const triggerIndex = beforeCaret.lastIndexOf(trigger);
    if (triggerIndex < 0) {
        return null;
    }

    const prefix = triggerIndex === 0 ? '' : beforeCaret.charAt(triggerIndex - 1);
    if (prefix && !/\s/.test(prefix)) {
        return null;
    }

    const query = beforeCaret.slice(triggerIndex + trigger.length);
    if (/\s/.test(query)) {
        return null;
    }

    return {
        start: triggerIndex,
        end: safeCaret,
        query,
    };
}

export function filterMentionSuggestions<T>(
    items: T[],
    query: TextareaMentionQuery | null,
    getSearchText: (item: T) => string,
): T[] {
    if (!query) {
        return [];
    }

    const normalizedQuery = query.query.trim().toLowerCase();
    return items.filter((item) => {
        if (!normalizedQuery) {
            return true;
        }

        return getSearchText(item).toLowerCase().includes(normalizedQuery);
    });
}

export function insertTextAtSelection(params: {
    value: string;
    selection: TextareaSelection;
    insertText: string;
    replaceRange?: TextareaSelection;
    ensureSpacing?: boolean;
}): { nextValue: string; nextSelection: TextareaSelection } {
    const { value, selection, insertText, replaceRange, ensureSpacing = false } = params;
    const activeRange = clampSelection(value, replaceRange ?? selection);
    const before = value.slice(0, activeRange.start);
    const after = value.slice(activeRange.end);
    let normalizedInsertText = insertText;

    if (ensureSpacing) {
        if (before && /\s$/.test(before)) {
            normalizedInsertText = normalizedInsertText.replace(/^\s+/, '');
        }

        if (after && /^\s/.test(after)) {
            normalizedInsertText = normalizedInsertText.replace(/\s+$/, '');
        }

        const prefix = before && !/\s$/.test(before) && !/^\s/.test(normalizedInsertText) ? ' ' : '';
        const suffix = after && !/^\s/.test(after) && !/\s$/.test(normalizedInsertText) ? ' ' : '';
        normalizedInsertText = `${prefix}${normalizedInsertText}${suffix}`;
    }

    const nextValue = `${before}${normalizedInsertText}${after}`;
    const nextCaret = before.length + normalizedInsertText.length;

    return {
        nextValue,
        nextSelection: {
            start: nextCaret,
            end: nextCaret,
        },
    };
}

export function resolveTokenDeletionRange(params: {
    value: string;
    tokens: string[];
    selectionOffset: number;
    key: 'Backspace' | 'Delete';
}): TextareaTokenDeletion | null {
    const { value, tokens, selectionOffset, key } = params;
    if (!value || tokens.length === 0) {
        return null;
    }

    const sortedTokens = [...tokens].sort((left, right) => right.length - left.length);
    for (const token of sortedTokens) {
        if (!token) {
            continue;
        }

        let searchStart = 0;
        while (searchStart < value.length) {
            const tokenStart = value.indexOf(token, searchStart);
            if (tokenStart < 0) {
                break;
            }

            const tokenEnd = tokenStart + token.length;
            const deletionEnd = value.charAt(tokenEnd) === ' ' ? tokenEnd + 1 : tokenEnd;
            const matchesBackspace = key === 'Backspace' && (selectionOffset === tokenEnd || selectionOffset === deletionEnd);
            const matchesDelete = key === 'Delete' && selectionOffset === tokenStart;

            if (matchesBackspace || matchesDelete) {
                return {
                    start: tokenStart,
                    end: deletionEnd,
                    nextCaretOffset: tokenStart,
                };
            }

            searchStart = tokenEnd;
        }
    }

    return null;
}

export function normalizeMentionText(value: string): string {
    return value
        .replace(/\s{2,}/g, ' ')
        .replace(/，\s*，/g, '，')
        .replace(/^\s*[，,]\s*|\s*[，,]\s*$/g, '')
        .trim();
}

export function removeMentionToken(value: string, token: string): string {
    if (!token.trim()) {
        return value;
    }

    return normalizeMentionText(value.replace(new RegExp(`${escapeTokenForRegExp(token)}\\s*`, 'g'), ''));
}

export function removeMentionTokens(value: string, tokens: string[]): string {
    return tokens.reduce((nextValue, token) => removeMentionToken(nextValue, token), value);
}