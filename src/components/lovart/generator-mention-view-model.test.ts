import { describe, expect, it } from 'vitest';
import {
    buildPromptComposerSegments,
    buildPromptReferenceMentions,
    clampPromptReferenceTokens,
    ensurePromptMentionInlinePadding,
    getPromptMentionSuggestions,
    materializePromptMentions,
    PROMPT_MENTION_INLINE_PADDING,
    remapPromptReferenceTokensAfterRemoval,
    resolvePromptMentionDeletion,
    resolvePromptReferenceMentions,
    stripPromptMentionInlinePadding,
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

    it('keeps visual padding as editable text outside the mention segment', () => {
        const prompt = `先看 @图1${PROMPT_MENTION_INLINE_PADDING}再继续`;
        const segments = buildPromptComposerSegments(prompt, mentions);

        expect(segments.map((segment) => segment.type)).toEqual(['text', 'mention', 'text']);
        expect(segments[1]).toMatchObject({
            type: 'mention',
            value: '@图1',
        });
        expect(segments[2]).toMatchObject({ type: 'text', value: `${PROMPT_MENTION_INLINE_PADDING}再继续` });
    });

    it('pads mention tokens and maps caret offsets after the visual pill', () => {
        const result = ensurePromptMentionInlinePadding('@图1 scene', ['@图1'], { start: 4, end: 4 });

        expect(result.prompt).toBe(`@图1${PROMPT_MENTION_INLINE_PADDING}scene`);
        expect(result.selection).toEqual({
            start: `@图1${PROMPT_MENTION_INLINE_PADDING}`.length,
            end: `@图1${PROMPT_MENTION_INLINE_PADDING}`.length,
        });
    });

    it('strips inline mention padding before materializing prompts', () => {
        const prompt = `使用 @图1${PROMPT_MENTION_INLINE_PADDING}生成角色`;

        expect(stripPromptMentionInlinePadding(prompt, ['@图1'])).toBe('使用 @图1 生成角色');
        expect(materializePromptMentions(prompt, mentions)).toBe('使用 第一张图 生成角色');
    });

    it('preserves intentional short spacing after mention tokens', () => {
        expect(stripPromptMentionInlinePadding('使用 @图1  生成角色', ['@图1'])).toBe('使用 @图1  生成角色');
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
            { id: 'reference-0', token: '@图1', replacement: '第1张参考图' },
            { id: 'reference-1', token: '@图2', replacement: '第2张参考图' },
        ]);
    });

    it('materializes valid reference tokens and reports invalid ones', () => {
        const referenceMentions = buildPromptReferenceMentions(['image-a']);

        expect(resolvePromptReferenceMentions('使用 @图1 和 @图2', referenceMentions)).toEqual({
            materializedPrompt: '使用 第1张参考图 和 @图2',
            invalidTokens: ['@图2'],
        });
    });

    it('keeps legacy reference tokens materializable', () => {
        const referenceMentions = buildPromptReferenceMentions(['image-a']);

        expect(resolvePromptReferenceMentions('使用 @参考图1', referenceMentions)).toEqual({
            materializedPrompt: '使用 第1张参考图',
            invalidTokens: [],
        });
    });

    it('remaps reference tokens after removing an image', () => {
        expect(remapPromptReferenceTokensAfterRemoval('@图1 @图2 @图3', 2)).toBe('@图1 @图2');
        expect(remapPromptReferenceTokensAfterRemoval('@参考图1 @参考图2 @参考图3', 2)).toBe('@图1 @图2');
    });

    it('clamps reference tokens beyond the available image count', () => {
        expect(clampPromptReferenceTokens('@图1 @图3 描述', 1)).toBe('@图1 描述');
        expect(clampPromptReferenceTokens('@参考图1 @参考图3 描述', 1)).toBe('@图1 描述');
    });
});