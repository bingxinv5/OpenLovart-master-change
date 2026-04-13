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

    it('recognizes raw official task ids for manual recovery fallback', () => {
        expect(looksLikeDomesticOfficialTaskId('cgt-20260408182454-5dqsn')).toBe(true);
        expect(looksLikeDomesticOfficialTaskId('veo-task-123')).toBe(false);
    });
});