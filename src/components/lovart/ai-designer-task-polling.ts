/**
 * ai-designer-task-polling.ts — 生成任务轮询与恢复
 *
 * 提供 useAiDesignerTaskPolling hook，封装：
 *   - pollGeneratedTask：轮询单个生成任务的进度与结果
 *   - 自动恢复：mount 后扫描 messages 中未完成的任务并重新轮询
 *
 * 这样 AiDesignerPanel 只需调用 hook，不再内联轮询逻辑。
 */

import { useEffect, useMemo, useRef } from 'react';
import type { ChatMessage } from './ai-designer-panel-types';
import { waitForImageGenerationResult } from './image-generation-flow';
import { waitForVideoGenerationResult } from './video-generation-flow';

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

/**
 * Polls a single generation task and updates the corresponding assistant message.
 */
export function createTaskPoller(setMessages: SetMessages) {
    return async function pollGeneratedTask(
        taskId: string,
        messageId: string,
        taskType: 'image' | 'video',
    ) {
        const progressPrefix = taskType === 'image' ? '🎨 图片' : '🎬 视频';
        const completedLabel = taskType === 'image' ? '图片' : '视频';

        const handleProgress = (progress: number) => {
            setMessages(prev => prev.map(m =>
                m.id === messageId
                    ? {
                        ...m,
                        content: `${progressPrefix}生成中... ${progress}%`,
                        taskProgress: progress,
                        taskStatus: 'processing' as const,
                    }
                    : m,
            ));
        };

        try {
            const resultUrl = await (taskType === 'image'
                ? waitForImageGenerationResult(taskId, {
                    onProgress: handleProgress,
                })
                : waitForVideoGenerationResult(taskId, {
                    onProgress: handleProgress,
                }));

            setMessages(prev => prev.map(m =>
                m.id === messageId
                    ? {
                        ...m,
                        content: `✅ ${completedLabel}生成完成！`,
                        generatedImage: taskType === 'image' ? resultUrl : m.generatedImage,
                        generatedVideo: taskType === 'video' ? resultUrl : m.generatedVideo,
                        taskStatus: 'completed' as const,
                        taskError: undefined,
                        isStreaming: false,
                    }
                    : m,
            ));
            return;
        } catch (error) {
            console.error(`[poll${taskType === 'image' ? 'Image' : 'Video'}Status]`, error);
            setMessages(prev => prev.map(m =>
                m.id === messageId
                    ? {
                        ...m,
                        content: `❌ ${completedLabel}生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
                        taskStatus: 'failed' as const,
                        taskError: error instanceof Error ? error.message : '未知错误',
                        isStreaming: false,
                    }
                    : m,
            ));
        }
    };
}

/**
 * Hook that wraps task polling + auto-resume of pending tasks from
 * restored messages. Replaces the inline useCallback + useEffect pair
 * that was previously inside AiDesignerPanel.
 */
export function useAiDesignerTaskPolling(
    messages: ChatMessage[],
    setMessages: SetMessages,
) {
    const resumedTaskKeysRef = useRef<Set<string>>(new Set());

    const pollGeneratedTask = useMemo(() => createTaskPoller(setMessages), [setMessages]);

    // Auto-resume pending / processing tasks after mount or message change
    useEffect(() => {
        const activeTaskKeys = new Set<string>();

        for (const message of messages) {
            if (!message.taskId) continue;
            if (message.taskStatus !== 'pending' && message.taskStatus !== 'processing') continue;
            if (message.generatedImage || message.generatedVideo) continue;
            if (message.toolType !== 'image-gen' && message.toolType !== 'video-gen') continue;

            const taskKey = `${message.id}:${message.taskId}`;
            activeTaskKeys.add(taskKey);

            if (resumedTaskKeysRef.current.has(taskKey)) {
                continue;
            }

            resumedTaskKeysRef.current.add(taskKey);
            void pollGeneratedTask(
                message.taskId,
                message.id,
                message.toolType === 'video-gen' ? 'video' : 'image',
            );
        }

        // Cleanup stale keys
        for (const taskKey of Array.from(resumedTaskKeysRef.current)) {
            if (!activeTaskKeys.has(taskKey)) {
                resumedTaskKeysRef.current.delete(taskKey);
            }
        }
    }, [messages, pollGeneratedTask]);

    return { pollGeneratedTask, resumedTaskKeysRef };
}
