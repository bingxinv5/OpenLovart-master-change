import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    CANVAS_REFERENCE_CONNECTOR_KIND,
    buildConnectorPath,
    classifyReferenceConnectionTarget,
    findIncomingReferenceConnectorForImage,
    findIncomingReferenceConnectorForMedia,
    getConnectorRenderData,
    getOutgoingReferenceConnectors,
    resolveReferenceConnectorImages,
    resolveReferenceConnectorVideos,
} from './canvas-reference-connectors';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    };
}

describe('canvas-reference-connectors', () => {
    it('uses a straight path for horizontally aligned endpoints', () => {
        expect(buildConnectorPath({ x: 100, y: 50 }, { x: 300, y: 55 })).toBe('M 100 50 L 300 55');
    });

    it('uses a smooth single-cubic bezier path for vertically offset endpoints', () => {
        const path = buildConnectorPath({ x: 100, y: 50 }, { x: 340, y: 220 });

        expect(path).toContain('C ');
        expect(path.split(' C ')).toHaveLength(2);
        expect(path).toMatch(/^M 100 50 C [\d.]+ 50, [\d.]+ 220, 340 220$/);
    });

    it('uses port-side tangents so vertical reference curves leave nodes outward', () => {
        const path = buildConnectorPath(
            { x: 540, y: 240 },
            { x: 120, y: 780 },
            { fromPort: 'image-output', toPort: 'generator-reference-input' },
        );

        expect(path).toBe('M 540 240 C 780 240, -120 780, 120 780');
    });

    it('renders reference connectors from image edge output to generator edge input', () => {
        const image = makeElement('image-a', { x: 20, y: 30, width: 120, height: 80, content: 'imgref://a' });
        const generator = makeElement('generator-a', { type: 'image-generator', x: 260, y: 20, width: 160, height: 120 });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });
        const data = getConnectorRenderData(connector, new Map([
            [image.id, image],
            [generator.id, generator],
            [connector.id, connector],
        ]));

        expect(data?.from).toEqual({ x: 140, y: 70 });
        expect(data?.to).toEqual({ x: 260, y: 80 });
        expect(data?.isReferenceConnector).toBe(true);
    });

    it('renders generator flow connectors from right output edge to left input edge', () => {
        const source = makeElement('source-generator', { type: 'image-generator', x: 20, y: 30, width: 120, height: 80 });
        const target = makeElement('target-generator', { type: 'video-generator', x: 260, y: 20, width: 160, height: 120 });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorFrom: source.id,
            connectorTo: target.id,
            connectorFromPort: 'generator-flow-output',
            connectorToPort: 'generator-reference-input',
        });
        const data = getConnectorRenderData(connector, new Map([
            [source.id, source],
            [target.id, target],
            [connector.id, connector],
        ]));

        expect(data?.from).toEqual({ x: 140, y: 70 });
        expect(data?.to).toEqual({ x: 260, y: 80 });
        expect(data?.isReferenceConnector).toBe(false);
    });

    it('supports storyboard planner as a reference connector target', () => {
        const image = makeElement('image-a', { content: 'imgref://a' });
        const planner = makeElement('planner-a', { type: 'storyboard-planner', x: 240, y: 40, width: 420, height: 320 });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: planner.id,
        });

        expect(resolveReferenceConnectorImages(planner.id, [image, planner, connector])).toEqual(['imgref://a']);
    });

    it('resolves unique connected image contents and ignores missing sources', () => {
        const image = makeElement('image-a', { content: 'imgref://a' });
        const generator = makeElement('generator-a', { type: 'image-generator' });
        const firstConnector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });
        const duplicateConnector = makeElement('connector-b', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });
        const missingConnector = makeElement('connector-c', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: 'missing',
            connectorTo: generator.id,
        });

        expect(resolveReferenceConnectorImages(generator.id, [image, generator, firstConnector, duplicateConnector, missingConnector])).toEqual(['imgref://a']);
    });

    it('finds the incoming connector for a specific image content', () => {
        const image = makeElement('image-a', { content: 'imgref://a' });
        const generator = makeElement('generator-a', { type: 'image-generator' });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });

        expect(findIncomingReferenceConnectorForImage(generator.id, [image, generator, connector], 'imgref://a')?.id).toBe(connector.id);
        expect(findIncomingReferenceConnectorForImage(generator.id, [image, generator, connector], 'imgref://missing')).toBeUndefined();
    });

    it('finds outgoing reference connectors for selected image highlighting', () => {
        const image = makeElement('image-a', { content: 'imgref://a' });
        const firstGenerator = makeElement('generator-a', { type: 'image-generator' });
        const secondGenerator = makeElement('generator-b', { type: 'video-generator' });
        const firstConnector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: firstGenerator.id,
        });
        const secondConnector = makeElement('connector-b', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: secondGenerator.id,
        });

        expect(getOutgoingReferenceConnectors(image.id, [image, firstGenerator, secondGenerator, firstConnector, secondConnector]).map((connector) => connector.id))
            .toEqual([firstConnector.id, secondConnector.id]);
    });

    it('resolves connected video contents only for video generator references', () => {
        const video = makeElement('video-a', { type: 'video', content: 'https://example.com/reference.mp4' });
        const imageGenerator = makeElement('image-generator-a', { type: 'image-generator' });
        const videoGenerator = makeElement('video-generator-a', { type: 'video-generator' });
        const validConnector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: video.id,
            connectorTo: videoGenerator.id,
        });
        const invalidConnector = makeElement('connector-b', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: video.id,
            connectorTo: imageGenerator.id,
        });
        const elements = [video, imageGenerator, videoGenerator, validConnector, invalidConnector];

        expect(resolveReferenceConnectorVideos(videoGenerator.id, elements)).toEqual(['https://example.com/reference.mp4']);
        expect(resolveReferenceConnectorVideos(imageGenerator.id, elements)).toEqual([]);
        expect(resolveReferenceConnectorImages(videoGenerator.id, elements)).toEqual([]);
        expect(findIncomingReferenceConnectorForMedia(videoGenerator.id, elements, 'https://example.com/reference.mp4', 'video')?.id)
            .toBe(validConnector.id);
    });

    it('classifies valid and duplicate port connections', () => {
        const image = makeElement('image-a', { content: 'imgref://a' });
        const generator = makeElement('generator-a', { type: 'image-generator' });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });
        const nextGenerator = makeElement('generator-b', { type: 'video-generator' });
        const elements = [image, generator, nextGenerator, connector];

        expect(classifyReferenceConnectionTarget({
            sourceId: image.id,
            sourcePort: 'image-output',
            targetId: nextGenerator.id,
            targetPort: 'generator-reference-input',
            elements,
        }).status).toBe('valid');
        expect(classifyReferenceConnectionTarget({
            sourceId: image.id,
            sourcePort: 'image-output',
            targetId: generator.id,
            targetPort: 'generator-reference-input',
            elements,
        })).toEqual({ status: 'duplicate', duplicateConnectorId: connector.id });
        expect(classifyReferenceConnectionTarget({
            sourceId: image.id,
            sourcePort: 'image-output',
            targetId: image.id,
            targetPort: 'image-output',
            elements,
        }).status).toBe('invalid');
    });

    it('allows video source ports only when the target is a video generator', () => {
        const video = makeElement('video-a', { type: 'video', content: 'https://example.com/reference.mp4' });
        const imageGenerator = makeElement('image-generator-a', { type: 'image-generator' });
        const videoGenerator = makeElement('video-generator-a', { type: 'video-generator' });
        const elements = [video, imageGenerator, videoGenerator];

        expect(classifyReferenceConnectionTarget({
            sourceId: video.id,
            sourcePort: 'image-output',
            targetId: videoGenerator.id,
            targetPort: 'generator-reference-input',
            elements,
        }).status).toBe('valid');
        expect(classifyReferenceConnectionTarget({
            sourceId: video.id,
            sourcePort: 'image-output',
            targetId: imageGenerator.id,
            targetPort: 'generator-reference-input',
            elements,
        }).status).toBe('invalid');
    });
});