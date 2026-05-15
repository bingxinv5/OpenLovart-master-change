import { isMkeaiSoraVideoModel, isVApiSoraVideoModel } from './video-generation-models';

export type VideoGenerationTransport = 'standard' | 'domestic-official' | 'magicapi' | 'jiekou' | 'vapi' | 'mkeai';

const DOMESTIC_OFFICIAL_TASK_PREFIX = 'domestic-official:';
const MAGICAPI_TASK_PREFIX = 'magicapi:';
const JIEKOU_TASK_PREFIX = 'jiekou:';
const VAPI_TASK_PREFIX = 'vapi:';
const MKEAI_TASK_PREFIX = 'mkeai:';

export function getVideoGenerationTransport(model: string | null | undefined): VideoGenerationTransport {
    const normalized = typeof model === 'string' ? model.trim().toLowerCase() : '';

    if (normalized.startsWith('doubao-seedance') || normalized.startsWith('sdols')) {
        return 'domestic-official';
    }

    if (normalized.startsWith('jiekou-')) {
        return 'jiekou';
    }

    if (isVApiSoraVideoModel(normalized)) {
        return 'vapi';
    }

    if (isMkeaiSoraVideoModel(normalized)) {
        return 'mkeai';
    }

    return 'standard';
}

export function encodeVideoTaskId(taskId: string, transport: VideoGenerationTransport): string {
    const normalized = taskId.trim();
    if (!normalized || transport === 'standard') {
        return normalized;
    }

    if (transport === 'magicapi') {
        return normalized.startsWith(MAGICAPI_TASK_PREFIX)
            ? normalized
            : `${MAGICAPI_TASK_PREFIX}${normalized}`;
    }

    if (transport === 'jiekou') {
        return normalized.startsWith(JIEKOU_TASK_PREFIX)
            ? normalized
            : `${JIEKOU_TASK_PREFIX}${normalized}`;
    }

    if (transport === 'vapi') {
        return normalized.startsWith(VAPI_TASK_PREFIX)
            ? normalized
            : `${VAPI_TASK_PREFIX}${normalized}`;
    }

    if (transport === 'mkeai') {
        return normalized.startsWith(MKEAI_TASK_PREFIX)
            ? normalized
            : `${MKEAI_TASK_PREFIX}${normalized}`;
    }

    return normalized.startsWith(DOMESTIC_OFFICIAL_TASK_PREFIX)
        ? normalized
        : `${DOMESTIC_OFFICIAL_TASK_PREFIX}${normalized}`;
}

export function parseVideoTaskId(taskId: string | null | undefined): {
    transport: VideoGenerationTransport;
    upstreamTaskId: string;
} {
    const normalized = typeof taskId === 'string' ? taskId.trim() : '';
    if (normalized.startsWith(DOMESTIC_OFFICIAL_TASK_PREFIX)) {
        return {
            transport: 'domestic-official',
            upstreamTaskId: normalized.slice(DOMESTIC_OFFICIAL_TASK_PREFIX.length),
        };
    }

    if (normalized.startsWith(MAGICAPI_TASK_PREFIX)) {
        return {
            transport: 'magicapi',
            upstreamTaskId: normalized.slice(MAGICAPI_TASK_PREFIX.length),
        };
    }

    if (normalized.startsWith(JIEKOU_TASK_PREFIX)) {
        return {
            transport: 'jiekou',
            upstreamTaskId: normalized.slice(JIEKOU_TASK_PREFIX.length),
        };
    }

    if (normalized.startsWith(VAPI_TASK_PREFIX)) {
        return {
            transport: 'vapi',
            upstreamTaskId: normalized.slice(VAPI_TASK_PREFIX.length),
        };
    }

    if (normalized.startsWith(MKEAI_TASK_PREFIX)) {
        return {
            transport: 'mkeai',
            upstreamTaskId: normalized.slice(MKEAI_TASK_PREFIX.length),
        };
    }

    return {
        transport: 'standard',
        upstreamTaskId: normalized,
    };
}

export function looksLikeDomesticOfficialTaskId(taskId: string | null | undefined): boolean {
    const normalized = typeof taskId === 'string' ? taskId.trim() : '';
    return normalized.startsWith(DOMESTIC_OFFICIAL_TASK_PREFIX) || /^cgt-/i.test(normalized);
}
