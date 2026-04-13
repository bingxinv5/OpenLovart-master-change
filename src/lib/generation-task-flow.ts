import {
  waitForGenerationTask,
  type GenerationTaskType,
} from './ai-client';

type GenerationProgressHandler = (progress: number) => void;
type GenerationTaskCreatedHandler = (taskId: string) => void | Promise<void>;

export type WaitForGenerationResultOptions = {
  onProgress?: GenerationProgressHandler;
  missingResultMessage?: string;
};

export type RunGenerationTaskFlowOptions = WaitForGenerationResultOptions & {
  awaitResult?: boolean;
  onTaskCreated?: GenerationTaskCreatedHandler;
};

export type RunGenerationTaskFlowResult =
  | {
      status: 'completed';
      resultUrl: string;
      taskId: string | null;
    }
  | {
      status: 'pending';
      taskId: string;
    };

type CreateGenerationTaskFlowConfig<Request, Response> = {
  taskType: GenerationTaskType;
  request: (request: Request) => Promise<Response>;
  getTaskId: (response: Response) => string | null | undefined;
  getImmediateResult: (response: Response) => string | null | undefined;
  missingTaskIdMessage: string;
  missingResultMessage: string;
};

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createGenerationTaskFlow<Request, Response>(
  config: CreateGenerationTaskFlowConfig<Request, Response>,
) {
  async function waitForResult(
    taskId: string,
    options: WaitForGenerationResultOptions = {},
  ): Promise<string> {
    const normalizedTaskId = normalizeNonEmptyString(taskId);
    if (!normalizedTaskId) {
      throw new Error(options.missingResultMessage ?? config.missingTaskIdMessage);
    }

    const pollResult = await waitForGenerationTask(normalizedTaskId, config.taskType, {
      onProgress: options.onProgress,
    });

    if (pollResult.status !== 'completed' || !pollResult.resultUrl) {
      throw new Error(
        pollResult.status === 'failed'
          ? pollResult.error
          : options.missingResultMessage ?? config.missingResultMessage,
      );
    }

    return pollResult.resultUrl;
  }

  async function run(
    request: Request,
    options: RunGenerationTaskFlowOptions = {},
  ): Promise<RunGenerationTaskFlowResult> {
    const generation = await config.request(request);
    const immediateResult = normalizeNonEmptyString(config.getImmediateResult(generation));
    const normalizedTaskId = normalizeNonEmptyString(config.getTaskId(generation));

    if (immediateResult) {
      return {
        status: 'completed',
        resultUrl: immediateResult,
        taskId: normalizedTaskId,
      };
    }

    if (!normalizedTaskId) {
      throw new Error(options.missingResultMessage ?? config.missingResultMessage);
    }

    await options.onTaskCreated?.(normalizedTaskId);

    if (!options.awaitResult) {
      return {
        status: 'pending',
        taskId: normalizedTaskId,
      };
    }

    const resultUrl = await waitForResult(normalizedTaskId, options);
    return {
      status: 'completed',
      resultUrl,
      taskId: normalizedTaskId,
    };
  }

  return {
    waitForResult,
    run,
  };
}