import {
    filterMentionSuggestions,
    normalizeMentionText,
    resolveTokenDeletionRange,
    type TextareaMentionQuery,
    type TextareaTokenDeletion,
} from './textarea-mention-utils';

export interface PromptMentionLike {
    token: string;
    replacement: string;
    searchText: string;
}

export type PromptComposerSegment<TMention extends PromptMentionLike> =
    | { type: 'text'; value: string; key: string }
    | { type: 'mention'; mention: TMention; key: string };

export interface PromptReferenceMention extends PromptMentionLike {
    id: string;
    label: string;
    name: string;
    image: File | string;
}

const PROMPT_REFERENCE_TOKEN_REGEX = /@参考图(\d+)/g;

export function getPromptMentionSuggestions<TMention extends PromptMentionLike>(
    mentions: TMention[],
    query: TextareaMentionQuery | null,
): TMention[] {
    return filterMentionSuggestions(mentions, query, (mention) => mention.searchText);
}

export function resolvePromptMentionDeletion<TMention extends PromptMentionLike>(
    prompt: string,
    mentions: TMention[],
    selectionOffset: number,
    key: 'Backspace' | 'Delete',
): TextareaTokenDeletion | null {
    return resolveTokenDeletionRange({
        value: prompt,
        tokens: mentions.map((mention) => mention.token),
        selectionOffset,
        key,
    });
}

export function materializePromptMentions<TMention extends PromptMentionLike>(
    prompt: string,
    mentions: TMention[],
): string {
    let materializedPrompt = prompt.trim();
    if (!materializedPrompt) {
        return materializedPrompt;
    }

    [...mentions]
        .sort((left, right) => right.token.length - left.token.length)
        .forEach((mention) => {
            materializedPrompt = materializedPrompt.split(mention.token).join(mention.replacement);
        });

    return materializedPrompt.trim();
}

export function buildPromptComposerSegments<TMention extends PromptMentionLike>(
    prompt: string,
    mentions: TMention[],
): Array<PromptComposerSegment<TMention>> {
    if (!prompt) {
        return [];
    }

    const sortedMentions = [...mentions].sort((left, right) => right.token.length - left.token.length);
    const segments: Array<PromptComposerSegment<TMention>> = [];
    let cursor = 0;
    let segmentIndex = 0;

    while (cursor < prompt.length) {
        const matchedMention = sortedMentions.find((mention) => prompt.startsWith(mention.token, cursor));
        if (matchedMention) {
            segments.push({
                type: 'mention',
                mention: matchedMention,
                key: `mention-${segmentIndex}-${cursor}`,
            });
            cursor += matchedMention.token.length;
            segmentIndex += 1;
            continue;
        }

        const start = cursor;
        cursor += 1;
        while (cursor < prompt.length && !sortedMentions.some((mention) => prompt.startsWith(mention.token, cursor))) {
            cursor += 1;
        }

        segments.push({
            type: 'text',
            value: prompt.slice(start, cursor),
            key: `text-${segmentIndex}-${start}`,
        });
        segmentIndex += 1;
    }

    return segments;
}

export function buildPromptReferenceMentions(referenceImages: (File | string)[]): PromptReferenceMention[] {
    return referenceImages.map((image, index) => ({
        id: `reference-${index}`,
        token: `@参考图${index + 1}`,
        replacement: `第${index + 1}张参考图`,
        label: `输入 ${`@参考图${index + 1}`} 引用这张参考图`,
        name: `参考图 ${index + 1}`,
        image,
        searchText: `参考图${index + 1} @参考图${index + 1}`.toLowerCase(),
    }));
}

export function resolvePromptReferenceMentions(prompt: string, mentions: PromptReferenceMention[]) {
    const replacements = new Map(mentions.map((mention) => [mention.token, mention.replacement]));
    const invalidTokens: string[] = [];
    const materializedPrompt = prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            if (!invalidTokens.includes(fullMatch)) {
                invalidTokens.push(fullMatch);
            }
            return fullMatch;
        }

        const replacement = replacements.get(fullMatch);
        if (!replacement) {
            if (!invalidTokens.includes(fullMatch)) {
                invalidTokens.push(fullMatch);
            }
            return fullMatch;
        }

        return replacement;
    });

    return {
        materializedPrompt: materializedPrompt.trim(),
        invalidTokens,
    };
}

export function remapPromptReferenceTokensAfterRemoval(prompt: string, removedTokenIndex: number) {
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            return fullMatch;
        }

        if (mentionIndex === removedTokenIndex) {
            return '';
        }

        if (mentionIndex > removedTokenIndex) {
            return `@参考图${mentionIndex - 1}`;
        }

        return fullMatch;
    }));
}

export function clampPromptReferenceTokens(prompt: string, maxReferenceImages: number) {
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex) || mentionIndex <= maxReferenceImages) {
            return fullMatch;
        }

        return '';
    }));
}