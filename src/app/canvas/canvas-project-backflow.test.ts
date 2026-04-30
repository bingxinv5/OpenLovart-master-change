import { describe, expect, it, vi } from 'vitest';
import {
    getCompletedImageResultUrl,
    resolveProjectMediaImageInsertContent,
    saveProjectReferenceFromMediaItem,
    updateProjectMediaItemContent,
    updateProjectReferenceItemImage,
} from './canvas-project-backflow';
import type { ProjectMediaHistoryItem } from '@/lib/project-media-history';

describe('canvas-project-backflow', () => {
    it('selects the first available completed image result url', () => {
        expect(getCompletedImageResultUrl({ status: 'completed', resultUrl: 'https://example.com/a.png' })).toBe('https://example.com/a.png');
        expect(getCompletedImageResultUrl({ status: 'completed', resultUrl: null, resultUrls: ['', 'https://example.com/b.png'] })).toBe('https://example.com/b.png');
        expect(getCompletedImageResultUrl({ status: 'processing', progress: 30 })).toBeNull();
    });

    it('returns direct media content without recovery', async () => {
        const normalizeImageContent = vi.fn();
        const pollImageGenerationTask = vi.fn();
        const item: ProjectMediaHistoryItem = {
            id: 'media-1',
            projectId: 'project-1',
            kind: 'image',
            content: 'https://example.com/image.png',
            createdAt: 1,
        };

        await expect(resolveProjectMediaImageInsertContent(item, {
            projectId: 'project-1',
            normalizeImageContent,
            pollImageGenerationTask,
        })).resolves.toBe('https://example.com/image.png');
        expect(normalizeImageContent).not.toHaveBeenCalled();
        expect(pollImageGenerationTask).not.toHaveBeenCalled();
    });

    it('no-ops storage updates when project context is missing', () => {
        expect(updateProjectMediaItemContent(null, 'media-1', 'imgref:next')).toBe(false);
        expect(updateProjectReferenceItemImage(null, 'ref-1', 'imgref:next')).toBe(false);
    });

    it('skips saving non-image media items as project references', async () => {
        const item: ProjectMediaHistoryItem = {
            id: 'media-1',
            projectId: 'project-1',
            kind: 'video',
            content: 'https://example.com/video.mp4',
            createdAt: 1,
        };

        await expect(saveProjectReferenceFromMediaItem(item, {
            projectId: 'project-1',
            normalizeImageContent: vi.fn(),
            pollImageGenerationTask: vi.fn(),
        })).resolves.toBe(false);
    });
});