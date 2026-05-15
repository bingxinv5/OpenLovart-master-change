export const DEFAULT_LOCAL_IMAGE_TASK_PREFIX = 'image-local:';

const LOCAL_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_IMAGE_JOBS_GLOBAL_KEY = Symbol.for('openlovart.default.image.jobs');

export type DefaultLocalImageJob =
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

export type DefaultImageSubmissionResult = {
    data: Record<string, unknown>;
    upstreamTaskId?: string | null;
};

type DefaultImageJobsGlobal = typeof globalThis & {
    [DEFAULT_IMAGE_JOBS_GLOBAL_KEY]?: Map<string, DefaultLocalImageJob>;
};

function getDefaultImageJobs(): Map<string, DefaultLocalImageJob> {
    const target = globalThis as DefaultImageJobsGlobal;
    if (!target[DEFAULT_IMAGE_JOBS_GLOBAL_KEY]) {
        target[DEFAULT_IMAGE_JOBS_GLOBAL_KEY] = new Map<string, DefaultLocalImageJob>();
    }

    return target[DEFAULT_IMAGE_JOBS_GLOBAL_KEY];
}

export function createDefaultLocalImageJob(
    submit: () => Promise<DefaultImageSubmissionResult>,
): string {
    cleanupDefaultLocalImageJobs();

    const jobs = getDefaultImageJobs();
    const taskId = createLocalTaskId();
    const now = Date.now();
    jobs.set(taskId, {
        status: 'submitting',
        createdAt: now,
        updatedAt: now,
    });

    void runDefaultImageSubmission(taskId, submit);

    return taskId;
}

export function getDefaultLocalImageJob(taskId: string): DefaultLocalImageJob | null {
    cleanupDefaultLocalImageJobs();
    return getDefaultImageJobs().get(taskId) ?? null;
}

export function isDefaultLocalImageTaskId(taskId: string | null | undefined): boolean {
    return typeof taskId === 'string' && taskId.startsWith(DEFAULT_LOCAL_IMAGE_TASK_PREFIX);
}

function createLocalTaskId(): string {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${DEFAULT_LOCAL_IMAGE_TASK_PREFIX}${suffix}`;
}

async function runDefaultImageSubmission(
    taskId: string,
    submit: () => Promise<DefaultImageSubmissionResult>,
) {
    try {
        const result = await submit();
        const jobs = getDefaultImageJobs();
        const current = jobs.get(taskId);
        const now = Date.now();
        if (!current) {
            return;
        }

        const upstreamTaskId = typeof result.upstreamTaskId === 'string' && result.upstreamTaskId.trim()
            ? result.upstreamTaskId.trim()
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
        const jobs = getDefaultImageJobs();
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

function cleanupDefaultLocalImageJobs() {
    const jobs = getDefaultImageJobs();
    const cutoff = Date.now() - LOCAL_JOB_TTL_MS;
    for (const [taskId, job] of jobs) {
        if (job.updatedAt < cutoff) {
            jobs.delete(taskId);
        }
    }
}