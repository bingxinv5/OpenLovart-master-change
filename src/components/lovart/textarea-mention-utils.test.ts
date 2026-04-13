import { describe, expect, it } from 'vitest';
import {
    filterMentionSuggestions,
    insertTextAtSelection,
    normalizeMentionText,
    removeMentionToken,
    removeMentionTokens,
    resolveTextareaMentionQuery,
    resolveTokenDeletionRange,
} from './textarea-mention-utils';

describe('resolveTextareaMentionQuery', () => {
    it('resolves a query when trigger starts a standalone mention', () => {
        expect(resolveTextareaMentionQuery('hello @des', 10)).toEqual({
            start: 6,
            end: 10,
            query: 'des',
        });
    });

    it('returns null when trigger is embedded in another word', () => {
        expect(resolveTextareaMentionQuery('email@test', 10)).toBeNull();
    });

    it('returns null when the query already contains whitespace', () => {
        expect(resolveTextareaMentionQuery('hello @design review', 20)).toBeNull();
    });

    it('supports a custom trigger', () => {
        expect(resolveTextareaMentionQuery('ask /lay', 8, '/')).toEqual({
            start: 4,
            end: 8,
            query: 'lay',
        });
    });
});

describe('filterMentionSuggestions', () => {
    const items = [
        { id: '1', text: '@设计评审 设计稿点评' },
        { id: '2', text: '@布局建议 页面布局' },
        { id: '3', text: '@品牌设计 VIS 系统' },
    ];

    it('returns an empty array without a query', () => {
        expect(filterMentionSuggestions(items, null, (item) => item.text)).toEqual([]);
    });

    it('returns all items when the query is empty', () => {
        expect(filterMentionSuggestions(items, { start: 0, end: 1, query: '' }, (item) => item.text)).toEqual(items);
    });

    it('filters suggestions case-insensitively', () => {
        expect(filterMentionSuggestions(
            [{ id: '1', text: '@UX分析 User Experience' }],
            { start: 0, end: 3, query: 'ux' },
            (item) => item.text,
        )).toEqual([{ id: '1', text: '@UX分析 User Experience' }]);
    });
});

describe('insertTextAtSelection', () => {
    it('inserts text at the current cursor', () => {
        expect(insertTextAtSelection({
            value: 'before after',
            selection: { start: 7, end: 7 },
            insertText: '@design ',
            ensureSpacing: true,
        })).toEqual({
            nextValue: 'before @design after',
            nextSelection: { start: 15, end: 15 },
        });
    });

    it('replaces the provided range without creating double spaces', () => {
        expect(insertTextAtSelection({
            value: 'before @de after',
            selection: { start: 10, end: 10 },
            replaceRange: { start: 7, end: 10 },
            insertText: '@design ',
            ensureSpacing: true,
        })).toEqual({
            nextValue: 'before @design after',
            nextSelection: { start: 14, end: 14 },
        });
    });

    it('clamps out-of-range selection values', () => {
        expect(insertTextAtSelection({
            value: 'hello',
            selection: { start: 99, end: 99 },
            insertText: ' world',
        })).toEqual({
            nextValue: 'hello world',
            nextSelection: { start: 11, end: 11 },
        });
    });
});

describe('resolveTokenDeletionRange', () => {
    it('removes a token on backspace at token end including trailing space', () => {
        expect(resolveTokenDeletionRange({
            value: '@图1 scene',
            tokens: ['@图1'],
            selectionOffset: 4,
            key: 'Backspace',
        })).toEqual({
            start: 0,
            end: 4,
            nextCaretOffset: 0,
        });
    });

    it('removes a token on delete at token start', () => {
        expect(resolveTokenDeletionRange({
            value: 'foo @图1 bar',
            tokens: ['@图1'],
            selectionOffset: 4,
            key: 'Delete',
        })).toEqual({
            start: 4,
            end: 8,
            nextCaretOffset: 4,
        });
    });

    it('prefers the longest matching token when tokens overlap', () => {
        expect(resolveTokenDeletionRange({
            value: '@图 @图片1 scene',
            tokens: ['@图', '@图片1'],
            selectionOffset: 8,
            key: 'Backspace',
        })).toEqual({
            start: 3,
            end: 8,
            nextCaretOffset: 3,
        });
    });

    it('returns null when the cursor is not on a token boundary', () => {
        expect(resolveTokenDeletionRange({
            value: 'foo @图1 bar',
            tokens: ['@图1'],
            selectionOffset: 6,
            key: 'Delete',
        })).toBeNull();
    });
});

describe('normalizeMentionText', () => {
    it('collapses repeated spaces and trims punctuation at boundaries', () => {
        expect(normalizeMentionText('  @图1  ，  场景   ，  ')).toBe('@图1 ， 场景');
    });
});

describe('removeMentionToken', () => {
    it('removes a token and normalizes leftover spacing', () => {
        expect(removeMentionToken('@图1 这是主角 @图2', '@图1')).toBe('这是主角 @图2');
    });

    it('ignores empty tokens', () => {
        expect(removeMentionToken('@图1 这是主角', '   ')).toBe('@图1 这是主角');
    });
});

describe('removeMentionTokens', () => {
    it('removes multiple tokens from the same prompt', () => {
        expect(removeMentionTokens('@图1 这是主角 @图2 这是配角', ['@图1', '@图2'])).toBe('这是主角 这是配角');
    });
});