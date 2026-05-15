export const VAPI_IMAGE_TASK_PREFIX = 'vapi:';
export const VAPI_LOCAL_IMAGE_TASK_PREFIX = 'vapi-local:';

const LOCAL_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const VAPI_IMAGE_JOBS_GLOBAL_KEY = Symbol.for('openlovart.vapi.image.jobs');

export type VApiLocalImageJob =
    | {
        status: 'submitting';
        createdAt: number;
        updatedAt: number;
    }
    | {
        status: 'upstream';
        createdAt: number;
        updatedAt: number;
        upstreamTaskId: string;
    }
    | {
        status: 'completed';
        createdAt: number;
        updatedAt: number;
        data: Record<string, unknown>;
        upstreamTaskId?: string;
    }
    | {
        status: 'failed';
        createdAt: number;
        updatedAt: number;
        error: string;
    };

export type VApiImageSubmissionResult = {
    data: Record<string, unknown>;
    upstreamTaskId?: string | null;
};

type VApiImageJobsGlobal = typeof globalThis & {
    [VAPI_IMAGE_JOBS_GLOBAL_KEY]?: Map<string, VApiLocalImageJob>;
};

function getVApiImageJobs(): Map<string, VApiLocalImageJob> {
    const target = globalThis as VApiImageJobsGlobal;
    if (!target[VAPI_IMAGE_JOBS_GLOBAL_KEY]) {
        target[VAPI_IMAGE_JOBS_GLOBAL_KEY] = new Map<string, VApiLocalImageJob>();
    }

    return target[VAPI_IMAGE_JOBS_GLOBAL_KEY];
}

export function createVApiLocalImageJob(
    submit: () => Promise<VApiImageSubmissionResult>,
): string {
    cleanupVApiLocalImageJobs();

    const jobs = getVApiImageJobs();
    const taskId = createLocalTaskId();
    const now = Date.now();
    jobs.set(taskId, {
        status: 'submitting',
        createdAt: now,
        updatedAt: now,
    });

    void runVApiImageSubmission(taskId, submit);

    return taskId;
}

export function getVApiLocalImageJob(taskId: string): VApiLocalImageJob | null {
    cleanupVApiLocalImageJobs();
    return getVApiImageJobs().get(taskId) ?? null;
}

export function isVApiLocalImageTaskId(taskId: string | null | undefined): boolean {
    return typeof taskId === 'string' && taskId.startsWith(VAPI_LOCAL_IMAGE_TASK_PREFIX);
}

export function encodeVApiImageTaskId(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(VAPI_IMAGE_TASK_PREFIX)
        ? normalized
        : `${VAPI_IMAGE_TASK_PREFIX}${normalized}`;
}

export function isVApiImageTaskId(taskId: string | null | undefined): boolean {
    return typeof taskId === 'string' && taskId.trim().startsWith(VAPI_IMAGE_TASK_PREFIX);
}

export function stripVApiImageTaskPrefix(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(VAPI_IMAGE_TASK_PREFIX)
        ? normalized.slice(VAPI_IMAGE_TASK_PREFIX.length)
        : normalized;
}

function createLocalTaskId(): string {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${VAPI_LOCAL_IMAGE_TASK_PREFIX}${suffix}`;
}

async function runVApiImageSubmission(
    taskId: string,
    submit: () => Promise<VApiImageSubmissionResult>,
) {
    try {
        const result = await submit();
        const jobs = getVApiImageJobs();
        const current = jobs.get(taskId);
        const now = Date.now();
        if (!current) {
            return;
        }

        const upstreamTaskId = typeof result.upstreamTaskId === 'string' && result.upstreamTaskId.trim()
            ? stripVApiImageTaskPrefix(result.upstreamTaskId.trim())
            : null;

        if (upstreamTaskId) {
            jobs.set(taskId, {
                status: 'upstream',
                createdAt: current.createdAt,
                updatedAt: now,
                upstreamTaskId,
            });
            return;
        }

        jobs.set(taskId, {
            status: 'completed',
            createdAt: current.createdAt,
            updatedAt: now,
            data: result.data,
        });
    } catch (error: unknown) {
        const jobs = getVApiImageJobs();
        const current = jobs.get(taskId);
        if (!current) {
            return;
        }

        jobs.set(taskId, {
            status: 'failed',
            createdAt: current.createdAt,
            updatedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function cleanupVApiLocalImageJobs() {
    const jobs = getVApiImageJobs();
    const cutoff = Date.now() - LOCAL_JOB_TTL_MS;
    for (const [taskId, job] of jobs) {
        if (job.updatedAt < cutoff) {
            jobs.delete(taskId);
        }
    }
}