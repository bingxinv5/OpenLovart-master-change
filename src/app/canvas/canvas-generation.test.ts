import { describe, expect, it } from 'vitest';

import { applyElementGenerationPatch, applyGenerationProgress, applyVideoGenerationSuccess, buildGenerationQueueItems } from './canvas-generation';

describe('applyElementGenerationPatch', () => {
    it('only applies generation fields to generator or media elements', () => {
        const elements = [
            { id: 'image-1', type: 'image', x: 0, y: 0 },
            { id: 'text-1', type: 'text', x: 0, y: 0, content: 'copy' },
        ] as never;

        const result = applyElementGenerationPatch(elements, 'text-1', { generatingTaskId: 'task-1' });

        expect(result.find((element) => element.id === 'image-1')).not.toHaveProperty('generatingTaskId');
        expect(result.find((element) => element.id === 'text-1')).not.toHaveProperty('generatingTaskId');
    });
});

describe('applyVideoGenerationSuccess', () => {
    it('stores sourceGenerationTaskId when a video task completes', () => {
        const elements = [
            {
                id: 'video-generator-1',
                type: 'video-generator',
                x: 10,
                y: 20,
                width: 300,
                height: 200,
                generatingTaskId: 'task-video-1',
                generatingTaskType: 'video',
            },
        ];

        const [result] = applyVideoGenerationSuccess(elements as never, 'video-generator-1', 'https://example.com/final.mp4', 'task-video-1');

        expect(result).toMatchObject({
            type: 'video',
            content: 'https://example.com/final.mp4',
            sourceGenerationTaskId: 'task-video-1',
            sourceGenerationTaskType: 'video',
            generatingTaskId: undefined,
            generatingTaskType: undefined,
        });
    });

    it('keeps an existing sourceGenerationTaskId when taskId is omitted', () => {
        const elements = [
            {
                id: 'video-1',
                type: 'video',
                x: 0,
                y: 0,
                width: 320,
                height: 180,
                sourceGenerationTaskId: 'task-existing-video',
                sourceGenerationTaskType: 'video',
            },
        ];

        const [result] = applyVideoGenerationSuccess(elements as never, 'video-1', 'https://example.com/updated.mp4');

        expect(result).toMatchObject({
            sourceGenerationTaskId: 'task-existing-video',
            sourceGenerationTaskType: 'video',
        });
    });

    it('resizes generated video results to the selected aspect ratio', () => {
        const elements = [
            {
                id: 'video-generator-1',
                type: 'video-generator',
                x: 10,
                y: 20,
                width: 400,
                height: 300,
                selectedAspectRatio: '9:16',
                selectedResolution: '720p',
            },
        ];

        const [result] = applyVideoGenerationSuccess(elements as never, 'video-generator-1', 'https://example.com/final.mp4');

        expect(result).toMatchObject({
            type: 'video',
            x: 10,
            y: -185,
            width: 400,
            height: 711,
            mediaNaturalWidth: 720,
            mediaNaturalHeight: 1280,
        });
    });
});

describe('long-running video generation state', () => {
    it('marks video queue items as long-running instead of failed', () => {
        const items = buildGenerationQueueItems([
            {
                id: 'video-generator-1',
                type: 'video-generator',
                x: 10,
                y: 20,
                width: 480,
                height: 270,
                savedPrompt: '长视频任务',
                generatingTaskId: 'task-video-1',
                generatingTaskType: 'video',
                generatingProgress: 50,
                generatingLongRunningSince: 1_000,
            },
        ] as never, {});

        expect(items[0]).toMatchObject({
            statusLabel: '长耗时等待',
            tone: 'running',
            progress: 50,
        });
        expect(items[0]?.metaChips).toContain('服务商处理中');
    });

    it('can set and clear long-running metadata while updating progress', () => {
        const elements = [
            {
                id: 'video-generator-1',
                type: 'video-generator',
                x: 10,
                y: 20,
                width: 480,
                height: 270,
                generatingTaskId: 'task-video-1',
                generatingTaskType: 'video',
            },
        ];

        const [longRunning] = applyGenerationProgress(elements as never, 'video-generator-1', 50, {
            longRunningSince: 2_000,
        });
        expect(longRunning).toMatchObject({
            generatingProgress: 50,
            generatingLongRunningSince: 2_000,
        });

        const [advanced] = applyGenerationProgress([longRunning] as never, 'video-generator-1', 80, {
            lastProgressAt: 3_000,
            clearLongRunning: true,
        });
        expect(advanced).toMatchObject({
            generatingProgress: 80,
            generatingLastProgressAt: 3_000,
            generatingLongRunningSince: undefined,
        });
    });
});