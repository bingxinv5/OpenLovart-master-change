import type { GenerationTaskType } from './ai-client';

export type GenerationTaskPatch = {
  generatingTaskId?: string;
  generatingTaskType?: GenerationTaskType;
  generatingProgress?: number;
  generatingError?: string;
  generatingStartedAt?: number;
  generatingLastProgressAt?: number;
  generatingLongRunningSince?: number;
};

export function createGenerationTaskPatch(
  taskId: string,
  taskType: GenerationTaskType,
  progress = 0,
  options: {
    startedAt?: number;
    lastProgressAt?: number;
    longRunningSince?: number;
  } = {},
): GenerationTaskPatch {
  const startedAt = options.startedAt ?? Date.now();
  return {
    generatingTaskId: taskId,
    generatingTaskType: taskType,
    generatingProgress: progress,
    generatingError: undefined,
    generatingStartedAt: startedAt,
    generatingLastProgressAt: options.lastProgressAt ?? startedAt,
    generatingLongRunningSince: options.longRunningSince,
  };
}

export function createGenerationIdlePatch(
  options: {
    progress?: number;
    error?: string;
  } = {},
): GenerationTaskPatch {
  return {
    generatingTaskId: undefined,
    generatingTaskType: undefined,
    generatingProgress: options.progress,
    generatingError: options.error,
    generatingStartedAt: undefined,
    generatingLastProgressAt: undefined,
    generatingLongRunningSince: undefined,
  };
}

export function createGenerationFailurePatch(error: string): GenerationTaskPatch {
  return createGenerationIdlePatch({ error });
}