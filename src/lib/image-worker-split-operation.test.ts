import { describe, expect, it } from 'vitest';
import { resolveStoryboardSplitCells } from './image-worker-split-operation';

describe('image-worker-split-operation', () => {
    it('resolves storyboard split cells with gap and padding', () => {
        expect(resolveStoryboardSplitCells({
            sourceWidth: 1000,
            sourceHeight: 500,
            rows: 2,
            cols: 2,
            gap: 10,
            padding: 20,
        })).toEqual([
            { row: 0, col: 0, width: 475, height: 225, sourceX: 20, sourceY: 20 },
            { row: 0, col: 1, width: 475, height: 225, sourceX: 505, sourceY: 20 },
            { row: 1, col: 0, width: 475, height: 225, sourceX: 20, sourceY: 255 },
            { row: 1, col: 1, width: 475, height: 225, sourceX: 505, sourceY: 255 },
        ]);
    });

    it('rejects parameters that leave no usable source area', () => {
        expect(() => resolveStoryboardSplitCells({
            sourceWidth: 100,
            sourceHeight: 100,
            rows: 3,
            cols: 3,
            gap: 20,
            padding: 40,
        })).toThrow('切割参数无效');
    });
});
