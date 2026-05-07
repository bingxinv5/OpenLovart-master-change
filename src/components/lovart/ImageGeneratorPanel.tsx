"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { debugLog } from '@/lib/debug-log';
import { CANVAS_LEGACY_MIGRATION_VERSION, hasCurrentCanvasLegacyMigration } from './canvas-types';
import { getGeneratorStatusState } from './GeneratorStatusCard';
import { GeneratorStatusSection } from './generator-panel-sections';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from './generator-error-utils';
import { createGeneratorTaskUpdate, useClearGeneratorError } from './generator-panel-hooks';
import { useImageGeneratorPanelPersistence } from './useGeneratorPanelPersistence';
import {
    appendImageGenerationHistory,
    getRecentReferenceLibrary,
    migrateImageGenerationStorage,
    readFavoriteReferenceImages,
    clearImageGenerationHistory,
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
    insertTextAtSelection,
    normalizeMentionText,
    removeMentionTokens,
    resolveTextareaMentionQuery,
    resolveTokenDeletionRange,
    type TextareaMentionQuery,
    type TextareaSelection,
} from './textarea-mention-utils';
import {
    buildPromptReferenceMentions,
    clampPromptReferenceTokens,
    getPromptMentionSuggestions,
    remapPromptReferenceTokensAfterRemoval,
    resolvePromptReferenceMentions,
    type PromptReferenceMention,
} from './generator-mention-view-model';
import { runImageGenerationFlow } from './image-generation-flow';
import { requestImageGeneration } from '@/lib/ai-client';
import { isDataUrl } from '@/lib/data-url';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import {
    isStandardImageSize,
    resolveOpenAiGptImageAspectRatio,
    resolveOpenAiGptImageQuality,
    resolveOpenAiGptImageSize,
} from '@/lib/image-generation-models';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { compressReferenceImageDataUrl } from '@/lib/reference-image-processing';
import { useImageGenerationDefaults } from '@/lib/generation-defaults';
import {
    GROK_IMAGE_ASPECT_RATIOS,
    IMAGE_MODEL_OPTIONS,
    resolveImageGeneratorModelOptions,
    type GenerateCount,
    type ImageAspectRatio as AspectRatio,
    type ImageModel,
    type ImageQuality,
    type ImageSize,
} from './generator-model-options';
import { buildImageReferencePreviewItems } from './generator-reference-view-model';
import type { ImageResourceLibraryTab } from './ImageGeneratorResourceLibrary';
import { ImageGeneratorPromptComposer } from './ImageGeneratorPromptComposer';
import { ImageGeneratorFooterControls } from './ImageGeneratorFooterControls';
import { buildFloatingPanelPositionClassName, buildFloatingPanelPositionCss } from './floating-panel-position';

const IMAGE_REFERENCE_TARGET_BYTES = 2 * 1024 * 1024;

interface ImageGeneratorPanelProps {
    elementId: string;
    onGenerate: (result: { imageUrl: string; taskId?: string | null }) => void;
    onRecoverTask?: (elementId: string, taskId: string) => Promise<void>;
    isGenerating: boolean;
    style?: React.CSSProperties;
    canvasElements?: GeneratorCanvasElement[];
    onElementChange?: (id: string, attrs: Record<string, unknown>) => void;
    onSubmittingChange?: (id: string, isSubmitting: boolean, liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; quality?: string; generateCount?: number }, completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' }) => void;
    onAddElement?: (element: { id: string; type: string; x: number; y: number; width: number; height: number; content?: string; generatingTaskId?: string; generatingTaskType?: string; generatingProgress?: number; savedPrompt?: string; selectedModel?: string; selectedAspectRatio?: string; selectedImageSize?: string; selectedImageQuality?: string; selectedGenerateCount?: number; generationResultIndex?: number; savedReferenceImages?: string; sourceGenerationTaskId?: string; sourceGenerationTaskType?: 'image' | 'video' }) => void;
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
    const [quality, setQuality] = useState<ImageQuality>(resolveOpenAiGptImageQuality(currentElement?.selectedImageQuality || imageDefaults.quality));

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
    const [resourceLibraryTab, setResourceLibraryTab] = useState<ImageResourceLibraryTab>('history');
    const [mentionQuery, setMentionQuery] = useState<TextareaMentionQuery | null>(null);
    const maxPromptRows = 8;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptInputRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const promptSelectionRef = useRef<TextareaSelection>({
        start: prompt.length,
        end: prompt.length,
    });
    const promptDraftRef = useRef(prompt);
    const persistedPromptRef = useRef(currentElement?.savedPrompt || '');
    const legacyReferenceMigratedRef = useRef(false);
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
    useLayoutEffect(() => {
        const el = promptInputRef.current;
        if (!el) return;
        const computedStyle = window.getComputedStyle(el);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
        const verticalPadding = Number.parseFloat(computedStyle.paddingTop || '0') + Number.parseFloat(computedStyle.paddingBottom || '0');
        const maxHeight = lineHeight * maxPromptRows + verticalPadding;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [maxPromptRows, prompt]);

    useEffect(() => {
        promptDraftRef.current = prompt;
    }, [prompt]);

    useEffect(() => {
        persistedPromptRef.current = currentElement?.savedPrompt || '';
    }, [currentElement?.savedPrompt, elementId]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closeAllMenus();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeAllMenus]);

