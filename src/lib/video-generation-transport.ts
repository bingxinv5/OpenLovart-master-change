export type VideoGenerationTransport = 'standard' | 'domestic-official' | 'magicapi';

const DOMESTIC_OFFICIAL_TASK_PREFIX = 'domestic-official:';
const MAGICAPI_TASK_PREFIX = 'magicapi:';

export function getVideoGenerationTransport(model: string | null | undefined): VideoGenerationTransport {
    const normalized = typeof model === 'string' ? model.trim().toLowerCase() : '';

    if (normalized.startsWith('doubao-seedance') || normalized.startsWith('sdols')) {
        return 'domestic-official';
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

    return {
        transport: 'standard',
        upstreamTaskId: normalized,
    };
}

export function looksLikeDomesticOfficialTaskId(taskId: string | null | undefined): boolean {
    const normalized = typeof taskId === 'string' ? taskId.trim() : '';
    return normalized.startsWith(DOMESTIC_OFFICIAL_TASK_PREFIX) || /^cgt-/i.test(normalized);
}
