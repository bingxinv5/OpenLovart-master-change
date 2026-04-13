import type { GenerationTaskType } from './ai-client';

export type GenerationTaskPatch = {
  generatingTaskId?: string;
  generatingTaskType?: GenerationTaskType;
  generatingProgress?: number;
  generatingError?: string;
};

export function createGenerationTaskPatch(
  taskId: string,
  taskType: GenerationTaskType,
  progress = 0,
): GenerationTaskPatch {
  return {
    generatingTaskId: taskId,
    generatingTaskType: taskType,
    generatingProgress: progress,
    generatingError: undefined,
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
  };
}

export function createGenerationFailurePatch(error: string): GenerationTaskPatch {
  return createGenerationIdlePatch({ error });
}