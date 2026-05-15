export const MKEAI_IMAGE_TASK_PREFIX = 'mkeai:';
export const MKEAI_LOCAL_IMAGE_TASK_PREFIX = 'mkeai-local:';

const LOCAL_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MKEAI_IMAGE_JOBS_GLOBAL_KEY = Symbol.for('openlovart.mkeai.image.jobs');

export type MkeaiLocalImageJob =
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

export type MkeaiImageSubmissionResult = {
    data: Record<string, unknown>;
    upstreamTaskId?: string | null;
};

type MkeaiImageJobsGlobal = typeof globalThis & {
    [MKEAI_IMAGE_JOBS_GLOBAL_KEY]?: Map<string, MkeaiLocalImageJob>;
};

function getMkeaiImageJobs(): Map<string, MkeaiLocalImageJob> {
    const target = globalThis as MkeaiImageJobsGlobal;
    if (!target[MKEAI_IMAGE_JOBS_GLOBAL_KEY]) {
        target[MKEAI_IMAGE_JOBS_GLOBAL_KEY] = new Map<string, MkeaiLocalImageJob>();
    }

    return target[MKEAI_IMAGE_JOBS_GLOBAL_KEY];
}

export function createMkeaiLocalImageJob(
    submit: () => Promise<MkeaiImageSubmissionResult>,
): string {
    cleanupMkeaiLocalImageJobs();

    const jobs = getMkeaiImageJobs();
    const taskId = createLocalTaskId();
    const now = Date.now();
    jobs.set(taskId, {
        status: 'submitting',
        createdAt: now,
        updatedAt: now,
    });

    void runMkeaiImageSubmission(taskId, submit);

    return taskId;
}

export function getMkeaiLocalImageJob(taskId: string): MkeaiLocalImageJob | null {
    cleanupMkeaiLocalImageJobs();
    return getMkeaiImageJobs().get(taskId) ?? null;
}

export function isMkeaiLocalImageTaskId(taskId: string | null | undefined): boolean {
    return typeof taskId === 'string' && taskId.startsWith(MKEAI_LOCAL_IMAGE_TASK_PREFIX);
}

export function encodeMkeaiImageTaskId(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(MKEAI_IMAGE_TASK_PREFIX)
        ? normalized
        : `${MKEAI_IMAGE_TASK_PREFIX}${normalized}`;
}

export function isMkeaiImageTaskId(taskId: string | null | undefined): boolean {
    return typeof taskId === 'string' && taskId.trim().startsWith(MKEAI_IMAGE_TASK_PREFIX);
}

export function stripMkeaiImageTaskPrefix(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(MKEAI_IMAGE_TASK_PREFIX)
        ? normalized.slice(MKEAI_IMAGE_TASK_PREFIX.length)
        : normalized;
}

function createLocalTaskId(): string {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${MKEAI_LOCAL_IMAGE_TASK_PREFIX}${suffix}`;
}

async function runMkeaiImageSubmission(
    taskId: string,
    submit: () => Promise<MkeaiImageSubmissionResult>,
) {
    try {
        const result = await submit();
        const jobs = getMkeaiImageJobs();
        const current = jobs.get(taskId);
        const now = Date.now();
        if (!current) {
            return;
        }

        const upstreamTaskId = typeof result.upstreamTaskId === 'string' && result.upstreamTaskId.trim()
            ? stripMkeaiImageTaskPrefix(result.upstreamTaskId.trim())
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
        const jobs = getMkeaiImageJobs();
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

function cleanupMkeaiLocalImageJobs() {
    const jobs = getMkeaiImageJobs();
    const cutoff = Date.now() - LOCAL_JOB_TTL_MS;
    for (const [taskId, job] of jobs) {
        if (job.updatedAt < cutoff) {
            jobs.delete(taskId);
        }
    }
}