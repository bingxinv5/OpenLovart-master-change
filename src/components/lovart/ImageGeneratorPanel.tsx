"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sparkles, ChevronDown, Zap, Upload, X, Loader2, MousePointerClick, History, RotateCcw, LibraryBig, Star, Pencil, Trash2, Check, FolderOpen, Search, Plus, Settings2 } from 'lucide-react';
import { GeneratorStatusCard, getGeneratorStatusState } from './GeneratorStatusCard';
import { WorkbenchImage } from './WorkbenchImage';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from './generator-error-utils';
import { createGeneratorTaskUpdate, serializeReferenceImages, useClearGeneratorError, usePersistGeneratorValue } from './generator-panel-hooks';
import {
    appendImageGenerationHistory,
    clearImageGenerationHistory,
    getRecentReferenceLibrary,
    migrateImageGenerationStorage,
    readFavoriteReferenceImages,
    readImageGenerationHistory,
    removeFavoriteReferenceImage,
    renameFavoriteReferenceImage,
    saveFavoriteReferenceImage,
    subscribeFavoriteReferenceImages,
    subscribeImageGenerationHistory,
    touchFavoriteReferenceImage,
    type FavoriteReferenceImageItem,
    type ImageGenerationHistoryItem,
    type RecentReferenceImageItem,
} from './image-generation-history';
import {
    findGeneratorElement,
    readFileAsDataUrl,
    useCanvasImageSelectionEvent,
    type GeneratorCanvasElement,
} from './generator-panel-shared';
import {
    filterMentionSuggestions,
    insertTextAtSelection,
    normalizeMentionText,
    removeMentionTokens,
    resolveTextareaMentionQuery,
    resolveTokenDeletionRange,
    type TextareaMentionQuery,
    type TextareaSelection,
} from './textarea-mention-utils';
import { runImageGenerationFlow } from './image-generation-flow';
import { requestImageGeneration } from '@/lib/ai-client';
import { isDataUrl } from '@/lib/data-url';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import { getMaxReferenceImagesForImageModel, shouldUseDomesticImageBatching } from '@/lib/image-generation-models';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { compressReferenceImageDataUrl } from '@/lib/reference-image-processing';
import { useImageGenerationDefaults } from '@/lib/generation-defaults';

type ImageModel = 'gemini-3.1-flash-image-preview' | 'nano-banana-2' | 'grok-4.2-image' | 'doubao-seedream-5-0-260128';
type AspectRatio = 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9';
type ImageSize = '1K' | '2K' | '4K';

const GROK_IMAGE_ASPECT_RATIOS: AspectRatio[] = ['4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1'];
const GROK_IMAGE_SIZES: ImageSize[] = ['1K', '2K'];
const PROMPT_REFERENCE_TOKEN_REGEX = /@参考图(\d+)/g;
const IMAGE_REFERENCE_TARGET_BYTES = 2 * 1024 * 1024;

const MODEL_LABELS: Record<ImageModel, string> = {
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
    'nano-banana-2': 'nano-banana-2',
    'grok-4.2-image': 'grok-4.2-image',
    'doubao-seedream-5-0-260128': 'doubao-seedream-5-0-260128',
};

type GenerateCount = 1 | 2 | 3 | 4;

type PromptReferenceMention = {
    id: string;
    token: string;
    replacement: string;
    label: string;
    name: string;
    image: File | string;
    searchText: string;
};

function buildPromptReferenceMentions(referenceImages: (File | string)[]): PromptReferenceMention[] {
    return referenceImages.map((image, index) => ({
        id: `reference-${index}`,
        token: `@参考图${index + 1}`,
        replacement: `第${index + 1}张参考图`,
        label: `输入 ${`@参考图${index + 1}`} 引用这张参考图`,
        name: `参考图 ${index + 1}`,
        image,
        searchText: `参考图${index + 1} @参考图${index + 1}`.toLowerCase(),
    }));
}

function resolvePromptReferenceMentions(prompt: string, mentions: PromptReferenceMention[]) {
    const replacements = new Map(mentions.map((mention) => [mention.token, mention.replacement]));
    const invalidTokens: string[] = [];
    const materializedPrompt = prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            if (!invalidTokens.includes(fullMatch)) {
                invalidTokens.push(fullMatch);
            }
            return fullMatch;
        }

        const replacement = replacements.get(fullMatch);
        if (!replacement) {
            if (!invalidTokens.includes(fullMatch)) {
                invalidTokens.push(fullMatch);
            }
            return fullMatch;
        }

        return replacement;
    });

    return {
        materializedPrompt: materializedPrompt.trim(),
        invalidTokens,
    };
}

function getPromptMentionSuggestions(mentions: PromptReferenceMention[], query: TextareaMentionQuery | null) {
    return filterMentionSuggestions(mentions, query, (mention) => mention.searchText);
}

function remapPromptReferenceTokensAfterRemoval(prompt: string, removedTokenIndex: number) {
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex)) {
            return fullMatch;
        }

        if (mentionIndex === removedTokenIndex) {
            return '';
        }

        if (mentionIndex > removedTokenIndex) {
            return `@参考图${mentionIndex - 1}`;
        }

        return fullMatch;
    }));
}

function clampPromptReferenceTokens(prompt: string, maxReferenceImages: number) {
    return normalizeMentionText(prompt.replace(PROMPT_REFERENCE_TOKEN_REGEX, (fullMatch, rawIndex) => {
        const mentionIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isSafeInteger(mentionIndex) || mentionIndex <= maxReferenceImages) {
            return fullMatch;
        }

        return '';
    }));
}

interface ImageGeneratorPanelProps {
    elementId: string;
    onGenerate: (imageUrl: string) => void;
    onRecoverTask?: (elementId: string, taskId: string) => Promise<void>;
    isGenerating: boolean;
    style?: React.CSSProperties;
    canvasElements?: GeneratorCanvasElement[];
    onElementChange?: (id: string, attrs: Record<string, unknown>) => void;
    onSubmittingChange?: (id: string, isSubmitting: boolean, liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; generateCount?: number }, completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' }) => void;
    onAddElement?: (element: { id: string; type: string; x: number; y: number; width: number; height: number; content?: string; generatingTaskId?: string; generatingTaskType?: string; generatingProgress?: number; savedPrompt?: string; selectedModel?: string; selectedAspectRatio?: string; selectedImageSize?: string; selectedGenerateCount?: number; generationResultIndex?: number; savedReferenceImages?: string }) => void;
    onRequestCanvasSelect?: () => void;
    projectReferenceImages?: ProjectReferenceImageItem[];
    onUseProjectReferenceImage?: (id: string) => void;
}

