export interface ChatAttachment {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    base64Data: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    attachments?: ChatAttachment[];
    toolType?: 'image-gen' | 'video-gen' | 'design-review' | 'color-palette' | 'font-pair' | 'layout' | 'brand' | 'ux-audit';
    generatedImage?: string;
    generatedVideo?: string;
    taskId?: string;
    taskStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    taskProgress?: number;
    taskError?: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    model: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface MentionItem {
    id: string;
    label: string;
    description: string;
    insert: string;
    type: 'image-gen' | 'video-gen' | 'tool-prompt';
    systemPrompt?: string;
}

export interface SuggestionItem {
    title: string;
    description: string;
    color: string;
    imageColor: string;
}
