import { describe, expect, it } from 'vitest';
import {
    encodeVideoTaskId,
    getVideoGenerationTransport,
    looksLikeDomesticOfficialTaskId,
    parseVideoTaskId,
} from './video-generation-transport';

describe('video-generation-transport', () => {
    it('routes doubao-seedance models to domestic official transport', () => {
        expect(getVideoGenerationTransport('doubao-seedance-2-0-260128')).toBe('domestic-official');
        expect(getVideoGenerationTransport('veo3.1')).toBe('standard');
    });

    it('encodes and parses domestic official task ids', () => {
        const encoded = encodeVideoTaskId('cgt-20260408182454-5dqsn', 'domestic-official');

        expect(encoded).toBe('domestic-official:cgt-20260408182454-5dqsn');
        expect(parseVideoTaskId(encoded)).toEqual({
            transport: 'domestic-official',
            upstreamTaskId: 'cgt-20260408182454-5dqsn',
        });
    });

    it('encodes and parses MagicAPI task ids', () => {
        const encoded = encodeVideoTaskId('video_123', 'magicapi');

        expect(encoded).toBe('magicapi:video_123');
        expect(parseVideoTaskId(encoded)).toEqual({
            transport: 'magicapi',
            upstreamTaskId: 'video_123',
        });
    });

    it('routes and encodes V-API Sora task ids', () => {
        expect(getVideoGenerationTransport('sora-2_1280x720')).toBe('vapi');
        expect(getVideoGenerationTransport('ssora-2-pro_1280x720')).toBe('vapi');
        expect(getVideoGenerationTransport('sora-2-pro_1792x1024')).toBe('vapi');

        const encoded = encodeVideoTaskId('video_vapi_123', 'vapi');
        expect(encoded).toBe('vapi:video_vapi_123');
        expect(parseVideoTaskId(encoded)).toEqual({
            transport: 'vapi',
            upstreamTaskId: 'video_vapi_123',
        });
    });

    it('routes and encodes MKEAI Sora task ids', () => {
        expect(getVideoGenerationTransport('mkeai-sora-2')).toBe('mkeai');

        const encoded = encodeVideoTaskId('video_mkeai_123', 'mkeai');
        expect(encoded).toBe('mkeai:video_mkeai_123');
        expect(parseVideoTaskId(encoded)).toEqual({
            transport: 'mkeai',
            upstreamTaskId: 'video_mkeai_123',
        });
    });

    it('recognizes raw official task ids for manual recovery fallback', () => {
        expect(looksLikeDomesticOfficialTaskId('cgt-20260408182454-5dqsn')).toBe(true);
        expect(looksLikeDomesticOfficialTaskId('veo-task-123')).toBe(false);
    });
});