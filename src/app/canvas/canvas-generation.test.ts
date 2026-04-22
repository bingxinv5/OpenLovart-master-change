import { describe, expect, it } from 'vitest';

import { applyVideoGenerationSuccess } from './canvas-generation';

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
});