export function ImageGeneratorPanel(props: ImageGeneratorPanelProps) {
    const { elementId, onGenerate, onRecoverTask, isGenerating: isGeneratingFromParent, style, canvasElements, onElementChange, onSubmittingChange, onAddElement, onRequestCanvasSelect, projectReferenceImages = [], onUseProjectReferenceImage } = props;
    const imageDefaults = useImageGenerationDefaults();

    // Read initial values from element
    const currentElement = findGeneratorElement(canvasElements, elementId);
    const [prompt, setPrompt] = useState(currentElement?.savedPrompt || '');
    const [model, setModel] = useState<ImageModel>((currentElement?.selectedModel as ImageModel) || imageDefaults.model);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>((currentElement?.selectedAspectRatio as AspectRatio) || imageDefaults.aspectRatio);
    const [generateCount, setGenerateCount] = useState<GenerateCount>((currentElement?.selectedGenerateCount as GenerateCount) || imageDefaults.generateCount);
    const [imageSize, setImageSize] = useState<ImageSize>((currentElement?.selectedImageSize as ImageSize) || imageDefaults.imageSize);

    // Read generation status from element (polling is done by parent)
    const isGeneratingFromElement = !!currentElement?.generatingTaskId;
    const progressFromElement = currentElement?.generatingProgress || 0;
    const errorFromElement = currentElement?.generatingError || null;
    const [referenceImages, setReferenceImages] = useState<(File | string)[]>(() => {
        if (currentElement?.savedReferenceImages) {
            try { return JSON.parse(currentElement.savedReferenceImages) as string[]; } catch { return []; }
        }
        // Migrate from legacy single referenceImage
        if (currentElement?.savedReferenceImage) {
            return [currentElement.savedReferenceImage];
        }
        return [];
    });
    const [recentHistory, setRecentHistory] = useState<ImageGenerationHistoryItem[]>([]);
    const [referenceLibrary, setReferenceLibrary] = useState<RecentReferenceImageItem[]>([]);
    const [favoriteReferences, setFavoriteReferences] = useState<FavoriteReferenceImageItem[]>([]);
    const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
    const [favoriteLabelDraft, setFavoriteLabelDraft] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryTaskId, setRecoveryTaskId] = useState(currentElement?.generatingTaskId || '');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const isSubmittingToApi = isSubmitting || isGeneratingFromParent;
    const isGenerating = isGeneratingFromElement || isSubmittingToApi;
    const progress = progressFromElement;
    const statusState = getGeneratorStatusState({
        kind: 'image',
        isSubmitting: isGeneratingFromParent,
        isGeneratingTask: isGeneratingFromElement,
        progress,
        error: errorFromElement || errorMsg,
    });

    // Dropdown states
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
    const [showResourceLibrary, setShowResourceLibrary] = useState(false);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showRecoveryPanel, setShowRecoveryPanel] = useState(false);
    const [showAddImageMenu, setShowAddImageMenu] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [resourceLibraryTab, setResourceLibraryTab] = useState<'project' | 'favorite' | 'history' | 'library'>('history');
    const [mentionQuery, setMentionQuery] = useState<TextareaMentionQuery | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptInputRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const promptSelectionRef = useRef<TextareaSelection>({
        start: prompt.length,
        end: prompt.length,
    });
    const isPromptComposingRef = useRef(false);
    const dismissedCanvasReferenceSourceIdsRef = useRef<Set<string>>(new Set());
    const promptReferenceMentions = useMemo(() => buildPromptReferenceMentions(referenceImages), [referenceImages]);
    const mentionSuggestions = useMemo(
        () => getPromptMentionSuggestions(promptReferenceMentions, mentionQuery),
        [mentionQuery, promptReferenceMentions],
    );

    const closeAllMenus = useCallback(() => {
        setShowModelMenu(false);
        setShowAspectRatioMenu(false);
        setShowResourceLibrary(false);
        setShowSettingsPanel(false);
        setShowRecoveryPanel(false);
        setShowAddImageMenu(false);
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        const el = promptInputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [prompt]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closeAllMenus();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeAllMenus]);

    const models: ImageModel[] = ['gemini-3.1-flash-image-preview', 'nano-banana-2', 'grok-4.2-image', 'doubao-seedream-5-0-260128'];
    const aspectRatios: AspectRatio[] = ['auto', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1', '4:5', '5:4', '21:9'];
    const imageSizes: ImageSize[] = ['1K', '2K', '4K'];
    const maxReferenceImages = getMaxReferenceImagesForImageModel(model);
    const isGrokImageModel = model === 'grok-4.2-image';
    const usesDomesticImageBatching = shouldUseDomesticImageBatching(model);
    const grokUsesReferenceAspectRatio = isGrokImageModel && referenceImages.length > 0;
    const availableAspectRatios = isGrokImageModel ? GROK_IMAGE_ASPECT_RATIOS : aspectRatios;
    const availableImageSizes = isGrokImageModel ? GROK_IMAGE_SIZES : imageSizes;
    const displayedAspectRatio = grokUsesReferenceAspectRatio
        ? '参考图比例'
        : aspectRatio === 'auto'
            ? '自动'
            : aspectRatio;

    useEffect(() => {
        if (isGrokImageModel && !GROK_IMAGE_ASPECT_RATIOS.includes(aspectRatio)) {
            setAspectRatio('1:1');
        }
    }, [aspectRatio, isGrokImageModel]);

    useEffect(() => {
        if (isGrokImageModel && imageSize === '4K') {
            setImageSize('2K');
        }
    }, [imageSize, isGrokImageModel]);

    useEffect(() => {
        if (grokUsesReferenceAspectRatio && showAspectRatioMenu) {
            setShowAspectRatioMenu(false);
        }
    }, [grokUsesReferenceAspectRatio, showAspectRatioMenu]);

    useEffect(() => {
        if (referenceImages.length <= maxReferenceImages) {
            return;
        }

        setReferenceImages((prev) => prev.slice(0, maxReferenceImages));
        setPrompt((prev) => clampPromptReferenceTokens(prev, maxReferenceImages));
        setMentionQuery(null);
    }, [maxReferenceImages, referenceImages.length]);

    const refreshRecentHistory = useCallback(() => {
        setRecentHistory(readImageGenerationHistory());
        setReferenceLibrary(getRecentReferenceLibrary());
    }, []);

    const refreshFavoriteReferences = useCallback(() => {
        setFavoriteReferences(readFavoriteReferenceImages());
    }, []);

    const mergeReferenceImages = useCallback((current: (File | string)[], incoming: (File | string)[]) => {
        const next = [...current];
        for (const candidate of incoming) {
            const duplicate = next.some((existing) => {
                if (typeof existing === 'string' && typeof candidate === 'string') {
                    return existing === candidate;
                }
                if (existing instanceof File && candidate instanceof File) {
                    return existing.name === candidate.name
                        && existing.size === candidate.size
                        && existing.lastModified === candidate.lastModified;
                }
                return false;
            });

            if (!duplicate) {
                next.push(candidate);
            }

            if (next.length >= maxReferenceImages) {
                break;
            }
        }

        return next.slice(0, maxReferenceImages);
    }, [maxReferenceImages]);

    const syncPromptMentionQuery = useCallback((nextPrompt: string, caretIndex: number) => {
        setMentionQuery(resolveTextareaMentionQuery(nextPrompt, caretIndex));
    }, []);

    const syncPromptSelectionFromInput = useCallback((input: HTMLTextAreaElement | null) => {
        if (!input) {
            return;
        }

        promptSelectionRef.current = {
            start: input.selectionStart ?? 0,
            end: input.selectionEnd ?? (input.selectionStart ?? 0),
        };

        if (!isPromptComposingRef.current) {
            syncPromptMentionQuery(input.value, promptSelectionRef.current.start);
        }
    }, [syncPromptMentionQuery]);

    const handleInsertPromptReferenceToken = useCallback((mention: PromptReferenceMention) => {
        const textarea = promptInputRef.current;
        const basePrompt = textarea?.value ?? prompt;
        const selection = textarea ? {
            start: textarea.selectionStart ?? promptSelectionRef.current.start,
            end: textarea.selectionEnd ?? promptSelectionRef.current.end,
        } : promptSelectionRef.current;
        const activeQuery = selection.start === selection.end
            ? resolveTextareaMentionQuery(basePrompt, selection.start)
            : null;
        const { nextValue, nextSelection } = insertTextAtSelection({
            value: basePrompt,
            selection,
            insertText: `${mention.token} `,
            replaceRange: activeQuery ? { start: activeQuery.start, end: activeQuery.end } : undefined,
            ensureSpacing: true,
        });

        promptSelectionRef.current = nextSelection;
        setPrompt(nextValue);
        setMentionQuery(null);

        requestAnimationFrame(() => {
            const input = promptInputRef.current;
            if (!input) {
                return;
            }

            input.focus();
            input.setSelectionRange(nextSelection.start, nextSelection.end);
        });
    }, [prompt]);

    const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextPrompt = event.target.value;
        promptSelectionRef.current = {
            start: event.target.selectionStart ?? nextPrompt.length,
            end: event.target.selectionEnd ?? (event.target.selectionStart ?? nextPrompt.length),
        };
        setPrompt(nextPrompt);
        if (!isPromptComposingRef.current) {
            syncPromptMentionQuery(nextPrompt, promptSelectionRef.current.start);
        }
    }, [syncPromptMentionQuery]);

    const handlePromptSelectionChange = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
        syncPromptSelectionFromInput(event.currentTarget);
    }, [syncPromptSelectionFromInput]);

    const handlePromptCompositionEnd = useCallback((event: React.CompositionEvent<HTMLTextAreaElement>) => {
        isPromptComposingRef.current = false;
        const nextPrompt = event.currentTarget.value;
        promptSelectionRef.current = {
            start: event.currentTarget.selectionStart ?? nextPrompt.length,
            end: event.currentTarget.selectionEnd ?? (event.currentTarget.selectionStart ?? nextPrompt.length),
        };
        setPrompt(nextPrompt);
        syncPromptMentionQuery(nextPrompt, promptSelectionRef.current.start);
    }, [syncPromptMentionQuery]);

    const clearCanvasReferenceBinding = useCallback(() => {
        const sourceId = currentElement?.referenceImageId;
        if (sourceId) {
            dismissedCanvasReferenceSourceIdsRef.current.add(sourceId);
        }

        onElementChange?.(elementId, {
            referenceImageId: undefined,
            savedReferenceImage: undefined,
            savedReferenceImages: undefined,
        });
    }, [currentElement?.referenceImageId, elementId, onElementChange]);

    const handleClearReferenceImages = useCallback(() => {
        setPrompt((prev) => removeMentionTokens(prev, promptReferenceMentions.map((mention) => mention.token)));
        setReferenceImages([]);
        setMentionQuery(null);
        clearCanvasReferenceBinding();
    }, [clearCanvasReferenceBinding, promptReferenceMentions]);

    const handleRemoveReferenceImage = useCallback((index: number) => {
        setPrompt((prev) => remapPromptReferenceTokensAfterRemoval(prev, index + 1));
        setReferenceImages((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            if (next.length === 0) {
                clearCanvasReferenceBinding();
            }
            return next;
        });
        setMentionQuery(null);
    }, [clearCanvasReferenceBinding]);

    usePersistGeneratorValue({ elementId, key: 'selectedModel', value: model, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedAspectRatio', value: aspectRatio, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'savedPrompt', value: prompt, onElementChange, skipInitial: true, debounceMs: 160 });
    usePersistGeneratorValue({ elementId, key: 'selectedGenerateCount', value: generateCount, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedImageSize', value: imageSize, onElementChange, skipInitial: true });
    usePersistGeneratorValue({
        elementId,
        key: 'savedReferenceImages',
        value: referenceImages,
        onElementChange,
        skipInitial: true,
        serialize: serializeReferenceImages,
    });

    useEffect(() => {
        const serializedReferences = currentElement?.savedReferenceImages
            ?? (currentElement?.savedReferenceImage ? JSON.stringify([currentElement.savedReferenceImage]) : undefined);
        if (!serializedReferences) {
            return;
        }

        try {
            const parsed = JSON.parse(serializedReferences);
            if (!Array.isArray(parsed)) {
                return;
            }

            const normalized = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
            setReferenceImages((prev) => {
                if (
                    prev.length === normalized.length
                    && prev.every((item, index) => typeof item === 'string' && item === normalized[index])
                ) {
                    return prev;
                }

                return normalized;
            });
        } catch {
            // Ignore malformed persisted reference payloads.
        }
    }, [currentElement?.savedReferenceImage, currentElement?.savedReferenceImages]);

    useEffect(() => {
        if (!currentElement?.selectedModel) {
            setModel(imageDefaults.model);
        }
        if (!currentElement?.selectedAspectRatio) {
            setAspectRatio(imageDefaults.aspectRatio);
        }
        if (typeof currentElement?.selectedGenerateCount !== 'number') {
            setGenerateCount(imageDefaults.generateCount);
        }
        if (!currentElement?.selectedImageSize) {
            setImageSize(imageDefaults.imageSize);
        }
    }, [currentElement?.selectedAspectRatio, currentElement?.selectedGenerateCount, currentElement?.selectedImageSize, currentElement?.selectedModel, imageDefaults]);

    // Sync with workbench settings changes (reactive via useImageGenerationDefaults)
    useEffect(() => {
        if (!currentElement?.selectedModel) {
            setModel(imageDefaults.model);
        }
        if (!currentElement?.selectedAspectRatio) {
            setAspectRatio(imageDefaults.aspectRatio);
        }
        if (typeof currentElement?.selectedGenerateCount !== 'number') {
            setGenerateCount(imageDefaults.generateCount);
        }
        if (!currentElement?.selectedImageSize) {
            setImageSize(imageDefaults.imageSize);
        }
    }, [imageDefaults, currentElement?.selectedAspectRatio, currentElement?.selectedGenerateCount, currentElement?.selectedImageSize, currentElement?.selectedModel]);

    useEffect(() => {
        if (currentElement?.generatingTaskId && !isRecovering) {
            setRecoveryTaskId(currentElement.generatingTaskId);
        }
    }, [currentElement?.generatingTaskId, isRecovering]);

    useEffect(() => {
        refreshRecentHistory();
        return subscribeImageGenerationHistory(refreshRecentHistory);
    }, [refreshRecentHistory]);

    useEffect(() => {
        void migrateImageGenerationStorage();
    }, []);

    useEffect(() => {
        refreshFavoriteReferences();
        return subscribeFavoriteReferenceImages(refreshFavoriteReferences);
    }, [refreshFavoriteReferences]);

    // Auto-fill reference image from source
    useEffect(() => {
        if (canvasElements) {
            const currentElement = findGeneratorElement(canvasElements, elementId);
            const sourceId = currentElement?.referenceImageId;
            if (
                sourceId
                && !currentElement.savedReferenceImages
                && !currentElement.savedReferenceImage
                && !dismissedCanvasReferenceSourceIdsRef.current.has(sourceId)
            ) {
                const sourceImage = canvasElements.find(el => el.id === sourceId);
                if (sourceImage?.content) {
                    setReferenceImages((prev) => (prev.length === 0 ? [sourceImage.content!] : prev));
                }
            }
        }
    }, [elementId, canvasElements, currentElement?.referenceImageId, currentElement?.savedReferenceImage, currentElement?.savedReferenceImages]);

    useClearGeneratorError(elementId, errorFromElement, onElementChange);

    const handleCanvasSelectionEvent = useCallback((detail: { imageContent?: string }) => {
        if (detail.imageContent) {
            setReferenceImages((prev) => mergeReferenceImages(prev, [detail.imageContent!]));
        }
    }, [mergeReferenceImages]);

    useCanvasImageSelectionEvent(elementId, handleCanvasSelectionEvent);

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const editor = e.currentTarget;
        const livePrompt = editor.value;
        const liveSelection: TextareaSelection = {
            start: editor.selectionStart ?? livePrompt.length,
            end: editor.selectionEnd ?? (editor.selectionStart ?? livePrompt.length),
        };
        promptSelectionRef.current = liveSelection;
        const liveMentionQuery = resolveTextareaMentionQuery(livePrompt, liveSelection.start) ?? mentionQuery;
        const liveMentionSuggestions = getPromptMentionSuggestions(promptReferenceMentions, liveMentionQuery);

        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (liveSelection.start === liveSelection.end) {
                const mentionDeletion = resolveTokenDeletionRange({
                    value: livePrompt,
                    tokens: promptReferenceMentions.map((mention) => mention.token),
                    selectionOffset: liveSelection.start,
                    key: e.key,
                });
                if (mentionDeletion) {
                    e.preventDefault();
                    const nextPrompt = normalizeMentionText(`${livePrompt.slice(0, mentionDeletion.start)}${livePrompt.slice(mentionDeletion.end)}`);
                    promptSelectionRef.current = {
                        start: mentionDeletion.nextCaretOffset,
                        end: mentionDeletion.nextCaretOffset,
                    };
                    setPrompt(nextPrompt);
                    setMentionQuery(null);

                    requestAnimationFrame(() => {
                        const textarea = promptInputRef.current;
                        if (!textarea) {
                            return;
                        }

                        textarea.focus();
                        textarea.setSelectionRange(mentionDeletion.nextCaretOffset, mentionDeletion.nextCaretOffset);
                    });
                    return;
                }
            }
        }

        if (liveMentionQuery) {
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (liveMentionSuggestions.length > 0) {
                    handleInsertPromptReferenceToken(liveMentionSuggestions[0]);
                }
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (prompt.trim() && !isGenerating) {
                await handleGenerate();
            }
        }
    };

    const applyHistoryItem = useCallback((item: ImageGenerationHistoryItem) => {
        setPrompt(item.prompt);
        setModel(item.model);
        setAspectRatio(item.aspectRatio);
        setImageSize(item.imageSize);
        setGenerateCount(item.generateCount);
        setReferenceImages(item.referenceImages);
        setMentionQuery(null);
        setErrorMsg(null);
    }, []);

    const handleApplyReferenceLibraryImage = useCallback((image: string) => {
        setReferenceImages((prev) => mergeReferenceImages(prev, [image]));
    }, [mergeReferenceImages]);

    const handleApplyProjectReference = useCallback((item: ProjectReferenceImageItem) => {
        setReferenceImages((prev) => mergeReferenceImages(prev, [item.image]));
        onUseProjectReferenceImage?.(item.id);
    }, [mergeReferenceImages, onUseProjectReferenceImage]);

    const buildFavoriteLabel = useCallback((seed?: string) => {
        const trimmed = seed?.trim();
        if (!trimmed) {
            return `常用参考 ${favoriteReferences.length + 1}`;
        }
        return trimmed.length > 18 ? `${trimmed.slice(0, 18)}...` : trimmed;
    }, [favoriteReferences.length]);

    const resolveReferenceImageValue = useCallback(async (value: File | string) => {
        if (typeof value === 'string') {
            if (isImageRef(value)) {
                const resolved = await getImageDataUrl(value);
                if (!resolved) {
                    throw new Error('参考图读取失败，请重新选择图片后再试。');
                }

                return await compressReferenceImageDataUrl(resolved, {
                    targetBytes: IMAGE_REFERENCE_TARGET_BYTES,
                });
            }

            if (isDataUrl(value)) {
                return await compressReferenceImageDataUrl(value, {
                    targetBytes: IMAGE_REFERENCE_TARGET_BYTES,
                });
            }

            return value;
        }

        return await compressReferenceImageDataUrl(await readFileAsDataUrl(value), {
            targetBytes: IMAGE_REFERENCE_TARGET_BYTES,
        });
    }, []);

    const handleSaveReferenceFavorite = useCallback(async (value: File | string, seedLabel?: string) => {
        const image = await resolveReferenceImageValue(value);
        if (!image) return;
        try {
            const nextFavorites = await saveFavoriteReferenceImage(image, buildFavoriteLabel(seedLabel || prompt));
            setFavoriteReferences(nextFavorites);
        } catch {
            setErrorMsg('收藏参考图失败');
        }
    }, [buildFavoriteLabel, prompt, resolveReferenceImageValue]);

    const handleApplyFavoriteReference = useCallback((item: FavoriteReferenceImageItem) => {
        setReferenceImages((prev) => mergeReferenceImages(prev, [item.image]));
        setFavoriteReferences(touchFavoriteReferenceImage(item.id));
    }, [mergeReferenceImages]);

    const handleStartRenameFavorite = useCallback((item: FavoriteReferenceImageItem) => {
        setEditingFavoriteId(item.id);
        setFavoriteLabelDraft(item.label);
    }, []);

    const handleCommitFavoriteRename = useCallback((id: string) => {
        setFavoriteReferences(renameFavoriteReferenceImage(id, favoriteLabelDraft));
        setEditingFavoriteId(null);
        setFavoriteLabelDraft('');
    }, [favoriteLabelDraft]);

    const handleDeleteFavorite = useCallback((id: string) => {
        setFavoriteReferences(removeFavoriteReferenceImage(id));
        if (editingFavoriteId === id) {
            setEditingFavoriteId(null);
            setFavoriteLabelDraft('');
        }
    }, [editingFavoriteId]);

    const formatHistoryTime = useCallback((timestamp: number) => {
        const deltaMs = Date.now() - timestamp;
        const deltaMinutes = Math.max(1, Math.round(deltaMs / 60000));
        if (deltaMinutes < 60) return `${deltaMinutes} 分钟前`;
        const deltaHours = Math.round(deltaMinutes / 60);
        if (deltaHours < 24) return `${deltaHours} 小时前`;
        const deltaDays = Math.round(deltaHours / 24);
        return `${deltaDays} 天前`;
    }, []);

    const handleGenerate = async () => {
        const { materializedPrompt, invalidTokens } = resolvePromptReferenceMentions(prompt, promptReferenceMentions);
        if (invalidTokens.length > 0) {
            setErrorMsg(`提示词引用了不存在的参考图：${invalidTokens.join('、')}。请先上传对应参考图，或修改提示词。`);
            return;
        }

        setIsSubmitting(true);
        onSubmittingChange?.(elementId, true, { prompt: materializedPrompt, model, aspectRatio, imageSize, generateCount });
        setErrorMsg(null);
        let submissionAccepted = false;
        let submissionOutcome: 'succeeded' | 'failed' | 'interrupted' = 'failed';

        try {
            const referenceImageDataList: string[] = [];
            if (referenceImages.length > 0) {
                for (const img of referenceImages) {
                    const resolved = await resolveReferenceImageValue(img);
                    if (resolved) {
                        referenceImageDataList.push(resolved);
                    }
                }
            }

            const nextHistory = await appendImageGenerationHistory({
                prompt,
                model,
                aspectRatio,
                imageSize,
                generateCount,
                referenceImages: referenceImageDataList,
            });
            setRecentHistory(nextHistory);

            const elX = currentElement?.x ?? 200;
            const elY = currentElement?.y ?? 200;
            const elW = currentElement?.width ?? 400;
            const elH = currentElement?.height ?? 400;
            const offsetX = elW + 20;
            const sharedElementState = {
                savedPrompt: prompt,
                selectedModel: model,
                selectedAspectRatio: aspectRatio,
                selectedImageSize: imageSize,
                selectedGenerateCount: generateCount,
                savedReferenceImages: referenceImageDataList.length > 0 ? JSON.stringify(referenceImageDataList) : undefined,
            };

            if (usesDomesticImageBatching) {
                const data = await requestImageGeneration({
                    prompt: materializedPrompt,
                    model,
                    aspectRatio,
                    imageSize,
                    generateCount,
                    referenceImages: referenceImageDataList.length > 0 ? referenceImageDataList : undefined,
                    preferDirect: true,
                    forceAsync: true,
                });

                submissionAccepted = true;

                if (data.status === 'pending' && data.taskId) {
                    onElementChange?.(elementId, {
                        ...createGeneratorTaskUpdate(data.taskId, 'image'),
                        generationResultIndex: 0,
                    });

                    for (let index = 1; index < generateCount; index += 1) {
                        onAddElement?.({
                            id: uuidv4(),
                            type: 'image-generator',
                            x: elX + offsetX * index,
                            y: elY,
                            width: elW,
                            height: elH,
                            ...createGeneratorTaskUpdate(data.taskId, 'image'),
                            generationResultIndex: index,
                            ...sharedElementState,
                        });
                    }

                    submissionOutcome = 'succeeded';
                    return;
                }

                const batchResults = (data.images && data.images.length > 0)
                    ? data.images
                    : [data.imageUrl, data.imageData].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

                if (batchResults.length === 0) {
                    throw new Error('图片生成未返回可用结果');
                }

                onGenerate(batchResults[0]);

                for (let index = 1; index < batchResults.length; index += 1) {
                    onAddElement?.({
                        id: uuidv4(),
                        type: 'image',
                        x: elX + offsetX * index,
                        y: elY,
                        width: elW,
                        height: elH,
                        content: batchResults[index],
                        generationResultIndex: index,
                        ...sharedElementState,
                    });
                }

                if (batchResults.length < generateCount) {
                    setErrorMsg(`${batchResults.length}/${generateCount} 张生成成功，部分结果未返回`);
                }

                submissionOutcome = 'succeeded';
                return;
            }

            const requests = Array.from({ length: generateCount }, async () => {
                return await runImageGenerationFlow({
                    prompt: materializedPrompt,
                    model,
                    aspectRatio,
                    imageSize,
                    referenceImages: referenceImageDataList.length > 0 ? referenceImageDataList : undefined,
                    preferDirect: true,
                    forceAsync: true,
                });
            });

            const results = await Promise.allSettled(requests);
            console.log('[ImageGen] All responses:', results);

            let firstHandled = false;
            let errorCount = 0;
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.status === 'rejected') {
                    errorCount++;
                    console.error(`[ImageGen] Request ${i + 1} failed:`, result.reason);
                    continue;
                }

                const data = result.value;

                if (!firstHandled) {
                    // 第一张：替换当前生成器元素
                    firstHandled = true;
                    submissionAccepted = true;
                    if (data.status === 'completed') {
                        onGenerate(data.imageUrl);
                    } else {
                        onElementChange?.(elementId, createGeneratorTaskUpdate(data.taskId, 'image'));
                    }
                } else {
                    // 第 2~N 张：在旁边创建新元素
                    const newId = uuidv4();
                    if (data.status === 'completed') {
                        onAddElement?.({
                            id: newId,
                            type: 'image',
                            x: elX + offsetX * i,
                            y: elY,
                            width: elW,
                            height: elH,
                            content: data.imageUrl,
                            ...sharedElementState,
                        });
                    } else {
                        onAddElement?.({
                            id: newId,
                            type: 'image-generator',
                            x: elX + offsetX * i,
                            y: elY,
                            width: elW,
                            height: elH,
                            ...createGeneratorTaskUpdate(data.taskId, 'image'),
                            ...sharedElementState,
                        });
                    }
                }
            }

            if (errorCount === generateCount) {
                const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
                throw firstErr.reason instanceof Error ? firstErr.reason : new Error('全部生成失败');
            } else if (errorCount > 0) {
                setErrorMsg(`${generateCount - errorCount}/${generateCount} 张生成成功，${errorCount} 张失败`);
            }

            submissionOutcome = 'succeeded';
        } catch (error) {
            const isInterrupted = !submissionAccepted && isRecoverableGenerationSubmissionError(error);
            const classifiedMessage = classifyGenerationError('image', error);
            submissionOutcome = isInterrupted ? 'interrupted' : 'failed';
            (isInterrupted ? console.warn : console.error)('[ImageGen] Error:', error);
            setErrorMsg(isInterrupted ? withSubmissionRecoveryHint(classifiedMessage) : classifiedMessage);
        } finally {
            setIsSubmitting(false);
            onSubmittingChange?.(elementId, false, undefined, { outcome: submissionOutcome });
        }
    };

    const handleRecoverTask = async () => {
        const taskId = recoveryTaskId.trim();
        if (!taskId || !onRecoverTask) {
            setErrorMsg('请输入有效的 task_id');
            return;
        }

        setIsRecovering(true);
        setErrorMsg(null);
        try {
            await onRecoverTask(elementId, taskId);
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : '任务恢复失败');
        } finally {
            setIsRecovering(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files).slice(0, Math.max(0, maxReferenceImages - referenceImages.length));
            if (newFiles.length > 0) {
                setReferenceImages((prev) => mergeReferenceImages(prev, newFiles));
            }
            e.target.value = '';
        }
    };

    const resourceLibraryCount = projectReferenceImages.length + favoriteReferences.length + recentHistory.length + referenceLibrary.length;
    const canAddMoreImages = referenceImages.length < maxReferenceImages;

    return (
        <div
            className="absolute z-50 bg-white/96 backdrop-blur-xl rounded-[20px] shadow-xl border border-slate-200/60 w-[620px]"
            style={style}
            ref={panelRef}
            onKeyDown={(e) => {
                e.stopPropagation();
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                const isInsidePopover = target.closest('[data-popover-menu]');
                if (!isInsidePopover) {
                    closeAllMenus();
                }
            }}
        >
            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                aria-label="上传参考图片"
                onChange={handleFileSelect}
            />

            <div className="p-3 pb-2">
                <div className="relative">
                    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                        <div className="relative px-3 py-2.5">
                            <textarea
                                ref={promptInputRef}
                                value={prompt}
                                onChange={handlePromptChange}
                                onKeyDown={handleKeyDown}
                                onKeyUp={handlePromptSelectionChange}
                                onSelect={handlePromptSelectionChange}
                                onClick={handlePromptSelectionChange}
                                onFocus={handlePromptSelectionChange}
                                readOnly={isGenerating}
                                spellCheck={false}
                                rows={2}
                                role="textbox"
                                aria-multiline="true"
                                aria-label="描述你想要生成的图片"
                                placeholder="描述图片内容，输入 @ 引用参考图..."
                                onCompositionStart={() => {
                                    isPromptComposingRef.current = true;
                                }}
                                onCompositionEnd={handlePromptCompositionEnd}
                                onBlur={() => {
                                    window.setTimeout(() => setMentionQuery(null), 120);
                                }}
                                className="w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400/60"
                                disabled={isGenerating}
                            />
                        </div>

                        {/* Reference images: collapsed stack + hover expand */}
                        <div className={`${referenceImages.length > 0 ? 'group/refs' : ''} relative px-3 pb-2.5`}>
                            <div className="relative" style={{ minHeight: '32px' }}>
                                {/* Collapsed: stacked mini thumbnails + small + button */}
                                <div className={`relative z-0 flex items-end gap-1 transition-all duration-300 ease-out ${referenceImages.length > 0 ? 'group-hover/refs:opacity-0 group-hover/refs:scale-95 group-hover/refs:pointer-events-none' : ''}`}>
                                    {referenceImages.length > 0 && (
                                        <div
                                            className="relative flex items-end"
                                            style={{ width: `${Math.min(referenceImages.length, 3) * 10 + 22}px`, height: '32px' }}
                                        >
                                            {referenceImages.slice(0, 3).map((img, index) => (
                                                <div
                                                    key={index}
                                                    className="absolute bottom-0 rounded-lg border-2 border-white shadow-sm overflow-hidden"
                                                    style={{ left: `${index * 10}px`, zIndex: index + 1, width: '32px', height: '32px' }}
                                                >
                                                    <WorkbenchImage
                                                        content={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                                        alt={`参考图 ${index + 1}`}
                                                        containerClassName="h-full w-full"
                                                        imageClassName="rounded-md"
                                                        fit="cover"
                                                        showSurface={false}
                                                        onLoad={(e) => { if (typeof img !== 'string') URL.revokeObjectURL((e.target as HTMLImageElement).src); }}
                                                    />
                                                </div>
                                            ))}
                                            {referenceImages.length > 3 && (
                                                <div
                                                    className="absolute bottom-0 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-[10px] font-medium text-slate-500 shadow-sm"
                                                    style={{ left: `${3 * 10}px`, zIndex: 4 }}
                                                >
                                                    +{referenceImages.length - 3}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="relative shrink-0" data-popover-menu>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = !showAddImageMenu;
                                                closeAllMenus();
                                                setShowAddImageMenu(next);
                                            }}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600"
                                            title="添加参考图"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded: full thumbnail row (only when there are references) */}
                                {referenceImages.length > 0 && (
                                    <div className="absolute inset-0 z-10 flex items-end gap-1.5 transition-all duration-300 ease-out opacity-0 scale-95 pointer-events-none group-hover/refs:opacity-100 group-hover/refs:scale-100 group-hover/refs:pointer-events-auto">
                                        <button type="button" onClick={() => { if (confirmClear) { handleClearReferenceImages(); setConfirmClear(false); } else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 2000); } }} className={`relative z-20 shrink-0 self-center rounded-full p-1 transition-colors ${confirmClear ? 'bg-rose-50 text-rose-500 ring-1 ring-rose-200' : 'text-slate-300 hover:text-slate-500'}`} title={confirmClear ? '再次点击确认清空' : '清空参考图'}>
                                            <X size={14} />
                                        </button>
                                        {referenceImages.map((img, index) => (
                                            <div
                                                key={index}
                                                className="group/item relative shrink-0 transition-all duration-300 ease-out"
                                                style={{ transitionDelay: `${index * 40}ms` }}
                                                title={`参考图 ${index + 1}`}
                                            >
                                                <WorkbenchImage
                                                    content={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                                    alt={`参考图 ${index + 1}`}
                                                    containerClassName="h-10 w-10 rounded-xl border border-slate-200/60"
                                                    imageClassName="rounded-xl"
                                                    fit="cover"
                                                    showSurface={false}
                                                    onLoad={(e) => { if (typeof img !== 'string') URL.revokeObjectURL((e.target as HTMLImageElement).src); }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveReferenceImage(index)}
                                                    className="absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition-colors hover:bg-rose-50 hover:text-rose-500 group-hover/item:flex"
                                                    title={`移除参考图 ${index + 1}`}
                                                >
                                                    <X size={9} />
                                                </button>
                                            </div>
                                        ))}
                                        {/* Expanded + button */}
                                        {canAddMoreImages && (
                                            <div className="relative shrink-0" data-popover-menu>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = !showAddImageMenu;
                                                        closeAllMenus();
                                                        setShowAddImageMenu(next);
                                                    }}
                                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600"
                                                    title="添加参考图"
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Add image menu (positioned outside overflow container) */}
                    {showAddImageMenu && (
                        <div className="absolute bottom-[48px] left-3 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-50 min-w-[160px]" data-popover-menu>
                            <button type="button" onClick={() => { fileInputRef.current?.click(); setShowAddImageMenu(false); }} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                                <Upload size={14} className="text-slate-400" /><span>上传图片</span>
                            </button>
                            <button type="button" onClick={() => { setShowAddImageMenu(false); onRequestCanvasSelect?.(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 cursor-pointer text-slate-700 hover:bg-slate-50">
                                <MousePointerClick size={14} className="text-slate-400" /><span>从画布选择</span>
                            </button>
                        </div>
                    )}

                    {mentionQuery && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500">可引用的参考图</div>
                            <div className="max-h-[220px] overflow-y-auto p-2">
                                {mentionSuggestions.length > 0 ? mentionSuggestions.map((mention) => (
                                    <button
                                        key={mention.id}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleInsertPromptReferenceToken(mention)}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
                                    >
                                        <WorkbenchImage
                                            content={typeof mention.image === 'string' ? mention.image : URL.createObjectURL(mention.image)}
                                            alt={mention.name}
                                            containerClassName="h-10 w-10 shrink-0 rounded-lg"
                                            imageClassName="rounded-lg"
                                            fit="cover"
                                            showSurface={false}
                                            onLoad={(event) => {
                                                if (typeof mention.image !== 'string') {
                                                    URL.revokeObjectURL((event.target as HTMLImageElement).src);
                                                }
                                            }}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-slate-700">{mention.name}</div>
                                            <div className="text-[11px] text-slate-400">{mention.label}</div>
                                        </div>
                                    </button>
                                )) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">
                                        {promptReferenceMentions.length > 0 ? '没有匹配的参考图，请继续输入或调整关键词' : '先添加参考图，再输入 @ 进行引用'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isGrokImageModel && (
                <div className="px-3 pb-2">
                    <div className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                        {grokUsesReferenceAspectRatio
                            ? 'Grok 携带参考图时会按参考图原始比例生成；当前请求只发送官方字段 aspect_ratio + resolution。'
                            : 'Grok 当前只发送官方字段 aspect_ratio + resolution；resolution 仅支持 1K/2K，最终仍以上游实际返回为准。'}
                    </div>
                </div>
            )}

            <GeneratorStatusCard kind="image" state={statusState} />

            {(errorFromElement || errorMsg) && (
                <div className="px-3 pb-2">
                    <div className="text-xs text-red-600 bg-red-50/80 border border-red-200/60 rounded-xl p-2.5 whitespace-pre-line leading-relaxed relative pr-7">
                        {errorFromElement || errorMsg}
                        <button
                            onClick={() => setErrorMsg(null)}
                            className="absolute top-2 right-2 text-red-300 hover:text-red-500 transition-colors"
                            title="关闭"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            {/* Footer Controls — single row */}
            <div className="relative z-10 rounded-b-[20px] border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    {/* Model Selector */}
                    <div className="relative" data-popover-menu>
                        <button
                            onClick={() => { const next = !showModelMenu; closeAllMenus(); setShowModelMenu(next); }}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white rounded-lg transition-colors text-xs font-medium text-slate-700 whitespace-nowrap"
                        >
                            <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center flex-shrink-0">
                                <Sparkles size={8} className="text-white" />
                            </div>
                            <span className="max-w-[140px] truncate whitespace-nowrap">{MODEL_LABELS[model]}</span>
                            <ChevronDown size={11} className="text-slate-400" />
                        </button>
                        {showModelMenu && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-30 min-w-[200px]">
                                {models.map((m) => (
                                    <div key={m} onClick={() => { setModel(m); setShowModelMenu(false); }} className={`px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg mx-1 transition-colors ${model === m ? 'bg-slate-50' : ''}`}>
                                        <div className={`text-xs font-medium ${model === m ? 'text-violet-600' : 'text-slate-700'}`}>{MODEL_LABELS[m]}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Params summary — click to open settings */}
                    <div className="relative shrink-0" data-popover-menu>
                        <button
                            type="button"
                            onClick={() => { const next = !showSettingsPanel; closeAllMenus(); setShowSettingsPanel(next); }}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/60 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white hover:text-slate-700 hover:border-slate-300"
                        >
                            <Settings2 size={12} />
                            <span>{displayedAspectRatio}</span>
                            <span className="text-slate-300">·</span>
                            <span>{imageSize}</span>
                            <span className="text-slate-300">·</span>
                            <span>×{generateCount}</span>
                            <ChevronDown size={11} className="text-slate-400 ml-0.5" />
                        </button>

                        {showSettingsPanel && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[280px] overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                    <span className="text-xs font-medium text-slate-700">生成设置</span>
                                    <span className="text-[10px] text-slate-400">{displayedAspectRatio} · {imageSize} · ×{generateCount}</span>
                                </div>
                                <div className="p-4 space-y-0">
                                    {/* Aspect ratio with visual icons */}
                                    <div className="py-3">
                                        <div className="mb-2 text-[11px] font-medium text-slate-500">画面比例</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableAspectRatios.map((ratio) => {
                                                const ratioShapes: Record<string, { w: number; h: number }> = { '16:9': { w: 14, h: 8 }, '9:16': { w: 8, h: 14 }, '1:1': { w: 10, h: 10 }, '4:3': { w: 12, h: 9 }, '3:4': { w: 9, h: 12 }, '2:3': { w: 8, h: 12 }, '3:2': { w: 12, h: 8 }, '4:5': { w: 9, h: 11 }, '5:4': { w: 11, h: 9 }, '21:9': { w: 16, h: 7 }, 'auto': { w: 10, h: 10 } };
                                                const shape = ratioShapes[ratio] || { w: 10, h: 10 };
                                                return (
                                                    <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} disabled={grokUsesReferenceAspectRatio} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${grokUsesReferenceAspectRatio ? 'cursor-not-allowed opacity-50' : ''} ${aspectRatio === ratio ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                        <span className={`inline-block rounded-[2px] border ${aspectRatio === ratio ? 'border-white/50' : 'border-slate-400/50'}`} style={{ width: `${shape.w}px`, height: `${shape.h}px` }} />
                                                        {ratio === 'auto' ? '自动' : ratio}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {grokUsesReferenceAspectRatio && (
                                            <div className="mt-1.5 text-[10px] text-amber-600">Grok 携带参考图时按参考图比例生成</div>
                                        )}
                                    </div>

                                    {/* Image Size */}
                                    <div className="py-3 border-t border-slate-100/80">
                                        <div className="mb-2 text-[11px] font-medium text-slate-500">分辨率</div>
                                        <div className="flex gap-1.5">
                                            {availableImageSizes.map((size) => (
                                                <button key={size} type="button" onClick={() => setImageSize(size)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${imageSize === size ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{size}</button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Generate Count */}
                                    <div className="py-3 border-t border-slate-100/80">
                                        <div className="mb-2 text-[11px] font-medium text-slate-500">生成数量</div>
                                        <div className="flex gap-1.5">
                                            {([1, 2, 3, 4] as GenerateCount[]).map((count) => (
                                                <button key={count} type="button" onClick={() => setGenerateCount(count)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${generateCount === count ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{count} 张</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Resource Library */}
                    {resourceLibraryCount > 0 && (
                        <div className="relative" data-popover-menu>
                            <button
                                onClick={() => {
                                    const next = !showResourceLibrary;
                                    closeAllMenus();
                                    setShowResourceLibrary(next);
                                    if (next) {
                                        const firstTab = recentHistory.length > 0 ? 'history' : projectReferenceImages.length > 0 ? 'project' : favoriteReferences.length > 0 ? 'favorite' : referenceLibrary.length > 0 ? 'library' : 'history';
                                        setResourceLibraryTab(firstTab);
                                    }
                                }}
                                className={`relative flex items-center justify-center rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${showResourceLibrary ? 'bg-violet-50 text-violet-600' : 'text-slate-500 hover:bg-white'}`}
                                title="资源库"
                            >
                                <FolderOpen size={13} />
                                <span className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${showResourceLibrary ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{resourceLibraryCount}</span>
                            </button>

                            {showResourceLibrary && (
                                <div className="absolute bottom-full right-0 mb-1 bg-white/96 backdrop-blur-xl rounded-[16px] shadow-lg border border-slate-200/60 z-30 w-[400px] overflow-hidden">
                                    {/* Tab bar */}
                                    <div className="flex items-center border-b border-slate-100 px-1 pt-1">
                                        {[
                                            { key: 'project' as const, label: '项目', count: projectReferenceImages.length, icon: LibraryBig },
                                            { key: 'favorite' as const, label: '收藏', count: favoriteReferences.length, icon: Star },
                                            { key: 'history' as const, label: '历史', count: recentHistory.length, icon: History },
                                            { key: 'library' as const, label: '图库', count: referenceLibrary.length, icon: LibraryBig },
                                        ].filter(tab => tab.count > 0).map(tab => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setResourceLibraryTab(tab.key)}
                                                className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                                                    resourceLibraryTab === tab.key
                                                        ? 'border-violet-500 text-violet-700'
                                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                                }`}
                                            >
                                                <tab.icon size={12} />
                                                {tab.label}
                                                <span className={`text-[10px] ${resourceLibraryTab === tab.key ? 'text-violet-500' : 'text-slate-400'}`}>({tab.count})</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tab content */}
                                    <div className="max-h-[280px] overflow-y-auto panel-scroll p-2">
                                        {/* Project tab */}
                                        {resourceLibraryTab === 'project' && (
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {projectReferenceImages.slice(0, 8).map((item) => {
                                                    const alreadySelected = referenceImages.some((existing) => typeof existing === 'string' && existing === item.image);
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => handleApplyProjectReference(item)}
                                                            disabled={alreadySelected || referenceImages.length >= maxReferenceImages}
                                                            className={`overflow-hidden rounded-lg border text-left transition-all ${
                                                                alreadySelected ? 'cursor-not-allowed border-violet-200 bg-violet-50/80 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm'
                                                            }`}
                                                            title={item.label}
                                                        >
                                                            <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                            <div className="px-1.5 py-1">
                                                                <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Favorite tab */}
                                        {resourceLibraryTab === 'favorite' && (
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {favoriteReferences.slice(0, 8).map((item) => {
                                                    const alreadySelected = referenceImages.some((existing) => typeof existing === 'string' && existing === item.image);
                                                    const isEditingLabel = editingFavoriteId === item.id;
                                                    return (
                                                        <div key={item.id} className="overflow-hidden rounded-lg border border-slate-200/60 bg-white">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApplyFavoriteReference(item)}
                                                                disabled={alreadySelected || referenceImages.length >= maxReferenceImages}
                                                                aria-label={`加入常用参考 ${item.label}`}
                                                                className={`group block w-full text-left ${alreadySelected ? 'cursor-not-allowed opacity-60' : ''}`}
                                                            >
                                                                <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 group-hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                            </button>
                                                            <div className="px-1.5 py-1">
                                                                {isEditingLabel ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <input value={favoriteLabelDraft} onChange={(event) => setFavoriteLabelDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleCommitFavoriteRename(item.id); }} className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 outline-none focus:border-violet-400" />
                                                                        <button type="button" onClick={() => handleCommitFavoriteRename(item.id)} className="rounded bg-violet-500 p-0.5 text-white hover:bg-violet-600"><Check size={10} /></button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                                                )}
                                                                <div className="mt-0.5 flex items-center justify-end gap-0.5">
                                                                    {!isEditingLabel && <button type="button" onClick={() => handleStartRenameFavorite(item)} className="rounded p-0.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"><Pencil size={10} /></button>}
                                                                    <button type="button" onClick={() => handleDeleteFavorite(item.id)} className="rounded p-0.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={10} /></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* History tab */}
                                        {resourceLibraryTab === 'history' && (
                                            <div>
                                                <div className="divide-y divide-slate-100">
                                                    {recentHistory.slice(0, 5).map((item) => (
                                                        <div key={item.id} className="flex items-center gap-2 py-2 px-1">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate text-xs font-medium text-slate-700">{item.prompt}</div>
                                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                                    <span className="text-[10px] text-slate-400">{item.aspectRatio}</span>
                                                                    <span className="text-[10px] text-slate-300">·</span>
                                                                    <span className="text-[10px] text-slate-400">{item.imageSize}</span>
                                                                    <span className="text-[10px] text-slate-300">·</span>
                                                                    <span className="text-[10px] text-slate-400">{item.generateCount}张</span>
                                                                    {item.referenceImages.length > 0 && (
                                                                        <>
                                                                            <span className="text-[10px] text-slate-300">·</span>
                                                                            <span className="text-[10px] text-amber-600">{item.referenceImages.length}张参考图</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 flex-shrink-0">{formatHistoryTime(item.createdAt)}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => { applyHistoryItem(item); setShowResourceLibrary(false); }}
                                                                disabled={isGenerating}
                                                                className={`flex-shrink-0 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                                                    isGenerating ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-violet-500 text-white hover:bg-violet-600'
                                                                }`}
                                                            >
                                                                <RotateCcw size={10} />
                                                                回填
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-1 flex justify-end px-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => { clearImageGenerationHistory(); setRecentHistory([]); setReferenceLibrary([]); }}
                                                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                                                    >
                                                        清空历史
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Library tab */}
                                        {resourceLibraryTab === 'library' && (
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {referenceLibrary.slice(0, 8).map((item, index) => {
                                                    const alreadySelected = referenceImages.some((existing) => typeof existing === 'string' && existing === item.image);
                                                    const isFavorited = favoriteReferences.some((favorite) => favorite.image === item.image);
                                                    return (
                                                        <div key={`${item.historyId}-${index}`} className={`group overflow-hidden rounded-lg border text-left transition-all ${alreadySelected ? 'border-sky-200 bg-sky-50/80 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm'}`}>
                                                            <div className="relative">
                                                                <button type="button" onClick={() => handleApplyReferenceLibraryImage(item.image)} disabled={alreadySelected || referenceImages.length >= maxReferenceImages} className={`block w-full text-left ${alreadySelected ? 'cursor-not-allowed' : ''}`}>
                                                                    <WorkbenchImage content={item.image} alt={`参考图库 ${index + 1}`} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 group-hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSaveReferenceFavorite(item.image, item.prompt)}
                                                                    className={`absolute right-1 top-1 rounded-full p-0.5 shadow-sm ${isFavorited ? 'bg-amber-500 text-white' : 'bg-white/90 text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}
                                                                    title={isFavorited ? '已收藏' : '收藏'}
                                                                >
                                                                    <Star size={10} className={isFavorited ? 'fill-current' : ''} />
                                                                </button>
                                                            </div>
                                                            <div className="px-1.5 py-1">
                                                                <div className="truncate text-[10px] text-slate-500">{item.prompt}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Empty state */}
                                        {resourceLibraryCount === 0 && (
                                            <div className="py-8 text-center text-xs text-slate-400">暂无资源</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Task recovery icon */}
                    {onRecoverTask && (
                        <div className="relative" data-popover-menu>
                            <button
                                type="button"
                                onClick={() => { const next = !showRecoveryPanel; closeAllMenus(); setShowRecoveryPanel(next); }}
                                className={`flex items-center justify-center rounded-lg p-1 text-[11px] transition-all ${showRecoveryPanel ? 'bg-sky-50 text-sky-600' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                                title="任务恢复"
                            >
                                <Search size={13} />
                            </button>

                            {showRecoveryPanel && (
                                <div className="absolute bottom-full mb-1 right-0 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[320px] overflow-hidden p-3">
                                    <div className="text-[11px] font-medium text-slate-500 mb-2">任务恢复</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={recoveryTaskId}
                                            onChange={(event) => setRecoveryTaskId(event.target.value)}
                                            placeholder="输入 task_id"
                                            className="min-w-0 flex-1 rounded-lg border border-sky-200/80 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400"
                                            disabled={isGenerating || isRecovering}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void handleRecoverTask()}
                                            disabled={!recoveryTaskId.trim() || isGenerating || isRecovering}
                                            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${!recoveryTaskId.trim() || isGenerating || isRecovering ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                                        >
                                            {isRecovering ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                                            <span>{isRecovering ? '查询中' : '接管'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Generate button */}
                    <button
                        onClick={() => prompt.trim() && !isGenerating && handleGenerate()}
                        disabled={!prompt.trim() || isGenerating}
                        className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-all ${
                            prompt.trim() && !isGenerating
                                ? 'bg-slate-700 text-white hover:bg-slate-600 active:scale-[0.97]'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        {isGenerating ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Zap size={14} className="fill-current" />
                        )}
                        <span className="font-medium">{statusState.buttonLabel}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
