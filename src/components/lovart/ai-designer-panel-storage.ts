import type { ChatMessage, ChatSession } from './ai-designer-panel-types';

const CHAT_SESSIONS_KEY = 'lovart_chat_sessions';
const ACTIVE_CHAT_KEY = 'lovart_active_chat';

export function getActiveChatStorageKey() {
  return ACTIVE_CHAT_KEY;
}

// ── Session factory ────────────────────────────────────────

/**
 * Create a new ChatSession from the current messages and model.
 * Lives in the storage module because sessions are a persistence concept.
 */
export function createChatSession(params: {
    messages: ChatMessage[];
    selectedModel: string;
}): ChatSession {
    const { messages, selectedModel } = params;
    const firstUserMessage = messages.find((message) => message.role === 'user');
    const title = firstUserMessage
        ? firstUserMessage.content.slice(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '')
        : '新对话';

    return {
        id: `session-${Date.now()}`,
        title,
        messages: [...messages],
        model: selectedModel,
        createdAt: messages[0]?.timestamp || new Date(),
        updatedAt: new Date(),
    };
}

export function loadChatSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ChatSession[];
    return parsed.map((session) => ({
      ...session,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
      messages: session.messages.map((message) => ({
        ...message,
        timestamp: new Date(message.timestamp),
        isStreaming: false,
      })),
    }));
  } catch {
    return [];
  }
}

export function saveChatSessions(sessions: ChatSession[]) {
  try {
    const serializable = sessions.map((session) => ({
      ...session,
      createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
      updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt,
      messages: stripLargeData(session.messages).map((message) => ({
        ...message,
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      })),
    }));

    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(serializable));
  } catch {
    if (sessions.length > 1) {
      saveChatSessions(sessions.slice(0, Math.max(1, sessions.length - 2)));
    }
  }
}

export function loadActiveChat(): { messages: ChatMessage[]; model: string } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CHAT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { messages: ChatMessage[]; model: string };
    return {
      messages: parsed.messages.map((message) => ({
        ...message,
        timestamp: new Date(message.timestamp),
        isStreaming: false,
      })),
      model: parsed.model,
    };
  } catch {
    return null;
  }
}

export function saveActiveChat(messages: ChatMessage[], model: string) {
  try {
    if (messages.length === 0) {
      localStorage.removeItem(ACTIVE_CHAT_KEY);
      return;
    }

    const stripped = stripLargeData(messages);
    const serializable = stripped.map((message) => ({
      ...message,
      timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
    }));

    localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify({ messages: serializable, model }));
  } catch {
    try {
      const minimal = messages.map((message) => ({
        ...message,
        attachments: undefined,
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      }));
      localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify({ messages: minimal, model }));
    } catch {
      // ignore quota exhaustion
    }
  }
}

function stripLargeData(messages: ChatMessage[]) {
  return messages.map((message) => {
    const cleaned = { ...message };

    if (cleaned.attachments && cleaned.attachments.length > 0) {
      cleaned.attachments = cleaned.attachments.map((attachment) => ({
        ...attachment,
        dataUrl: '',
        base64Data: '',
      }));
    }

    return cleaned;
  });
}

// ── Session restoration ────────────────────────────────────

/**
 * Normalize chat messages after restoring from storage or history.
 * Handles interrupted submissions, stale pending tasks, and
 * dangling streaming flags.
 */
export function normalizeRestoredChatMessages(
    messages: ChatMessage[],
    options: { resumePendingTasks: boolean; source: 'active' | 'history' },
): ChatMessage[] {
    const { resumePendingTasks, source } = options;

    return messages.map((message) => {
        const isGenerationMessage = message.toolType === 'image-gen' || message.toolType === 'video-gen';
        const hasTaskResult = !!message.generatedImage || !!message.generatedVideo;
        const isPendingTask = isGenerationMessage
            && (message.taskStatus === 'pending' || message.taskStatus === 'processing')
            && !hasTaskResult;
        const isInterruptedSubmission = isGenerationMessage
            && isPendingTask
            && !message.taskId
            && !hasTaskResult;

        if (isInterruptedSubmission) {
            const taskLabel = message.toolType === 'video-gen' ? '视频' : '图片';
            return {
                ...message,
                content: `⚠️ 上次${taskLabel}生成在提交阶段中断，请重新发送。`,
                isStreaming: false,
                taskStatus: 'failed' as const,
                taskProgress: 0,
                taskError: '页面刷新前未拿到任务 ID，无法继续恢复。',
            };
        }

        if (isPendingTask && !resumePendingTasks) {
            const taskLabel = message.toolType === 'video-gen' ? '视频' : '图片';
            return {
                ...message,
                content: `⚠️ 该${taskLabel}任务来自${source === 'history' ? '历史会话' : '恢复会话'}，不会继续执行，请重新发送。`,
                isStreaming: false,
                taskId: undefined,
                taskStatus: 'failed' as const,
                taskProgress: 0,
                taskError: `${source === 'history' ? '历史会话' : '恢复会话'}中的进行中任务不会自动续跑。`,
            };
        }

        if (message.role === 'assistant' && message.isStreaming && !message.content.trim()) {
            return {
                ...message,
                content: '⚠️ 上次对话已中断，请重新发送。',
                isStreaming: false,
            };
        }

        return {
            ...message,
            isStreaming: false,
        };
    });
}
