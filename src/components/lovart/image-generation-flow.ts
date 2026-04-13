"use client";

import {
  requestImageGeneration,
  type ImageGenerationRequest,
  type ImageGenerationResponse,
} from '@/lib/ai-client';
import {
  createGenerationTaskFlow,
  type RunGenerationTaskFlowOptions,
  type WaitForGenerationResultOptions,
} from '@/lib/generation-task-flow';

type WaitForImageGenerationResultOptions = WaitForGenerationResultOptions;
type RunImageGenerationFlowOptions = RunGenerationTaskFlowOptions;

export type RunImageGenerationFlowResult =
  | {
      status: 'completed';
      imageUrl: string;
      taskId: string | null;
    }
  | {
      status: 'pending';
      taskId: string;
    };

const imageGenerationFlow = createGenerationTaskFlow<ImageGenerationRequest, ImageGenerationResponse>({
  taskType: 'image',
  request: requestImageGeneration,
  getTaskId: (response) => response.taskId,
  getImmediateResult: (response) => response.imageUrl || response.imageData || null,
  missingTaskIdMessage: '图片生成任务缺少 taskId',
  missingResultMessage: '图片生成未返回可用结果',
});

export async function waitForImageGenerationResult(
  taskId: string,
  options: WaitForImageGenerationResultOptions = {},
): Promise<string> {
  return imageGenerationFlow.waitForResult(taskId, options);
}

export async function runImageGenerationFlow(
  request: ImageGenerationRequest,
  options: RunImageGenerationFlowOptions = {},
): Promise<RunImageGenerationFlowResult> {
  const result = await imageGenerationFlow.run(request, options);
  if (result.status === 'completed') {
    return {
      status: 'completed',
      imageUrl: result.resultUrl,
      taskId: result.taskId,
    };
  }

  return result;
}