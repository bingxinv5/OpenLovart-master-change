'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    MessageSquare, Clock, Share2, Layout, X,
    Check, Maximize2, Trash2, Minimize2, PanelRight
} from 'lucide-react';
import { AiDesignerHistoryPanel } from './AiDesignerHistoryPanel';
import { AiDesignerInputArea } from './AiDesignerInputArea';
import { AiDesignerMessageList } from './AiDesignerMessageList';
import { aiModels, mentionItems, suggestions } from './ai-designer-panel-constants';
import type { ChatAttachment, ChatMessage, ChatSession, MentionItem } from './ai-designer-panel-types';
import {
    buildApiMessages,
    createChatAttachment,
    createChatSession,
    detectGenerationIntent,
    detectToolPrefix,
    extractBase64Data,
    extractGeneratedImageUrls,
    formatTime,
    removeImageUrlsFromContent,
} from './ai-designer-panel-utils';
import {
    getActiveChatStorageKey,
    loadActiveChat,
    loadChatSessions,
    normalizeRestoredChatMessages,
    saveActiveChat,
    saveChatSessions,
} from './ai-designer-panel-storage';
import {
    requestAiChat,
} from '@/lib/ai-client';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import { runVideoGenerationFlow } from './video-generation-flow';
import { useAiDesignerTaskPolling } from './ai-designer-task-polling';
import {
    filterMentionSuggestions,
    insertTextAtSelection,
    resolveTextareaMentionQuery,
    type TextareaMentionQuery,
} from './textarea-mention-utils';

interface AiDesignerPanelProps {
    isGenerating: boolean;
    onClose?: () => void;
    initialPrompt?: string;
    selectedModel?: string;
    onModelChange?: (model: string) => void;
    isExpanded?: boolean;
    onExpandToggle?: () => void;
    panelMode?: 'side' | 'bottom';
    onPanelModeChange?: (mode: 'side' | 'bottom') => void;
    marks?: { id: string; markNumber: number; markText?: string; x: number; y: number; targetImageContent?: string }[];
    onDeleteMark?: (id: string) => void;
    onClearAllMarks?: () => void;
    canvasImages?: { id: string; content: string; width: number; height: number; x: number; y: number }[];
    onPickFromCanvas?: () => void;
    canvasPlanContextSummary?: string;
    onApplyCanvasPlan?: (plan: unknown) => Promise<{ summary?: string } | void> | { summary?: string } | void;
}

type ParsedCanvasPlan = {
    canvasActions: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractCanvasPlanFromMessage(content: string): {
    cleanedContent: string;
    plan: ParsedCanvasPlan | null;
} {
    const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    let matchedBlock = '';
    let parsedPlan: ParsedCanvasPlan | null = null;

    while ((match = blockPattern.exec(content)) !== null) {
        const candidate = match[1]?.trim();
        if (!candidate) {
            continue;
        }

        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (isRecord(parsed) && Array.isArray(parsed.canvasActions)) {
                matchedBlock = match[0];
                parsedPlan = { canvasActions: parsed.canvasActions };
            }
        } catch {
            // Ignore malformed JSON blocks and keep scanning.
        }
    }

    if (!matchedBlock || !parsedPlan) {
        return {
            cleanedContent: content.trim(),
            plan: null,
        };
    }

    return {
        cleanedContent: content.replace(matchedBlock, '').replace(/\n{3,}/g, '\n\n').trim(),
        plan: parsedPlan,
    };
}

function buildCanvasPlanInstruction(contextSummary?: string) {
    const selectionSummary = contextSummary?.trim() || '当前没有选中任何元素，涉及选区的动作默认不可执行。';
    return [
        '[画布动作协议]',
        '你正在协助一个可编辑画布。只有当用户明确要求你直接操作画布时，才在正常答复末尾追加一个 ```json 代码块。',
        '代码块必须是一个 JSON 对象，格式为 {"canvasActions":[...]}。',
        '当前仅支持以下动作：create-image-generator、create-video-generator、create-text-note、frame-selection、save-selection-as-reference。',
        'create-image-generator / create-video-generator 可选字段：prompt、title、useSelectionAsReferences。',
        'create-text-note 必须提供 text。',
        `当前选区摘要：${selectionSummary}`,
        '如果用户只是咨询、评审、解释、闲聊，或请求超出这些动作范围，不要输出 canvasActions。',
    ].join('\n');
}

