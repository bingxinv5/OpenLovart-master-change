import {
    filterMentionSuggestions,
    normalizeMentionText,
    resolveTokenDeletionRange,
    type TextareaSelection,
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
    | { type: 'mention'; mention: TMention; value: string; key: string };

export interface PromptReferenceMention extends PromptMentionLike {
    id: string;
    label: string;
    name: string;
    image: File | string;
}

const PROMPT_REFERENCE_TOKEN_REGEX = /@(参考)?图(\d+)/g;
export const PROMPT_MENTION_INLINE_PADDING = '      ';

function mapOffsetThroughReplacement(offset: number, rangeStart: number, rangeEnd: number, replacementLength: number, delta: number) {
    if (offset < rangeStart) {
        return offset;
    }

    if (offset <= rangeEnd) {
        return rangeStart + replacementLength;
    }

    return offset + delta;
}

export function ensurePromptMentionInlinePadding(
    prompt: string,
    tokens: string[],
    selection?: TextareaSelection,
): { prompt: string; selection?: TextareaSelection; changed: boolean } {
    if (!prompt || tokens.length === 0) {
        return { prompt, selection, changed: false };
    }

    const sortedTokens = [...new Set(tokens.filter(Boolean))].sort((left, right) => right.length - left.length);
    let cursor = 0;
    let nextPrompt = '';
    let changed = false;
    let nextSelection = selection ? { ...selection } : undefined;
    let cumulativeDelta = 0;

    while (cursor < prompt.length) {
        const matchedToken = sortedTokens.find((token) => prompt.startsWith(token, cursor));
        if (!matchedToken) {
            nextPrompt += prompt.charAt(cursor);
            cursor += 1;
            continue;
        }

        nextPrompt += matchedToken;
        cursor += matchedToken.length;

        const spacingStart = cursor;
        while (cursor < prompt.length && prompt.charAt(cursor) === ' ') {
            cursor += 1;
        }

        const existingSpacing = prompt.slice(spacingStart, cursor);
        const nextSpacing = existingSpacing.length >= PROMPT_MENTION_INLINE_PADDING.length
            ? existingSpacing
            : PROMPT_MENTION_INLINE_PADDING;
        nextPrompt += nextSpacing;

        const delta = nextSpacing.length - existingSpacing.length;
        if (nextSelection) {
            const mappedSpacingStart = spacingStart + cumulativeDelta;
            const mappedSpacingEnd = cursor + cumulativeDelta;
            nextSelection = {
                start: mapOffsetThroughReplacement(nextSelection.start, mappedSpacingStart, mappedSpacingEnd, nextSpacing.length, delta),
                end: mapOffsetThroughReplacement(nextSelection.end, mappedSpacingStart, mappedSpacingEnd, nextSpacing.length, delta),
            };
        }

        if (nextSpacing.length !== existingSpacing.length) {
            changed = true;
            cumulativeDelta += delta;
        }
    }

    return { prompt: nextPrompt, selection: nextSelection, changed };
}

export function stripPromptMentionInlinePadding(prompt: string, tokens: string[]): string {
    if (!prompt || tokens.length === 0) {
        return prompt;
    }

    const sortedTokens = [...new Set(tokens.filter(Boolean))].sort((left, right) => right.length - left.length);
    let cursor = 0;
    let nextPrompt = '';

    while (cursor < prompt.length) {
        const matchedToken = sortedTokens.find((token) => prompt.startsWith(token, cursor));
        if (!matchedToken) {
            nextPrompt += prompt.charAt(cursor);
            cursor += 1;
            continue;
        }

        nextPrompt += matchedToken;
        cursor += matchedToken.length;

        let spacingEnd = cursor;
        while (spacingEnd < prompt.length && prompt.charAt(spacingEnd) === ' ') {
            spacingEnd += 1;
        }

        const spacingLength = spacingEnd - cursor;
        if (spacingLength >= PROMPT_MENTION_INLINE_PADDING.length) {
            if (spacingEnd < prompt.length) {
                nextPrompt += ' ';
            }
        } else if (spacingLength > 0) {
            nextPrompt += prompt.slice(cursor, spacingEnd);
        }
        cursor = spacingEnd;
    }

    return nextPrompt;
}

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
    let materializedPrompt = stripPromptMentionInlinePadding(prompt, mentions.map((mention) => mention.token)).trim();
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
    const mentionCandidatesByFirstChar = new Map<string, TMention[]>();
    for (const mention of sortedMentions) {
        const firstChar = mention.token.charAt(0);
        if (!firstChar) {
            continue;
        }

        const candidates = mentionCandidatesByFirstChar.get(firstChar);
        if (candidates) {
            candidates.push(mention);
        } else {
            mentionCandidatesByFirstChar.set(firstChar, [mention]);
        }
    }
    const findMentionAt = (offset: number) => {
        const candidates = mentionCandidatesByFirstChar.get(prompt.charAt(offset));
        return candidates?.find((mention) => prompt.startsWith(mention.token, offset));
    };
    const segments: Array<PromptComposerSegment<TMention>> = [];
    let cursor = 0;
    let segmentIndex = 0;

    while (cursor < prompt.length) {
        const matchedMention = findMentionAt(cursor);
        if (matchedMention) {
            const tokenStart = cursor;
            cursor += matchedMention.token.length;

            segments.push({
                type: 'mention',
                mention: matchedMention,
                value: prompt.slice(tokenStart, cursor),
                key: `mention-${segmentIndex}-${cursor}`,
            });
            segmentIndex += 1;
            continue;
        }

        const start = cursor;
        cursor += 1;
        while (cursor < prompt.length && !findMentionAt(cursor)) {
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
        token: `@图${index + 1}`,
        replacement: `第${index + 1}张参考图`,
        label: `输入 ${`@图${index + 1}`} 引用这张图`,
        name: `图${index + 1}`,
        image,
        searchText: `图${index + 1} @图${index + 1} 参考图${index + 1} @参考图${index + 1}`.toLowerCase(),
    }));
}

export function resolvePromptReferenceMentions(prompt: string, mentions: PromptReferenceMention[]) {
    const replacements = new Map(mentions.map((mention) => [mention.token, mention.replacement]));
    const invalidTokens: string[] = [];
    const promptWithoutInlinePadding = stripPromptMentionInlinePadding(prompt, mentions.map((mention) => mention.token));
    const materializedPrompt = promptWithoutInlinePadding.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, _legacyPrefix, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            if (!invalidTokens.includes(fullMatch)) {
                invalidTokens.push(fullMatch);
            }
            return fullMatch;
        }

        const replacement = replacements.get(fullMatch) ?? replacements.get(`@图${mentionIndex}`);
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
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, _legacyPrefix, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            return fullMatch;
        }

        if (mentionIndex === removedTokenIndex) {
            return '';
        }

        if (mentionIndex > removedTokenIndex) {
            return `@图${mentionIndex - 1}`;
        }

        return `@图${mentionIndex}`;
    }));
}

export function clampPromptReferenceTokens(prompt: string, maxReferenceImages: number) {
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, _legacyPrefix, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            return fullMatch;
        }

        if (mentionIndex <= maxReferenceImages) {
            return `@图${mentionIndex}`;
        }

        return '';
    }));
}