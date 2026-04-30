import { describe, expect, it } from 'vitest';
import {
    buildPromptComposerSegments,
    buildPromptReferenceMentions,
    clampPromptReferenceTokens,
    getPromptMentionSuggestions,
    materializePromptMentions,
    remapPromptReferenceTokensAfterRemoval,
    resolvePromptMentionDeletion,
    resolvePromptReferenceMentions,
    type PromptMentionLike,
} from './generator-mention-view-model';

const mentions: Array<PromptMentionLike & { id: string }> = [
    {
        id: 'short',
        token: '@图1',
        replacement: '第一张图',
        searchText: '@图1 第一张图',
    },
    {
        id: 'long',
        token: '@图10',
        replacement: '第十张图',
        searchText: '@图10 第十张图',
    },
];

describe('generator mention helpers', () => {
    it('filters prompt mention suggestions by search text', () => {
        expect(getPromptMentionSuggestions(mentions, { start: 0, end: 2, query: '10' }).map((mention) => mention.id)).toEqual(['long']);
        expect(getPromptMentionSuggestions(mentions, null)).toEqual([]);
    });

    it('materializes longer mention tokens first', () => {
        expect(materializePromptMentions('@图10 和 @图1', mentions)).toBe('第十张图 和 第一张图');
    });

    it('builds prompt composer segments around mention tokens', () => {
        const segments = buildPromptComposerSegments('先看 @图10 再看 @图1', mentions);

        expect(segments.map((segment) => segment.type)).toEqual(['text', 'mention', 'text', 'mention']);
        expect(segments[1]).toMatchObject({ type: 'mention', mention: mentions[1] });
        expect(segments[3]).toMatchObject({ type: 'mention', mention: mentions[0] });
    });

    it('resolves token deletion ranges from mention tokens', () => {
        expect(resolvePromptMentionDeletion('@图1 scene', mentions, 4, 'Backspace')).toEqual({
            start: 0,
            end: 4,
            nextCaretOffset: 0,
        });
    });
});

describe('prompt reference mentions', () => {
    it('builds stable reference image mentions', () => {
        const result = buildPromptReferenceMentions(['image-a', 'image-b']);

        expect(result.map((mention) => ({ id: mention.id, token: mention.token, replacement: mention.replacement }))).toEqual([
            { id: 'reference-0', token: '@参考图1', replacement: '第1张参考图' },
            { id: 'reference-1', token: '@参考图2', replacement: '第2张参考图' },
        ]);
    });

    it('materializes valid reference tokens and reports invalid ones', () => {
        const referenceMentions = buildPromptReferenceMentions(['image-a']);

        expect(resolvePromptReferenceMentions('使用 @参考图1 和 @参考图2', referenceMentions)).toEqual({
            materializedPrompt: '使用 第1张参考图 和 @参考图2',
            invalidTokens: ['@参考图2'],
        });
    });

    it('remaps reference tokens after removing an image', () => {
        expect(remapPromptReferenceTokensAfterRemoval('@参考图1 @参考图2 @参考图3', 2)).toBe('@参考图1 @参考图2');
    });

    it('clamps reference tokens beyond the available image count', () => {
        expect(clampPromptReferenceTokens('@参考图1 @参考图3 描述', 1)).toBe('@参考图1 描述');
    });
});