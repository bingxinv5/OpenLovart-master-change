import { useCallback, useMemo, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { loadCanvasSelectedModel, saveCanvasSelectedModel } from './canvas-selected-model-storage';

interface UseCanvasWorkbenchPanelsOptions {
    elements: CanvasElement[];
}

export function useCanvasWorkbenchPanels({
    elements,
}: UseCanvasWorkbenchPanelsOptions) {
    const [showChat, setShowChat] = useState(false);
    const [showLayers, setShowLayers] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showMedia, setShowMedia] = useState(false);
    const [showReferences, setShowReferences] = useState(false);
    const [selectedModel, _setSelectedModel] = useState(loadCanvasSelectedModel);
    const setSelectedModel = useCallback((model: string) => {
        _setSelectedModel(model);
        saveCanvasSelectedModel(model);
    }, []);
    const [chatPanelMode, setChatPanelMode] = useState<'side' | 'bottom'>('side');
    const [chatExpanded, setChatExpanded] = useState(false);
    const [isQueuePanelCollapsed, setIsQueuePanelCollapsed] = useState(false);

    const openChat = useCallback(() => setShowChat(true), []);
    const closeChat = useCallback(() => setShowChat(false), []);
    const closeHistory = useCallback(() => setShowHistory(false), []);
    const closeMedia = useCallback(() => setShowMedia(false), []);
    const closeReferences = useCallback(() => setShowReferences(false), []);
    const toggleChat = useCallback(() => setShowChat((value) => !value), []);
    const closeLayers = useCallback(() => setShowLayers(false), []);
    const toggleHistory = useCallback(() => setShowHistory((value) => !value), []);
    const toggleMedia = useCallback(() => setShowMedia((value) => !value), []);
    const toggleReferences = useCallback(() => setShowReferences((value) => !value), []);
    const toggleLayers = useCallback(() => setShowLayers((value) => !value), []);
    const toggleChatExpanded = useCallback(() => setChatExpanded((value) => !value), []);
    const toggleQueuePanelCollapsed = useCallback(() => setIsQueuePanelCollapsed((value) => !value), []);

    const sideDockOffset = showChat && chatPanelMode === 'side'
        ? (chatExpanded ? 720 : 420)
        : 16;

    const marks = useMemo(() =>
        elements.filter((element) => element.type === 'mark').map((element) => {
            const targetEl = element.markTargetId ? elements.find((target) => target.id === element.markTargetId) : undefined;
            return {
                id: element.id,
                markNumber: element.markNumber || 0,
                markText: element.markText,
                x: element.x,
                y: element.y,
                targetImageContent: targetEl?.content,
            };
        }),
    [elements]);

    const canvasImages = useMemo(() =>
        elements
            .filter((element) => element.type === 'image' && element.content)
            .map((element) => ({
                id: element.id,
                content: element.content!,
                width: element.width || 0,
                height: element.height || 0,
                x: element.x,
                y: element.y,
            })),
    [elements]);

    return {
        canvasImages,
        chatExpanded,
        chatPanelMode,
        closeChat,
        closeHistory,
        closeLayers,
        closeMedia,
        closeReferences,
        isQueuePanelCollapsed,
        marks,
        openChat,
        selectedModel,
        setChatPanelMode,
        setSelectedModel,
        showChat,
        showHistory,
        showLayers,
        showMedia,
        showReferences,
        sideDockOffset,
        toggleChat,
        toggleChatExpanded,
        toggleHistory,
        toggleMedia,
        toggleLayers,
        toggleQueuePanelCollapsed,
        toggleReferences,
    };
}
