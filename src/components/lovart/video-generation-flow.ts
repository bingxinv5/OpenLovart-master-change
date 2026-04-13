"use client";

import {
  requestVideoGeneration,
  type VideoGenerationRequest,
  type VideoGenerationResponse,
} from '@/lib/ai-client';
import {
  createGenerationTaskFlow,
  type RunGenerationTaskFlowOptions,
  type WaitForGenerationResultOptions,
} from '@/lib/generation-task-flow';

type WaitForVideoGenerationResultOptions = WaitForGenerationResultOptions;
type RunVideoGenerationFlowOptions = RunGenerationTaskFlowOptions;

export type RunVideoGenerationFlowResult =
  | {
      status: 'completed';
      videoUrl: string;
      taskId: string | null;
    }
  | {
      status: 'pending';
      taskId: string;
    };

const videoGenerationFlow = createGenerationTaskFlow<VideoGenerationRequest, VideoGenerationResponse>({
  taskType: 'video',
  request: requestVideoGeneration,
  getTaskId: (response) => response.taskId,
  getImmediateResult: (response) => response.videoUrl,
  missingTaskIdMessage: '视频生成任务缺少 taskId',
  missingResultMessage: '视频生成未返回可用结果',
});

export async function waitForVideoGenerationResult(
  taskId: string,
  options: WaitForVideoGenerationResultOptions = {},
): Promise<string> {
  return videoGenerationFlow.waitForResult(taskId, options);
}

export async function runVideoGenerationFlow(
  request: VideoGenerationRequest,
  options: RunVideoGenerationFlowOptions = {},
): Promise<RunVideoGenerationFlowResult> {
  const result = await videoGenerationFlow.run(request, options);
  if (result.status === 'completed') {
    return {
      status: 'completed',
      videoUrl: result.resultUrl,
      taskId: result.taskId,
    };
  }

  return result;
}