    const models: ImageModel[] = IMAGE_MODEL_OPTIONS;
    const {
        maxReferenceImages,
        isGrokImageModel,
        isOpenAiGptImageModel,
        usesDomesticImageBatching,
        grokUsesReferenceAspectRatio,
        availableAspectRatios,
        availableImageSizes,
        availableImageQualities,
        displayedAspectRatio,
        settingsSummary,
    } = resolveImageGeneratorModelOptions({
        model,
        imageSize,
        aspectRatio,
        quality,
        generateCount,
        referenceImageCount: referenceImages.length,
    });
    const fallbackStandardImageSize = isStandardImageSize(imageDefaults.imageSize) ? imageDefaults.imageSize : '4K';

    useEffect(() => {
        if (isGrokImageModel && !GROK_IMAGE_ASPECT_RATIOS.includes(aspectRatio)) {
            setAspectRatio('1:1');
            return;
        }

        if (isOpenAiGptImageModel) {
            const nextImageSize = resolveOpenAiGptImageSize(imageSize, aspectRatio);
            if (imageSize !== nextImageSize) {
                setImageSize(nextImageSize);
                return;
            }

            const nextAspectRatio = resolveOpenAiGptImageAspectRatio(nextImageSize, aspectRatio);
            if (aspectRatio !== nextAspectRatio) {
                setAspectRatio(nextAspectRatio);
            }
            return;
        }

        if (aspectRatio === '9:21') {
            setAspectRatio('9:16');
        }
    }, [aspectRatio, imageSize, isGrokImageModel, isOpenAiGptImageModel]);

    useEffect(() => {
        if (!isOpenAiGptImageModel && !isStandardImageSize(imageSize)) {
            setImageSize(isGrokImageModel && fallbackStandardImageSize === '4K' ? '2K' : fallbackStandardImageSize);
        }
    }, [fallbackStandardImageSize, imageSize, isGrokImageModel, isOpenAiGptImageModel]);

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

    const flushPromptToElement = useCallback((nextPrompt?: string) => {
        const promptToPersist = nextPrompt ?? promptDraftRef.current;
        if (persistedPromptRef.current === promptToPersist) {
            return;
        }

        persistedPromptRef.current = promptToPersist;
        onElementChange?.(elementId, { savedPrompt: promptToPersist });
    }, [elementId, onElementChange]);

    useEffect(() => {
        return () => {
            flushPromptToElement();
        };
    }, [flushPromptToElement]);

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

    useImageGeneratorPanelPersistence({
        elementId,
        model,
        aspectRatio,
        generateCount,
        imageSize,
        quality,
        referenceImages,
        onElementChange,
    });

