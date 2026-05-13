export const MAGICAPI_IMAGE_TASK_PREFIX = 'magicapi:';
export const MAGICAPI_LOCAL_IMAGE_TASK_PREFIX = 'magicapi-local:';

const LOCAL_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MAGICAPI_IMAGE_JOBS_GLOBAL_KEY = Symbol.for('openlovart.magicapi.image.jobs');

export type MagicApiLocalImageJob =
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

export type MagicApiImageSubmissionResult = {
  data: Record<string, unknown>;
  upstreamTaskId?: string | null;
};

type MagicApiImageJobsGlobal = typeof globalThis & {
  [MAGICAPI_IMAGE_JOBS_GLOBAL_KEY]?: Map<string, MagicApiLocalImageJob>;
};

function getMagicApiImageJobs(): Map<string, MagicApiLocalImageJob> {
  const target = globalThis as MagicApiImageJobsGlobal;
  if (!target[MAGICAPI_IMAGE_JOBS_GLOBAL_KEY]) {
    target[MAGICAPI_IMAGE_JOBS_GLOBAL_KEY] = new Map<string, MagicApiLocalImageJob>();
  }

  return target[MAGICAPI_IMAGE_JOBS_GLOBAL_KEY];
}

export function createMagicApiLocalImageJob(
  submit: () => Promise<MagicApiImageSubmissionResult>,
): string {
  cleanupMagicApiLocalImageJobs();

  const jobs = getMagicApiImageJobs();
  const taskId = createLocalTaskId();
  const now = Date.now();
  jobs.set(taskId, {
    status: 'submitting',
    createdAt: now,
    updatedAt: now,
  });

  void runMagicApiImageSubmission(taskId, submit);

  return taskId;
}

export function getMagicApiLocalImageJob(taskId: string): MagicApiLocalImageJob | null {
  cleanupMagicApiLocalImageJobs();
  return getMagicApiImageJobs().get(taskId) ?? null;
}

export function isMagicApiLocalImageTaskId(taskId: string): boolean {
  return taskId.startsWith(MAGICAPI_LOCAL_IMAGE_TASK_PREFIX);
}

export function isMagicApiPlatformImageTaskId(taskId: string): boolean {
  return taskId.startsWith(MAGICAPI_IMAGE_TASK_PREFIX)
    || /^image-[a-z0-9]+$/i.test(taskId)
    || /^gemini-img-[a-z0-9]+$/i.test(taskId);
}

export function stripMagicApiImageTaskPrefix(taskId: string): string {
  return taskId.startsWith(MAGICAPI_IMAGE_TASK_PREFIX)
    ? taskId.slice(MAGICAPI_IMAGE_TASK_PREFIX.length)
    : taskId;
}

function createLocalTaskId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${MAGICAPI_LOCAL_IMAGE_TASK_PREFIX}${suffix}`;
}

async function runMagicApiImageSubmission(
  taskId: string,
  submit: () => Promise<MagicApiImageSubmissionResult>,
) {
  try {
    const result = await submit();
    const jobs = getMagicApiImageJobs();
    const current = jobs.get(taskId);
    const now = Date.now();
    if (!current) {
      return;
    }

    const upstreamTaskId = typeof result.upstreamTaskId === 'string' && result.upstreamTaskId.trim()
      ? stripMagicApiImageTaskPrefix(result.upstreamTaskId.trim())
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
    const jobs = getMagicApiImageJobs();
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

function cleanupMagicApiLocalImageJobs() {
  const jobs = getMagicApiImageJobs();
  const cutoff = Date.now() - LOCAL_JOB_TTL_MS;
  for (const [taskId, job] of jobs) {
    if (job.updatedAt < cutoff) {
      jobs.delete(taskId);
    }
  }
}