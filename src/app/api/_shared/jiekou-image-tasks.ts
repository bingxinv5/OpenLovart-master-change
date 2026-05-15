export const JIEKOU_IMAGE_TASK_PREFIX = 'jiekou:';
export const JIEKOU_LOCAL_IMAGE_TASK_PREFIX = 'jiekou-local:';

const LOCAL_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const JIEKOU_IMAGE_JOBS_GLOBAL_KEY = Symbol.for('openlovart.jiekou.image.jobs');

export type JieKouLocalImageJob =
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

export type JieKouImageSubmissionResult = {
    data: Record<string, unknown>;
    upstreamTaskId?: string | null;
};

type JieKouImageJobsGlobal = typeof globalThis & {
    [JIEKOU_IMAGE_JOBS_GLOBAL_KEY]?: Map<string, JieKouLocalImageJob>;
};

function getJieKouImageJobs(): Map<string, JieKouLocalImageJob> {
    const target = globalThis as JieKouImageJobsGlobal;
    if (!target[JIEKOU_IMAGE_JOBS_GLOBAL_KEY]) {
        target[JIEKOU_IMAGE_JOBS_GLOBAL_KEY] = new Map<string, JieKouLocalImageJob>();
    }

    return target[JIEKOU_IMAGE_JOBS_GLOBAL_KEY];
}

export function createJieKouLocalImageJob(
    submit: () => Promise<JieKouImageSubmissionResult>,
): string {
    cleanupJieKouLocalImageJobs();

    const jobs = getJieKouImageJobs();
    const taskId = createLocalTaskId();
    const now = Date.now();
    jobs.set(taskId, {
        status: 'submitting',
        createdAt: now,
        updatedAt: now,
    });

    void runJieKouImageSubmission(taskId, submit);

    return taskId;
}

export function getJieKouLocalImageJob(taskId: string): JieKouLocalImageJob | null {
    cleanupJieKouLocalImageJobs();
    return getJieKouImageJobs().get(taskId) ?? null;
}

export function isJieKouLocalImageTaskId(taskId: string): boolean {
    return taskId.startsWith(JIEKOU_LOCAL_IMAGE_TASK_PREFIX);
}

export function encodeJieKouImageTaskId(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(JIEKOU_IMAGE_TASK_PREFIX)
        ? normalized
        : `${JIEKOU_IMAGE_TASK_PREFIX}${normalized}`;
}

export function isJieKouImageTaskId(taskId: string): boolean {
    return taskId.trim().startsWith(JIEKOU_IMAGE_TASK_PREFIX);
}

export function stripJieKouImageTaskPrefix(taskId: string): string {
    const normalized = taskId.trim();
    return normalized.startsWith(JIEKOU_IMAGE_TASK_PREFIX)
        ? normalized.slice(JIEKOU_IMAGE_TASK_PREFIX.length)
        : normalized;
}

function createLocalTaskId(): string {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${JIEKOU_LOCAL_IMAGE_TASK_PREFIX}${suffix}`;
}

async function runJieKouImageSubmission(
    taskId: string,
    submit: () => Promise<JieKouImageSubmissionResult>,
) {
    try {
        const result = await submit();
        const jobs = getJieKouImageJobs();
        const current = jobs.get(taskId);
        const now = Date.now();
        if (!current) {
            return;
        }

        const upstreamTaskId = typeof result.upstreamTaskId === 'string' && result.upstreamTaskId.trim()
            ? stripJieKouImageTaskPrefix(result.upstreamTaskId.trim())
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
        const jobs = getJieKouImageJobs();
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

function cleanupJieKouLocalImageJobs() {
    const jobs = getJieKouImageJobs();
    const cutoff = Date.now() - LOCAL_JOB_TTL_MS;
    for (const [taskId, job] of jobs) {
        if (job.updatedAt < cutoff) {
            jobs.delete(taskId);
        }
    }
}