    useEffect(() => {
        if (legacyReferenceMigratedRef.current || !currentElement) {
            return;
        }

        if (hasCurrentCanvasLegacyMigration(currentElement) || currentElement.savedReferenceImages || !currentElement.savedReferenceImage?.trim()) {
            legacyReferenceMigratedRef.current = true;
            return;
        }

        legacyReferenceMigratedRef.current = true;
        onElementChange?.(elementId, {
            savedReferenceImages: JSON.stringify([currentElement.savedReferenceImage.trim()]),
            savedReferenceImage: undefined,
            legacyMigrationVersion: CANVAS_LEGACY_MIGRATION_VERSION,
        });
    }, [currentElement, elementId, onElementChange]);

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
        if (!currentElement?.selectedImageQuality) {
            setQuality(imageDefaults.quality);
        }
    }, [imageDefaults, currentElement?.selectedAspectRatio, currentElement?.selectedGenerateCount, currentElement?.selectedImageQuality, currentElement?.selectedImageSize, currentElement?.selectedModel]);

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
        setQuality(item.quality);
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
        onSubmittingChange?.(elementId, true, { prompt: materializedPrompt, model, aspectRatio, imageSize, quality, generateCount });
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
                quality,
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
                selectedImageQuality: quality,
                selectedGenerateCount: generateCount,
                savedReferenceImages: referenceImageDataList.length > 0 ? JSON.stringify(referenceImageDataList) : undefined,
            };

            if (usesDomesticImageBatching) {
                const data = await requestImageGeneration({
                    prompt: materializedPrompt,
                    model,
                    aspectRatio,
                    imageSize,
                    quality,
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

                onGenerate({
                    imageUrl: batchResults[0],
                    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
                });

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
                        sourceGenerationTaskId: typeof data.taskId === 'string' ? data.taskId : undefined,
                        sourceGenerationTaskType: typeof data.taskId === 'string' ? 'image' : undefined,
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
                    quality,
                    referenceImages: referenceImageDataList.length > 0 ? referenceImageDataList : undefined,
                    preferDirect: true,
                    forceAsync: true,
                });
            });

            const results = await Promise.allSettled(requests);
            debugLog('[ImageGen] All responses:', results);

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
                        onGenerate({ imageUrl: data.imageUrl, taskId: data.taskId });
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
                            sourceGenerationTaskId: typeof data.taskId === 'string' ? data.taskId : undefined,
                            sourceGenerationTaskType: typeof data.taskId === 'string' ? 'image' : undefined,
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
    const referencePreviewItems = useMemo(() => buildImageReferencePreviewItems(referenceImages), [referenceImages]);
    const panelPositionClassName = useMemo(() => buildFloatingPanelPositionClassName('image-generator-panel-position', elementId), [elementId]);
    const panelPositionCss = useMemo(() => buildFloatingPanelPositionCss(panelPositionClassName, style), [panelPositionClassName, style]);

    return (
        <>
        <style>{panelPositionCss}</style>
        <div
            className={`${panelPositionClassName} canvas-theme-panel-elevated absolute z-[130] w-[620px] rounded-[20px]`}
            data-testid="image-generator-panel"
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

            <ImageGeneratorPromptComposer
                promptInputRef={promptInputRef}
                prompt={prompt}
                isGenerating={isGenerating}
                referencePreviewItems={referencePreviewItems}
                canAddMoreImages={canAddMoreImages}
                confirmClear={confirmClear}
                showAddImageMenu={showAddImageMenu}
                mentionQuery={mentionQuery}
                mentionSuggestions={mentionSuggestions}
                hasPromptReferenceMentions={promptReferenceMentions.length > 0}
                onPromptChange={handlePromptChange}
                onPromptKeyDown={handleKeyDown}
                onPromptSelectionChange={handlePromptSelectionChange}
                onPromptCompositionStart={() => { isPromptComposingRef.current = true; }}
                onPromptCompositionEnd={handlePromptCompositionEnd}
                onPromptBlur={() => { flushPromptToElement(); window.setTimeout(() => setMentionQuery(null), 120); }}
                onToggleAddImageMenu={() => {
                    const next = !showAddImageMenu;
                    closeAllMenus();
                    setShowAddImageMenu(next);
                }}
                onClearReferences={() => {
                    if (confirmClear) {
                        handleClearReferenceImages();
                        setConfirmClear(false);
                    } else {
                        setConfirmClear(true);
                        setTimeout(() => setConfirmClear(false), 2000);
                    }
                }}
                onRemoveReferenceImage={handleRemoveReferenceImage}
                onUploadImage={() => { fileInputRef.current?.click(); setShowAddImageMenu(false); }}
                onSelectFromCanvas={() => { setShowAddImageMenu(false); onRequestCanvasSelect?.(); }}
                onApplyMention={handleInsertPromptReferenceToken}
            />

            {isGrokImageModel && (
                <div className="px-3 pb-2">
                    <div className="canvas-warning-surface rounded-xl px-3 py-2 text-[11px] leading-relaxed">
                        {grokUsesReferenceAspectRatio
                            ? 'Grok 携带参考图时会按参考图原始比例生成；当前请求只发送官方字段 aspect_ratio + resolution。'
                            : 'Grok 当前只发送官方字段 aspect_ratio + resolution；resolution 仅支持 1K/2K，最终仍以上游实际返回为准。'}
                    </div>
                </div>
            )}

            <GeneratorStatusSection
                kind="image"
                state={statusState}
                error={errorFromElement || errorMsg}
                onClearError={() => setErrorMsg(null)}
            />

            <ImageGeneratorFooterControls
                models={models}
                model={model}
                showModelMenu={showModelMenu}
                showSettingsPanel={showSettingsPanel}
                showResourceLibrary={showResourceLibrary}
                showRecoveryPanel={showRecoveryPanel}
                canRecoverTask={!!onRecoverTask}
                recoveryTaskId={recoveryTaskId}
                isGenerating={isGenerating}
                isRecovering={isRecovering}
                submitDisabled={!prompt.trim() || isGenerating}
                submitLabel={statusState.buttonLabel}
                isOpenAiGptImageModel={isOpenAiGptImageModel}
                imageSize={imageSize}
                quality={quality}
                displayedAspectRatio={displayedAspectRatio}
                generateCount={generateCount}
                aspectRatio={aspectRatio}
                settingsSummary={settingsSummary}
                availableImageSizes={availableImageSizes}
                availableImageQualities={availableImageQualities}
                availableAspectRatios={availableAspectRatios}
                grokUsesReferenceAspectRatio={grokUsesReferenceAspectRatio}
                resourceLibraryCount={resourceLibraryCount}
                resourceLibraryTab={resourceLibraryTab}
                projectReferenceImages={projectReferenceImages}
                favoriteReferences={favoriteReferences}
                recentHistory={recentHistory}
                referenceLibrary={referenceLibrary}
                referenceImages={referenceImages}
                maxReferenceImages={maxReferenceImages}
                editingFavoriteId={editingFavoriteId}
                favoriteLabelDraft={favoriteLabelDraft}
                onToggleModelMenu={() => { const next = !showModelMenu; closeAllMenus(); setShowModelMenu(next); }}
                onModelChange={(nextModel) => { setModel(nextModel); setShowModelMenu(false); }}
                onToggleSettings={() => { const next = !showSettingsPanel; closeAllMenus(); setShowSettingsPanel(next); }}
                onImageSizeChange={setImageSize}
                onAspectRatioChange={setAspectRatio}
                onQualityChange={setQuality}
                onGenerateCountChange={setGenerateCount}
                onToggleResourceLibrary={() => {
                    const next = !showResourceLibrary;
                    closeAllMenus();
                    setShowResourceLibrary(next);
                    if (next) {
                        const firstTab = recentHistory.length > 0 ? 'history' : projectReferenceImages.length > 0 ? 'project' : favoriteReferences.length > 0 ? 'favorite' : referenceLibrary.length > 0 ? 'library' : 'history';
                        setResourceLibraryTab(firstTab);
                    }
                }}
                onResourceLibraryTabChange={setResourceLibraryTab}
                onFavoriteLabelDraftChange={setFavoriteLabelDraft}
                onApplyProjectReference={handleApplyProjectReference}
                onApplyFavoriteReference={handleApplyFavoriteReference}
                onStartRenameFavorite={handleStartRenameFavorite}
                onCommitFavoriteRename={handleCommitFavoriteRename}
                onDeleteFavorite={handleDeleteFavorite}
                onApplyHistoryItem={(item) => { applyHistoryItem(item); setShowResourceLibrary(false); }}
                onClearHistory={() => { clearImageGenerationHistory(); setRecentHistory([]); setReferenceLibrary([]); }}
                onApplyReferenceLibraryImage={handleApplyReferenceLibraryImage}
                onSaveReferenceFavorite={(value, seedLabel) => void handleSaveReferenceFavorite(value, seedLabel)}
                formatHistoryTime={formatHistoryTime}
                onToggleRecovery={() => { const next = !showRecoveryPanel; closeAllMenus(); setShowRecoveryPanel(next); }}
                onTaskIdChange={setRecoveryTaskId}
                onRecover={() => void handleRecoverTask()}
                onSubmit={() => prompt.trim() && !isGenerating && handleGenerate()}
            />
        </div>
        </>
    );
}
