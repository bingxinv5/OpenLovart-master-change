import { v4 as uuidv4 } from 'uuid';
import type { ProjectMediaHistoryItem } from '@/lib/project-media-history';
import { resolveTextareaMentionQuery, type TextareaMentionQuery } from './textarea-mention-utils';
import type { DomesticGenerationMode } from './generator-model-options';

export type ResourceLibraryTab = 'image' | 'video' | 'audio';
export type ReferenceMediaKind = 'video' | 'audio';

export interface FrameImage {
    id: string;
    image: string;
    imageType: 'first_frame' | 'last_frame' | 'reference';
    name: string;
}

export interface ReferenceMediaItem {
    id: string;
    url: string;
    name: string;
    kind: ReferenceMediaKind;
}

export interface PromptMention {
    id: string;
    token: string;
    replacement: string;
    label: string;
    name: string;
    kind: 'image' | 'video' | 'audio';
    previewImage?: string;
    searchText: string;
}

export interface PromptMentionBinding {
    mentionId: string;
    token?: string;
    note?: string;
}

export type PromptMentionQuery = TextareaMentionQuery;

export interface GeneratorReferencePreviewItemModel {
    id: string;
    kind: 'image' | 'video' | 'audio';
    title: string;
    subtitle?: string;
    previewImage?: string | File;
}

export function buildImageReferencePreviewItems(referenceImages: Array<File | string>): GeneratorReferencePreviewItemModel[] {
    return referenceImages.map((image, index) => ({
        id: `reference-image-${index}`,
        kind: 'image',
        title: `参考图 ${index + 1}`,
        subtitle: `参考图 ${index + 1}`,
        previewImage: image,
    }));
}

export function getFrameImageTypeLabel(type: string) {
    switch (type) {
        case 'first_frame': return '首帧';
        case 'last_frame': return '尾帧';
        case 'reference': return '参考';
        default: return type;
    }
}

export function buildVideoReferencePreviewItems({
    frameImages,
    referenceVideos,
    referenceAudios,
}: {
    frameImages: FrameImage[];
    referenceVideos: ReferenceMediaItem[];
    referenceAudios: ReferenceMediaItem[];
}): GeneratorReferencePreviewItemModel[] {
    return [
        ...frameImages.map((item) => ({
            id: item.id,
            kind: 'image' as const,
            title: item.name,
            subtitle: getFrameImageTypeLabel(item.imageType),
            previewImage: item.image,
        })),
        ...referenceVideos.map((item) => ({
            id: item.id,
            kind: 'video' as const,
            title: item.name,
            subtitle: '视频参考',
        })),
        ...referenceAudios.map((item) => ({
            id: item.id,
            kind: 'audio' as const,
            title: item.name,
            subtitle: '音频参考',
        })),
    ];
}

export function serializeFrameImages(value: FrameImage[]): string | undefined {
    return value.length > 0 ? JSON.stringify(value) : undefined;
}

export function serializeReferenceMedia(value: ReferenceMediaItem[]): string | undefined {
    return value.length > 0 ? JSON.stringify(value) : undefined;
}

export function parseStoredFrameImages(value: string | undefined): FrameImage[] {
    if (!value) {
        return [];
    }

    try {
        return JSON.parse(value) as FrameImage[];
    } catch {
        return [];
    }
}

export function parseStoredReferenceMedia(
    value: string | undefined,
    kind: ReferenceMediaKind,
): ReferenceMediaItem[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.flatMap((item) => {
            if (typeof item === 'string' && item.trim()) {
                return [{ id: uuidv4(), url: item.trim(), name: kind === 'video' ? '参考视频' : '参考音频', kind }];
            }

            if (!item || typeof item !== 'object') {
                return [];
            }

            const rawUrl = typeof (item as { url?: unknown }).url === 'string'
                ? (item as { url: string }).url.trim()
                : '';
            if (!rawUrl) {
                return [];
            }

            const rawName = typeof (item as { name?: unknown }).name === 'string'
                ? (item as { name: string }).name.trim()
                : '';

            return [{
                id: typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id.trim()
                    ? (item as { id: string }).id.trim()
                    : uuidv4(),
                url: rawUrl,
                name: rawName || (kind === 'video' ? '参考视频' : '参考音频'),
                kind,
            }];
        });
    } catch {
        return [];
    }
}

export function parseStoredStringArray(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    } catch {
        return [];
    }
}

export function parseStoredPromptMentionBindings(value: string | undefined): PromptMentionBinding[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.flatMap((item) => {
            if (typeof item === 'string' && item.trim()) {
                return [{ mentionId: item.trim() }];
            }

            if (!item || typeof item !== 'object') {
                return [];
            }

            const mentionId = typeof (item as { mentionId?: unknown }).mentionId === 'string'
                ? (item as { mentionId: string }).mentionId.trim()
                : '';

            if (!mentionId) {
                return [];
            }

            const token = typeof (item as { token?: unknown }).token === 'string'
                ? (item as { token: string }).token.trim()
                : '';

            const note = typeof (item as { note?: unknown }).note === 'string'
                ? (item as { note: string }).note
                : '';

            return [{
                mentionId,
                token: token || undefined,
                note: note || undefined,
            }];
        });
    } catch {
        return parseStoredStringArray(value).map((mentionId) => ({ mentionId }));
    }
}

export function isReusableReferenceAsset(value: string): boolean {
    return value.startsWith('http://')
        || value.startsWith('https://')
        || value.startsWith('asset://')
        || value.startsWith('data:audio/');
}

export function dedupeMediaItems(items: ProjectMediaHistoryItem[], kind: ReferenceMediaKind): ProjectMediaHistoryItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (item.kind !== kind || !isReusableReferenceAsset(item.content) || seen.has(item.content)) {
            return false;
        }

        seen.add(item.content);
        return true;
    });
}

