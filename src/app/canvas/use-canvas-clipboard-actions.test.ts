import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { CANVAS_REFERENCE_CONNECTOR_KIND } from '@/components/lovart/canvas-reference-connectors';
import { buildDuplicateElements } from './use-canvas-clipboard-actions';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        content: `imgref://${id}`,
        ...attrs,
    } as CanvasElement;
}

function makeIdFactory(ids: string[]) {
    let index = 0;
    return () => ids[index++] || `copy-${index}`;
}

describe('canvas clipboard duplicate helpers', () => {
    it('strips reference state and skips reference connectors for Alt-drag duplicates', () => {
        const source = makeElement('source');
        const target = makeElement('target', {
            x: 100,
            referenceImageId: source.id,
            savedReferenceImage: source.content,
            savedReferenceImages: JSON.stringify([source.content]),
            flowReferenceImages: JSON.stringify([source.content]),
            savedFrameImages: JSON.stringify([{ image: source.content, imageType: 'first_frame' }]),
            savedReferenceVideos: JSON.stringify([{ id: 'video-a', url: 'video://a', kind: 'video' }]),
            savedReferenceAudios: JSON.stringify([{ id: 'audio-a', url: 'audio://a', kind: 'audio' }]),
            savedPromptMentionIds: JSON.stringify(['mention-a']),
            savedPromptMentionBindings: JSON.stringify([{ mentionId: 'mention-a', token: '@a' }]),
        });
        const connector = makeElement('connector', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: source.id,
            connectorTo: target.id,
        });

        const result = buildDuplicateElements({
            elements: [source, target, connector],
            ids: [target.id],
            nextId: makeIdFactory(['target-copy']),
            options: { preserveReferenceConnectors: false, stripReferenceState: true },
        });

        expect(result.connectorCopies).toEqual([]);
        expect(result.copies[0]).toMatchObject({
            id: 'target-copy',
            savedReferenceImage: undefined,
            savedReferenceImages: undefined,
            flowReferenceImages: undefined,
            savedFrameImages: undefined,
            savedReferenceVideos: undefined,
            savedReferenceAudios: undefined,
            savedPromptMentionIds: undefined,
            savedPromptMentionBindings: undefined,
        });
    });

    it('preserves incoming reference connectors for explicit duplicates', () => {
        const source = makeElement('source');
        const target = makeElement('target', {
            x: 100,
            savedReferenceImages: JSON.stringify([source.content]),
        });
        const connector = makeElement('connector', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: source.id,
            connectorTo: target.id,
        });

        const result = buildDuplicateElements({
            elements: [source, target, connector],
            ids: [target.id],
            nextId: makeIdFactory(['target-copy', 'connector-copy']),
        });

        expect(result.copies).toHaveLength(1);
        expect(result.copies[0]).toMatchObject({
            id: 'target-copy',
            savedReferenceImages: JSON.stringify([source.content]),
        });
        expect(result.connectorCopies).toHaveLength(1);
        expect(result.connectorCopies[0]).toMatchObject({
            id: 'connector-copy',
            connectorFrom: source.id,
            connectorTo: 'target-copy',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
        });
    });

    it('remaps preserved reference connectors when both endpoints are duplicated', () => {
        const source = makeElement('source');
        const target = makeElement('target', { x: 100 });
        const connector = makeElement('connector', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: source.id,
            connectorTo: target.id,
        });

        const result = buildDuplicateElements({
            elements: [source, target, connector],
            ids: [source.id, target.id],
            nextId: makeIdFactory(['source-copy', 'target-copy', 'connector-copy']),
        });

        expect(result.sourceToCopyId).toEqual({
            source: 'source-copy',
            target: 'target-copy',
        });
        expect(result.connectorCopies[0]).toMatchObject({
            connectorFrom: 'source-copy',
            connectorTo: 'target-copy',
        });
    });
});
