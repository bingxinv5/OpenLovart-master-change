import { describe, expect, it } from 'vitest';
import {
    buildFrameSlotSequence,
    buildImageReferencePreviewItems,
    buildVideoPromptMentions,
    buildVideoReferencePreviewItems,
    getAvailableFrameImageTypes,
    parseStoredPromptMentionBindings,
    parseStoredReferenceMedia,
    resolveInitialDomesticMode,
    resolveNextFrameSlotType,
} from './generator-reference-view-model';
import { materializePromptMentions } from './generator-mention-view-model';

describe('generator reference view model', () => {
    it('builds image reference preview items', () => {
        expect(buildImageReferencePreviewItems(['image-a', 'image-b'])).toEqual([
            { id: 'reference-image-0', kind: 'image', title: '参考图 1', subtitle: '参考图 1', previewImage: 'image-a' },
            { id: 'reference-image-1', kind: 'image', title: '参考图 2', subtitle: '参考图 2', previewImage: 'image-b' },
        ]);
    });

    it('normalizes stored reference media and legacy mention bindings', () => {
        expect(parseStoredReferenceMedia(JSON.stringify(['https://example.com/video.mp4']), 'video')).toMatchObject([
            { url: 'https://example.com/video.mp4', name: '参考视频', kind: 'video' },
        ]);
        expect(parseStoredReferenceMedia(JSON.stringify([{ id: 'a', url: ' asset://audio ', name: ' Ambient ' }]), 'audio')).toEqual([
            { id: 'a', url: 'asset://audio', name: 'Ambient', kind: 'audio' },
        ]);
        expect(parseStoredPromptMentionBindings(JSON.stringify(['image-a', { mentionId: 'video-a', token: '@视频1', note: 'keep' }]))).toEqual([
            { mentionId: 'image-a' },
            { mentionId: 'video-a', token: '@视频1', note: 'keep' },
        ]);
    });

    it('builds video prompt mentions for frame and omni references', () => {
        const mentions = buildVideoPromptMentions({
            useFrameLabels: true,
            frameImages: [{ id: 'first', image: 'image-data', imageType: 'first_frame', name: '首帧素材' }],
            referenceVideos: [{ id: 'video', url: 'asset://video', name: '片段', kind: 'video' }],
            referenceAudios: [{ id: 'audio', url: 'asset://audio', name: '旁白', kind: 'audio' }],
        });

        expect(mentions.map((mention) => ({ id: mention.id, token: mention.token, replacement: mention.replacement }))).toEqual([
            { id: 'first', token: '@参考图1', replacement: '第1张参考图(首帧)' },
            { id: 'video', token: '@视频1', replacement: '参考视频1(片段)' },
            { id: 'audio', token: '@音频1', replacement: '参考音频1(旁白)' },
        ]);
    });

    it('materializes video @参考图 mentions in first-last-frame mode', () => {
        const mentions = buildVideoPromptMentions({
            useFrameLabels: true,
            frameImages: [
                { id: 'first', image: 'first-image', imageType: 'first_frame', name: '首帧素材' },
                { id: 'last', image: 'last-image', imageType: 'last_frame', name: '尾帧素材' },
            ],
            referenceVideos: [],
            referenceAudios: [],
        });

        expect(materializePromptMentions('让 @参考图1 平滑过渡到 @参考图2', mentions))
            .toBe('让 第1张参考图(首帧) 平滑过渡到 第2张参考图(尾帧)');
    });

    it('materializes video reference mentions in omni-reference mode', () => {
        const mentions = buildVideoPromptMentions({
            useFrameLabels: false,
            frameImages: [
                { id: 'image-a', image: 'image-a', imageType: 'reference', name: '角色' },
                { id: 'image-b', image: 'image-b', imageType: 'reference', name: '场景' },
            ],
            referenceVideos: [{ id: 'video-a', url: 'asset://video-a', name: '动作', kind: 'video' }],
            referenceAudios: [{ id: 'audio-a', url: 'asset://audio-a', name: '旁白', kind: 'audio' }],
        });

        expect(materializePromptMentions('@参考图1 保持角色，@参考图2 保持场景，参考 @视频1 和 @音频1', mentions))
            .toBe('第1张参考图 保持角色，第2张参考图 保持场景，参考 参考视频1(动作) 和 参考音频1(旁白)');
    });

    it('derives frame slot options and domestic mode defaults', () => {
        expect(resolveNextFrameSlotType([])).toBe('first_frame');
        expect(resolveNextFrameSlotType([{ id: 'a', image: 'a', imageType: 'first_frame', name: 'a' }])).toBe('last_frame');
        expect(buildFrameSlotSequence([], 2)).toEqual(['first_frame', 'last_frame']);
        expect(getAvailableFrameImageTypes([{ id: 'a', image: 'a', imageType: 'first_frame', name: 'a' }], false)).toEqual([
            { value: 'last_frame', label: '尾帧' },
        ]);
        expect(resolveInitialDomesticMode(undefined, [], [{ id: 'video', url: 'asset://video', name: 'video', kind: 'video' }], [])).toBe('omni-reference');
        expect(resolveInitialDomesticMode(undefined, [{ id: 'a', image: 'a', imageType: 'first_frame', name: 'a' }], [], [])).toBe('first-last-frame');
    });

    it('builds video reference preview items', () => {
        expect(buildVideoReferencePreviewItems({
            frameImages: [{ id: 'image', image: 'data', imageType: 'last_frame', name: '尾帧素材' }],
            referenceVideos: [{ id: 'video', url: 'asset://video', name: '视频素材', kind: 'video' }],
            referenceAudios: [{ id: 'audio', url: 'asset://audio', name: '音频素材', kind: 'audio' }],
        })).toEqual([
            { id: 'image', kind: 'image', title: '尾帧素材', subtitle: '尾帧', previewImage: 'data' },
            { id: 'video', kind: 'video', title: '视频素材', subtitle: '视频参考' },
            { id: 'audio', kind: 'audio', title: '音频素材', subtitle: '音频参考' },
        ]);
    });
});