export function resolveInitialDomesticMode(
    savedMode: unknown,
    frameImages: FrameImage[],
    referenceVideos: ReferenceMediaItem[],
    referenceAudios: ReferenceMediaItem[],
): DomesticGenerationMode {
    if (savedMode === 'first-last-frame' || savedMode === 'omni-reference') {
        return savedMode;
    }

    if (referenceVideos.length > 0 || referenceAudios.length > 0) {
        return 'omni-reference';
    }

    if (frameImages.some((item) => item.imageType === 'first_frame' || item.imageType === 'last_frame')) {
        return 'first-last-frame';
    }

    return 'omni-reference';
}

export function buildVideoPromptMentions(params: {
    useFrameLabels: boolean;
    frameImages: FrameImage[];
    referenceVideos: ReferenceMediaItem[];
    referenceAudios: ReferenceMediaItem[];
}): PromptMention[] {
    const { useFrameLabels, frameImages, referenceVideos, referenceAudios } = params;
    const mentions: PromptMention[] = [];

    frameImages.forEach((item, index) => {
        const token = `@参考图${index + 1}`;
        if (useFrameLabels) {
            const slotLabel = item.imageType === 'last_frame' ? '尾帧' : '首帧';
            mentions.push({
                id: item.id,
                token,
                replacement: `第${index + 1}张参考图(${slotLabel})`,
                label: `输入 ${token} 引用这张${slotLabel}参考图`,
                name: item.name,
                kind: 'image',
                previewImage: item.image,
                searchText: `${token} 参考图${index + 1} ${slotLabel} ${item.name}`.toLowerCase(),
            });
            return;
        }

        mentions.push({
            id: item.id,
            token,
            replacement: `第${index + 1}张参考图`,
            label: `输入 ${token} 引用这张参考图`,
            name: item.name,
            kind: 'image',
            previewImage: item.image,
            searchText: `${token} 参考图${index + 1} ${item.name}`.toLowerCase(),
        });
    });

    referenceVideos.forEach((item, index) => {
        const indexLabel = `视频${index + 1}`;
        mentions.push({
            id: item.id,
            token: `@${indexLabel}`,
            replacement: `参考视频${index + 1}(${item.name})`,
            label: `输入 @${indexLabel} 引用这条参考视频`,
            name: item.name,
            kind: 'video',
            searchText: `@${indexLabel} 参考视频${index + 1} ${item.name}`.toLowerCase(),
        });
    });

    referenceAudios.forEach((item, index) => {
        const indexLabel = `音频${index + 1}`;
        mentions.push({
            id: item.id,
            token: `@${indexLabel}`,
            replacement: `参考音频${index + 1}(${item.name})`,
            label: `输入 @${indexLabel} 引用这条参考音频`,
            name: item.name,
            kind: 'audio',
            searchText: `@${indexLabel} 参考音频${index + 1} ${item.name}`.toLowerCase(),
        });
    });

    return mentions;
}

export function resolveNextFrameSlotType(frameImages: FrameImage[]): 'first_frame' | 'last_frame' {
    const hasFirstFrame = frameImages.some((item) => item.imageType === 'first_frame');
    return hasFirstFrame ? 'last_frame' : 'first_frame';
}

export function buildFrameSlotSequence(frameImages: FrameImage[], count: number): Array<'first_frame' | 'last_frame'> {
    const sequence: Array<'first_frame' | 'last_frame'> = [];
    let hasFirstFrame = frameImages.some((item) => item.imageType === 'first_frame');
    let hasLastFrame = frameImages.some((item) => item.imageType === 'last_frame');

    for (let index = 0; index < count; index += 1) {
        if (!hasFirstFrame) {
            sequence.push('first_frame');
            hasFirstFrame = true;
            continue;
        }

        if (!hasLastFrame) {
            sequence.push('last_frame');
            hasLastFrame = true;
            continue;
        }

        break;
    }

    return sequence;
}

export function getPromptMentionPlaceholder(params: {
    usesFrameImages: boolean;
    isDomesticOmniMode: boolean;
}): string {
    if (params.isDomesticOmniMode) {
        return '描述视频内容，输入 @ 引用参考图、参考视频或参考音频...';
    }

    if (params.usesFrameImages) {
        return '描述视频内容，输入 @ 引用首帧或尾帧参考图...';
    }

    return '描述视频内容，输入 @ 引用参考图...';
}

export function getPromptMentionPanelTitle(isDomesticOmniMode: boolean): string {
    return isDomesticOmniMode ? '可引用的参考素材' : '可引用的参考图';
}

export function getPromptMentionEmptyState(params: {
    usesFrameImages: boolean;
    isDomesticOmniMode: boolean;
}): string {
    if (params.isDomesticOmniMode) {
        return '先添加参考图、参考视频或参考音频，再输入 @ 进行引用';
    }

    if (params.usesFrameImages) {
        return '先添加首帧或尾帧参考图，再输入 @ 进行引用';
    }

    return '先添加参考图，再输入 @ 进行引用';
}

export function resolvePromptMentionQuery(value: string, caretIndex: number): PromptMentionQuery | null {
    return resolveTextareaMentionQuery(value, caretIndex);
}

export function getAvailableFrameImageTypes(frameImages: FrameImage[], usesReferenceImages: boolean) {
    if (usesReferenceImages) return [{ value: 'reference' as const, label: '参考图' }];
    const types: { value: 'first_frame' | 'last_frame'; label: string }[] = [];
    if (!frameImages.find((item) => item.imageType === 'first_frame')) types.push({ value: 'first_frame', label: '首帧' });
    if (!frameImages.find((item) => item.imageType === 'last_frame')) types.push({ value: 'last_frame', label: '尾帧' });
    return types;
}