import { describe, expect, it } from 'vitest';
import { getExportTheme, resolveStoryboardExportLayout, type StoryboardExportOptions } from './image-worker-storyboard-export-operation';

const baseOptions: StoryboardExportOptions = {
    columns: 3,
    gap: 16,
    padding: 24,
    backgroundColor: '#ffffff',
    textColor: '#111827',
    showNumbers: true,
    captionMode: 'prompt',
    exportStyle: 'classic',
    showHeader: true,
    headerTitle: 'Storyboard',
};

describe('image-worker-storyboard-export-operation', () => {
    it('resolves classic export layout dimensions', () => {
        expect(resolveStoryboardExportLayout({
            itemCount: 5,
            maxBitmapWidth: 640,
            maxBitmapHeight: 360,
            exportOptions: baseOptions,
        })).toMatchObject({
            columns: 3,
            rows: 2,
            cellWidth: 520,
            imageHeight: 360,
            numberBadge: 40,
            headerHeight: 0,
            footerHeight: 84,
            cardHeight: 472,
            pageHeaderHeight: 92,
            canvasWidth: 1640,
            canvasHeight: 1116,
            isStoryboardMetaMode: false,
        });
    });

    it('uses storyboard meta card chrome when requested', () => {
        expect(resolveStoryboardExportLayout({
            itemCount: 1,
            maxBitmapWidth: 320,
            maxBitmapHeight: 200,
            exportOptions: {
                ...baseOptions,
                captionMode: 'storyboard-meta',
                showHeader: false,
            },
        })).toMatchObject({
            columns: 1,
            rows: 1,
            cellWidth: 320,
            imageHeight: 200,
            headerHeight: 42,
            footerHeight: 116,
            cardHeight: 386,
            pageHeaderHeight: 0,
            isStoryboardMetaMode: true,
        });
    });

    it('returns distinct style themes', () => {
        expect(getExportTheme('classic').cardFill).toBe('rgba(255,255,255,0.97)');
        expect(getExportTheme('cinema').pageHeaderFill).toBe('rgba(2,6,23,0.88)');
        expect(getExportTheme('worksheet').badgeFill).toBe('#0f172a');
    });
});