function getAiDesignerMentionSearchText(item: MentionItem): string {
    return `${item.insert} ${item.label} ${item.description}`.toLowerCase();
}

export function AiDesignerPanel({ isGenerating: externalIsGenerating, onClose, initialPrompt, selectedModel: externalModel, onModelChange, isExpanded, onExpandToggle, panelMode, onPanelModeChange, marks, onDeleteMark, onClearAllMarks, canvasImages, onPickFromCanvas, canvasPlanContextSummary, onApplyCanvasPlan }: AiDesignerPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [hasAutoSent, setHasAutoSent] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [showQuickMenu, setShowQuickMenu] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [localModel, setLocalModel] = useState('gemini-3.1-pro-preview');
    const selectedModel = externalModel || localModel;
    const setSelectedModel = (model: string) => { setLocalModel(model); onModelChange?.(model); };
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => loadChatSessions());
    const [showMentionMenu, setShowMentionMenu] = useState(false);
    const [mentionQuery, setMentionQuery] = useState<TextareaMentionQuery | null>(null);
    const [showMarksMenu, setShowMarksMenu] = useState(false);
    const [showCanvasImagesMenu, setShowCanvasImagesMenu] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const quickMenuRef = useRef<HTMLDivElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const mentionRef = useRef<HTMLDivElement>(null);
    const canvasImagesMenuRef = useRef<HTMLDivElement>(null);
    const handleSendRef = useRef<((overrideText?: string) => Promise<void>) | null>(null);
    const inputSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

    const isGenerating = isStreaming || externalIsGenerating;
    const isMentionMenuOpen = showMentionMenu || mentionQuery !== null;
    const mentionSuggestions = useMemo(
        () => mentionQuery
            ? filterMentionSuggestions(mentionItems, mentionQuery, getAiDesignerMentionSearchText)
            : mentionItems,
        [mentionQuery],
    );
    const mentionMenuTitle = mentionQuery ? '匹配的提及工具' : '@ 提及工具';
    const mentionMenuEmptyText = mentionQuery ? '没有匹配的工具，继续输入或按 Esc 关闭' : '暂无可用工具';

    // ── Task polling (extracted to ai-designer-task-polling.ts) ──
    const { pollGeneratedTask, resumedTaskKeysRef } = useAiDesignerTaskPolling(messages, setMessages);

    const [isPersistenceReady, setIsPersistenceReady] = useState(false);
    const isPersistenceReadyRef = useRef(false);
    // Keep latest values in refs for beforeunload handler
    const messagesRef = useRef(messages);
    const selectedModelRef = useRef(selectedModel);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
    useEffect(() => { isPersistenceReadyRef.current = isPersistenceReady; }, [isPersistenceReady]);

    // ========== Restore active chat on mount ==========
    useEffect(() => {
        const active = loadActiveChat();
        if (active && active.messages.length > 0) {
            setMessages(normalizeRestoredChatMessages(active.messages, {
                resumePendingTasks: true,
                source: 'active',
            }));
            setLocalModel(active.model);
            // Sync restored model to parent so externalModel stays in sync
            onModelChange?.(active.model);
        }
        setIsPersistenceReady(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ========== Persist chat sessions to localStorage ==========
    useEffect(() => {
        if (!isPersistenceReady) return;
        saveChatSessions(chatSessions);
    }, [chatSessions, isPersistenceReady]);

    // ========== Auto-save active chat ==========
    useEffect(() => {
        if (!isPersistenceReady) return;
        // Don't save while streaming to avoid saving partial content
        if (isStreaming) return;
        saveActiveChat(messages, selectedModel);
    }, [messages, selectedModel, isPersistenceReady, isStreaming]);

    // ========== Save on page close / tab switch ==========
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!isPersistenceReadyRef.current) return;
            // Save latest state synchronously on page close
            saveActiveChat(messagesRef.current, selectedModelRef.current);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // Scroll to bottom
    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [inputValue]);

    // Close dropdown menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
                setShowQuickMenu(false);
            }
            if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
                setShowModelMenu(false);
            }
            if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
                setShowMentionMenu(false);
                setMentionQuery(null);
            }
            if (canvasImagesMenuRef.current && !canvasImagesMenuRef.current.contains(e.target as Node)) {
                setShowCanvasImagesMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Listen for canvas-image-picked event (from "pick from canvas" flow)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail?.imageContent) return;
            const content = detail.imageContent as string;
            // Allow imgref:// — WorkbenchImage displays natively, resolve at send time
            setAttachments(prev => {
                if (prev.length >= 4) return prev;
                const id = `canvas-pick-${Date.now()}`;
                if (prev.some(a => a.dataUrl === content)) return prev;
                return [...prev, createChatAttachment({
                    id,
                    name: '画布选取图片',
                    dataUrl: content,
                })];
            });
        };
        window.addEventListener('canvas-image-picked-for-chat', handler);
        return () => window.removeEventListener('canvas-image-picked-for-chat', handler);
    }, []);

    // ========== File attachment handling ==========
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;
            if (attachments.length >= 4) break; // max 4 images

            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                setAttachments(prev => {
                    if (prev.length >= 4) return prev;
                    return [...prev, createChatAttachment({
                        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        name: file.name,
                        type: file.type,
                        dataUrl,
                    })];
                });
            };
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    // ========== 视频生成 Handler ==========
    const handleVideoGenTask = async (displayText: string, prompt: string, options?: { skipUserMessage?: boolean }) => {
        const currentAttachments = [...attachments];
        const assistantMsgId = `assistant-${Date.now()}`;
        const assistantMessage: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '🎬 正在提交视频生成任务...',
            timestamp: new Date(),
            isStreaming: false,
            toolType: 'video-gen',
            taskStatus: 'pending',
            taskProgress: 0,
        };

        if (options?.skipUserMessage) {
            setMessages(prev => [...prev, assistantMessage]);
        } else {
            const userMessage: ChatMessage = {
                id: `user-${Date.now()}`,
                role: 'user',
                content: displayText,
                timestamp: new Date(),
                attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
            };
            setMessages(prev => [...prev, userMessage, assistantMessage]);
            setInputValue('');
            setAttachments([]);
        }

        try {
            const data = await runVideoGenerationFlow({
                prompt,
                model: 'veo3.1',
                images: currentAttachments.length > 0
                    ? currentAttachments.slice(0, 2).map((att, i) => ({
                        image: att.dataUrl,
                        image_type: i === 0 ? 'first_frame' : 'last_frame',
                    }))
                    : undefined,
            });

            if (data.status === 'pending') {
                setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? { ...m, taskId: data.taskId, taskStatus: 'processing' as const, content: '🎬 视频生成中...' } : m
                ));
                void pollGeneratedTask(data.taskId, assistantMsgId, 'video');
            } else {
                setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? { ...m, content: '✅ 视频生成完成！', generatedVideo: data.videoUrl, taskStatus: 'completed' as const } : m
                ));
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : '视频生成失败';
            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: `❌ ${errorMsg}`, taskStatus: 'failed' as const } : m
            ));
        }
    };

    // ========== Chat-based image generation (uses /v1/chat/completions with image model) ==========
    const handleChatImageGen = async (text: string, currentAttachments: ChatAttachment[]) => {
        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date(),
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
        };
        const assistantMsgId = `assistant-${Date.now()}`;
        const assistantMessage: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '🎨 正在生成图片...',
            timestamp: new Date(),
            isStreaming: false,
            toolType: 'image-gen',
            taskStatus: 'processing',
            taskProgress: 0,
        };
        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setInputValue('');
        setAttachments([]);
        setIsStreaming(true);

        try {
            // Build messages for the image model — include attachments as image_url parts
            const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
            contentParts.push({ type: 'text', text: text });
            for (const att of currentAttachments) {
                let imageUrl = att.dataUrl;
                if (imageUrl && imageUrl.startsWith('imgref://')) continue;
                if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
                    imageUrl = `data:${att.type || 'image/png'};base64,${imageUrl}`;
                }
                contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
            }

            const apiMsg = currentAttachments.length > 0
                ? [{ role: 'user', content: contentParts }]
                : [{ role: 'user', content: text }];

            const response = await requestAiChat({
                messages: apiMsg,
                model: 'gemini-3.1-flash-image-preview',
                stream: false,
                skipSystemMessage: true,
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || data.details || '图片生成失败');

            const content: string = data.content || '';

            const imageUrls = extractGeneratedImageUrls(content);

            if (imageUrls.length > 0) {
                let cleanContent = removeImageUrlsFromContent(content);
                if (!cleanContent) cleanContent = '✅ 图片生成完成！';

                setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? {
                        ...m,
                        content: cleanContent,
                        generatedImage: imageUrls[0],
                        taskStatus: 'completed' as const,
                        isStreaming: false,
                    } : m
                ));
            } else if (content) {
                // No image found in response — show the text content as is
                setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? {
                        ...m,
                        content,
                        toolType: undefined,
                        taskStatus: undefined,
                        isStreaming: false,
                    } : m
                ));
            } else {
                throw new Error('未收到回复');
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : '图片生成失败';
            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: `❌ ${errorMsg}`, taskStatus: 'failed' as const, isStreaming: false } : m
            ));
        } finally {
            setIsStreaming(false);
        }
    };

    const handleSend = async (overrideText?: string) => {
        const text = (overrideText || inputValue).trim();
        if (!text || isGenerating) return;

        // ========== Client-side intent detection ==========
        const generationIntent = detectGenerationIntent(text);
        const currentAttachments = [...attachments];

        // Resolve any imgref:// in attachments to actual data URLs before sending
        for (let i = 0; i < currentAttachments.length; i++) {
            if (isImageRef(currentAttachments[i].dataUrl)) {
                const resolved = await getImageDataUrl(currentAttachments[i].dataUrl);
                if (resolved) {
                    currentAttachments[i] = { ...currentAttachments[i], dataUrl: resolved, base64Data: extractBase64Data(resolved) };
                }
            }
        }

        if (generationIntent === 'image') {
            await handleChatImageGen(text, currentAttachments);
            return;
        }

        if (generationIntent === 'video') {
            await handleVideoGenTask(text, text);
            return;
        }

        // ========== @ Tool routing (only for tool-prompt types like design review) ==========
        const toolMatch = detectToolPrefix(text, mentionItems);

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date(),
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
        };

        const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
        };

        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setInputValue('');
        setAttachments([]);
        setIsStreaming(true);
        setShowQuickMenu(false);

        // Build enhanced prompt for tool-prompt types (e.g. @配色方案, @设计评审)
        const apiText = (toolMatch?.tool.type === 'tool-prompt' && toolMatch.tool.systemPrompt)
            ? toolMatch.tool.systemPrompt.replace('{prompt}', toolMatch.prompt || text)
            : text;
        const baseApiMessages = buildApiMessages({
            messages,
            userText: apiText,
            currentAttachments,
            marks,
            webSearchEnabled,
        });
        const apiMessages = onApplyCanvasPlan
            ? [
                { role: 'user' as const, content: buildCanvasPlanInstruction(canvasPlanContextSummary) },
                {
                    role: 'assistant' as const,
                    content: '好的。只有在用户明确要求直接操作画布时，我才会在正常答复末尾附加符合协议的 JSON 代码块。',
                },
                ...baseApiMessages,
            ]
            : baseApiMessages;
        const controller = new AbortController();
        setAbortController(controller);

        try {
            const response = await requestAiChat(
                {
                    messages: apiMessages,
                    model: selectedModel,
                    stream: true,
                },
                { signal: controller.signal },
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || errData.details || `请求失败 (${response.status})`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('无法读取响应流');

            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullContent += parsed.content;
                            setMessages(prev => prev.map(m =>
                                m.id === assistantMessage.id ? { ...m, content: fullContent } : m
                            ));
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }

            let finalContent = fullContent.trim();
            if (onApplyCanvasPlan) {
                const { plan, cleanedContent } = extractCanvasPlanFromMessage(fullContent);
                if (plan && plan.canvasActions.length > 0) {
                    try {
                        const applyResult = await onApplyCanvasPlan(plan);
                        const summary = applyResult?.summary?.trim();
                        if (summary) {
                            finalContent = cleanedContent ? `${cleanedContent}\n\n${summary}` : summary;
                        } else if (cleanedContent) {
                            finalContent = cleanedContent;
                        } else {
                            finalContent = '已按要求更新画布。';
                        }
                    } catch (error: unknown) {
                        const errorMessage = error instanceof Error ? error.message : '画布操作执行失败';
                        finalContent = cleanedContent
                            ? `${cleanedContent}\n\n⚠️ 画布操作未执行：${errorMessage}`
                            : `⚠️ 画布操作未执行：${errorMessage}`;
                    }
                }
            }

            setMessages(prev => prev.map(m =>
                m.id === assistantMessage.id ? { ...m, content: finalContent, isStreaming: false } : m
            ));
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                setMessages(prev => prev.map(m =>
                    m.id === assistantMessage.id ? { ...m, content: m.content || '已取消生成', isStreaming: false } : m
                ));
            } else {
                const errorMsg = error instanceof Error ? error.message : '发送失败';
                console.error('[AiChat] Error:', errorMsg);
                setMessages(prev => prev.map(m =>
                    m.id === assistantMessage.id ? { ...m, content: `❌ 出错了: ${errorMsg}`, isStreaming: false } : m
                ));
            }
        } finally {
            setIsStreaming(false);
            setAbortController(null);
        }
    };

    useEffect(() => {
        handleSendRef.current = handleSend;
    });

    // Auto-send initial prompt
    useEffect(() => {
        if (!initialPrompt || hasAutoSent || isGenerating || messages.length > 0) {
            return;
        }

        setHasAutoSent(true);
        const timer = window.setTimeout(() => {
            void handleSendRef.current?.(initialPrompt);
        }, 300);

        return () => {
            window.clearTimeout(timer);
        };
    }, [initialPrompt, hasAutoSent, isGenerating, messages.length]);

    const handleStop = () => { abortController?.abort(); };

    const handleCopy = async (content: string, id: string) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch { /* ignore */ }
    };

    const handleClearChat = () => {
        resumedTaskKeysRef.current.clear();
        setMessages([]);
        setAttachments([]);
        localStorage.removeItem(getActiveChatStorageKey());
    };

    // ========== New Chat ==========
    const handleNewChat = () => {
        // Save current chat to history if it has messages
        if (messages.length > 0) {
            const session = createChatSession({ messages, selectedModel });
            setChatSessions(prev => [session, ...prev].slice(0, 20)); // Keep last 20
        }
        resumedTaskKeysRef.current.clear();
        setMessages([]);
        setAttachments([]);
        setInputValue('');
        // Immediately clear active chat so there's no stale data if the app crashes
        localStorage.removeItem(getActiveChatStorageKey());
        textareaRef.current?.focus();
    };

    // ========== Restore history session ==========
    const handleRestoreSession = (session: ChatSession) => {
        // Save current if it has messages
        if (messages.length > 0) {
            setChatSessions(prev => {
                const newSession = createChatSession({ messages, selectedModel });
                // Remove the restored session and add current
                const filtered = prev.filter(s => s.id !== session.id);
                return [newSession, ...filtered].slice(0, 20);
            });
        } else {
            setChatSessions(prev => prev.filter(s => s.id !== session.id));
        }
        resumedTaskKeysRef.current.clear();
        setMessages(normalizeRestoredChatMessages(session.messages, {
            resumePendingTasks: false,
            source: 'history',
        }));
        setAttachments([]);
        setInputValue('');
        setSelectedModel(session.model);
        setShowHistory(false);
    };

    const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setChatSessions(prev => prev.filter(s => s.id !== sessionId));
    };

    // ========== Export / Share ==========
    const handleExportChat = async () => {
        if (messages.length === 0) return;
        const modelLabel = aiModels.find(m => m.id === selectedModel)?.label || selectedModel;
        let text = `# AI 设计对话记录\n模型: ${modelLabel}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;
        for (const msg of messages) {
            const role = msg.role === 'user' ? '👤 用户' : '🤖 AI';
            const time = formatTime(msg.timestamp);
            text += `### ${role}  [${time}]\n\n${msg.content}\n\n---\n\n`;
        }
        // Try clipboard first, fallback to file download
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId('export');
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            const blob = new Blob([text], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleSuggestionClick = (description: string) => {
        if (!isGenerating) handleSend(description);
    };

    const syncInputSelection = useCallback((selection: { start: number; end: number }, value?: string) => {
        inputSelectionRef.current = selection;

        const sourceValue = value ?? textareaRef.current?.value ?? inputValue;
        const nextMentionQuery = selection.start === selection.end
            ? resolveTextareaMentionQuery(sourceValue, selection.start)
            : null;
        setMentionQuery(nextMentionQuery);
    }, [inputValue]);

    const restoreInputSelection = useCallback((selection: { start: number; end: number }) => {
        requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) {
                return;
            }

            textarea.focus();
            textarea.setSelectionRange(selection.start, selection.end);
        });
    }, []);

    const insertIntoInput = useCallback((insertText: string, options?: { replaceActiveQuery?: boolean }) => {
        const textarea = textareaRef.current;
        const currentValue = textarea?.value ?? inputValue;
        const rawSelection = textarea ? {
            start: textarea.selectionStart ?? inputSelectionRef.current.start,
            end: textarea.selectionEnd ?? inputSelectionRef.current.end,
        } : inputSelectionRef.current;
        const activeQuery = options?.replaceActiveQuery && rawSelection.start === rawSelection.end
            ? resolveTextareaMentionQuery(currentValue, rawSelection.start)
            : null;
        const { nextValue, nextSelection } = insertTextAtSelection({
            value: currentValue,
            selection: rawSelection,
            insertText,
            replaceRange: activeQuery ? { start: activeQuery.start, end: activeQuery.end } : undefined,
            ensureSpacing: true,
        });

        inputSelectionRef.current = nextSelection;
        setInputValue(nextValue);
        setMentionQuery(null);
        restoreInputSelection(nextSelection);
    }, [inputValue, restoreInputSelection]);

    const handleMentionSelect = (insert: string) => {
        insertIntoInput(insert, { replaceActiveQuery: true });
        setShowMentionMenu(false);
        setMentionQuery(null);
    };

    const handleShuffleSuggestions = () => {
        setSuggestionIndex(prev => (prev + 1) % suggestions.length);
    };

    const handleQuickCommand = (prompt: string) => {
        setShowQuickMenu(false);
        if (!isGenerating) handleSend(prompt);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const editor = e.currentTarget;
        const liveValue = editor.value;
        const liveSelection = {
            start: editor.selectionStart ?? liveValue.length,
            end: editor.selectionEnd ?? (editor.selectionStart ?? liveValue.length),
        };

        inputSelectionRef.current = liveSelection;
        const liveMentionQuery = liveSelection.start === liveSelection.end
            ? resolveTextareaMentionQuery(liveValue, liveSelection.start)
            : null;
        const liveMentionSuggestions = liveMentionQuery
            ? filterMentionSuggestions(mentionItems, liveMentionQuery, getAiDesignerMentionSearchText)
            : [];

        if (liveMentionQuery) {
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                setShowMentionMenu(false);
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey && liveMentionSuggestions.length > 0) {
                e.preventDefault();
                handleMentionSelect(liveMentionSuggestions[0].insert);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleToggleMentionMenu = useCallback(() => {
        if (isMentionMenuOpen) {
            setShowMentionMenu(false);
            setMentionQuery(null);
            return;
        }

        const textarea = textareaRef.current;
        const currentValue = textarea?.value ?? inputValue;
        const currentSelection = textarea ? {
            start: textarea.selectionStart ?? inputSelectionRef.current.start,
            end: textarea.selectionEnd ?? inputSelectionRef.current.end,
        } : inputSelectionRef.current;

        inputSelectionRef.current = currentSelection;
        setMentionQuery(
            currentSelection.start === currentSelection.end
                ? resolveTextareaMentionQuery(currentValue, currentSelection.start)
                : null,
        );
        setShowMentionMenu(true);
        textarea?.focus();
    }, [inputValue, isMentionMenuOpen]);

    const handleAddCanvasImageAttachment = useCallback((img: { id: string; content: string }, idx: number) => {
        if (attachments.length >= 4) return;

        setAttachments(prev => {
            if (prev.length >= 4) return prev;
            if (prev.some(a => a.id === `canvas-${img.id}`)) return prev;
            return [...prev, createChatAttachment({
                id: `canvas-${img.id}`,
                name: `画布图片 ${idx + 1}`,
                dataUrl: img.content,
            })];
        });
        setShowCanvasImagesMenu(false);
    }, [attachments.length]);

    const handleReferenceMark = useCallback((mark: { id: string; markNumber: number; markText?: string; x: number; y: number; targetImageContent?: string }) => {
        const markRef = `[标记#${mark.markNumber}${mark.markText ? `: ${mark.markText}` : ''}${mark.targetImageContent ? ' 📷' : ''} (位置: ${Math.round(mark.x)}, ${Math.round(mark.y)})]`;
        insertIntoInput(`${markRef} `);

        if (mark.targetImageContent) {
            const content = mark.targetImageContent;
            setAttachments(prev => {
                if (prev.length >= 4) return prev;
                const attId = `mark-img-${mark.id}`;
                if (prev.some(a => a.id === attId)) return prev;
                return [...prev, createChatAttachment({
                    id: attId,
                    name: `标记#${mark.markNumber} 关联图片`,
                    dataUrl: content,
                })];
            });
        }

        setShowMarksMenu(false);
    }, [insertIntoInput]);

    const handleReferenceAllMarks = useCallback(() => {
        if (!marks || marks.length === 0) return;

        const allMarks = marks.map(m => `[标记#${m.markNumber}${m.markText ? `: ${m.markText}` : ''}${m.targetImageContent ? ' 📷' : ''} (位置: ${Math.round(m.x)}, ${Math.round(m.y)})]`).join(' ');
        insertIntoInput(`${allMarks} `);

        const marksWithImages = marks.filter(m => m.targetImageContent);
        if (marksWithImages.length > 0) {
            setAttachments(prev => {
                let updated = [...prev];
                for (const mark of marksWithImages) {
                    if (updated.length >= 4) break;
                    const attId = `mark-img-${mark.id}`;
                    if (updated.some(a => a.id === attId)) continue;
                    updated = [...updated, createChatAttachment({
                        id: attId,
                        name: `标记#${mark.markNumber} 关联图片`,
                        dataUrl: mark.targetImageContent!,
                    })];
                }
                return updated;
            });
        }

        setShowMarksMenu(false);
    }, [insertIntoInput, marks]);

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                if (attachments.length >= 4) break;
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    setAttachments(prev => {
                        if (prev.length >= 4) return prev;
                        return [...prev, createChatAttachment({
                            id: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            name: `粘贴图片 ${prev.length + 1}`,
                            type: file.type,
                            dataUrl,
                        })];
                    });
                };
                reader.readAsDataURL(file);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Header Icons */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="清空对话"
                        >
                            <Trash2 size={12} />
                            <span>清空</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3 text-gray-400">
                    {/* New Chat */}
                    <button
                        onClick={handleNewChat}
                        className={`hover:text-gray-600 transition-colors ${messages.length > 0 ? 'text-gray-400' : 'text-gray-200 cursor-not-allowed'}`}
                        title="新建对话"
                        disabled={messages.length === 0}
                    >
                        <MessageSquare size={18} />
                    </button>

                    {/* History */}
                    <button
                        onClick={() => setShowHistory(prev => !prev)}
                        className={`transition-colors ${showHistory ? 'text-blue-500' : 'hover:text-gray-600'}`}
                        title="历史记录"
                    >
                        <Clock size={18} />
                    </button>

                    {/* Export / Share */}
                    <button
                        onClick={handleExportChat}
                        className={`transition-colors ${messages.length > 0 ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${copiedId === 'export' ? 'text-green-500' : ''}`}
                        title={copiedId === 'export' ? '已复制到剪贴板!' : '导出对话'}
                        disabled={messages.length === 0}
                    >
                        {copiedId === 'export' ? <Check size={18} /> : <Share2 size={18} />}
                    </button>

                    {/* Panel Layout */}
                    <button
                        onClick={() => onPanelModeChange?.(panelMode === 'side' ? 'bottom' : 'side')}
                        className={`transition-colors ${onPanelModeChange ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${panelMode === 'bottom' ? 'text-blue-500' : ''}`}
                        title={panelMode === 'bottom' ? '侧边面板' : '底部面板'}
                    >
                        {panelMode === 'bottom' ? <PanelRight size={18} /> : <Layout size={18} />}
                    </button>

                    {/* Expand / Collapse */}
                    <button
                        onClick={() => onExpandToggle?.()}
                        className={`transition-colors ${onExpandToggle ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${isExpanded ? 'text-blue-500' : ''}`}
                        title={isExpanded ? '收缩面板' : '展开面板'}
                    >
                        {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>

                    {onClose && (
                        <button onClick={onClose} title="关闭 AI 设计师" aria-label="关闭 AI 设计师" className="hover:text-gray-600 transition-colors ml-1">
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            <AiDesignerHistoryPanel
                showHistory={showHistory}
                chatSessions={chatSessions}
                onClose={() => setShowHistory(false)}
                onRestoreSession={handleRestoreSession}
                onDeleteSession={handleDeleteSession}
                onClearSessions={() => setChatSessions([])}
            />

            <AiDesignerMessageList
                messages={messages}
                suggestionIndex={suggestionIndex}
                copiedId={copiedId}
                messagesEndRef={messagesEndRef}
                onSuggestionClick={handleSuggestionClick}
                onShuffleSuggestions={handleShuffleSuggestions}
                onCopy={handleCopy}
            />

            <AiDesignerInputArea
                inputValue={inputValue}
                attachments={attachments}
                webSearchEnabled={webSearchEnabled}
                selectedModel={selectedModel}
                showCanvasImagesMenu={showCanvasImagesMenu}
                showMentionMenu={isMentionMenuOpen}
                mentionSuggestions={mentionSuggestions}
                mentionMenuTitle={mentionMenuTitle}
                mentionMenuEmptyText={mentionMenuEmptyText}
                showQuickMenu={showQuickMenu}
                showMarksMenu={showMarksMenu}
                showModelMenu={showModelMenu}
                isStreaming={isStreaming}
                isGenerating={isGenerating}
                canvasImages={canvasImages}
                marks={marks}
                onPickFromCanvas={() => {
                    setShowCanvasImagesMenu(false);
                    onPickFromCanvas?.();
                }}
                onDeleteMark={onDeleteMark}
                onClearAllMarks={() => {
                    onClearAllMarks?.();
                    setShowMarksMenu(false);
                }}
                fileInputRef={fileInputRef}
                textareaRef={textareaRef}
                quickMenuRef={quickMenuRef}
                modelMenuRef={modelMenuRef}
                mentionRef={mentionRef}
                canvasImagesMenuRef={canvasImagesMenuRef}
                onInputChange={setInputValue}
                onInputSelectionChange={syncInputSelection}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFileSelect={handleFileSelect}
                onRemoveAttachment={removeAttachment}
                onToggleCanvasImagesMenu={() => setShowCanvasImagesMenu(prev => !prev)}
                onAddCanvasImageAttachment={handleAddCanvasImageAttachment}
                onToggleMentionMenu={handleToggleMentionMenu}
                onMentionSelect={handleMentionSelect}
                onToggleQuickMenu={() => setShowQuickMenu(prev => !prev)}
                onQuickCommand={handleQuickCommand}
                onToggleWebSearch={() => setWebSearchEnabled(prev => !prev)}
                onToggleMarksMenu={() => setShowMarksMenu(prev => !prev)}
                onReferenceMark={handleReferenceMark}
                onReferenceAllMarks={handleReferenceAllMarks}
                onToggleModelMenu={() => setShowModelMenu(prev => !prev)}
                onSelectModel={(modelId) => {
                    setSelectedModel(modelId);
                    setShowModelMenu(false);
                }}
                onStop={handleStop}
                onSend={() => handleSend()}
            />
        </div>
    );
}
