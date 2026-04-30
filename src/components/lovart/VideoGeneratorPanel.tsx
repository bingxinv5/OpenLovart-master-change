"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LibraryBig, Sparkles, ChevronDown, Upload, X, Video, MousePointerClick, FolderOpen, Film, Volume2, Settings2, ChevronRight } from 'lucide-react';
import { debugLog } from '@/lib/debug-log';
import { CANVAS_LEGACY_MIGRATION_VERSION, hasCurrentCanvasLegacyMigration } from './canvas-types';
import { getGeneratorStatusState } from './GeneratorStatusCard';
import { WorkbenchImage } from './WorkbenchImage';
import {
    GeneratorRecoveryTaskCard,
    GeneratorReferenceStack,
    GeneratorStatusSection,
    GeneratorSubmitButton,
    MentionComposerSuggestions,
} from './generator-panel-sections';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from './generator-error-utils';
import { createGeneratorTaskUpdate, useClearGeneratorError } from './generator-panel-hooks';
import { useVideoGeneratorPanelPersistence } from './useGeneratorPanelPersistence';
import {
    findGeneratorElement,
    useCanvasImageSelectionEvent,
    type GeneratorCanvasElement,
} from './generator-panel-shared';
import { runVideoGenerationFlow } from './video-generation-flow';
import { uploadReferenceFile } from '@/lib/ai-client';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import type { ProjectMediaHistoryItem } from '@/lib/project-media-history';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { useVideoGenerationDefaults } from '@/lib/generation-defaults';
import {
    insertTextAtSelection,
    normalizeMentionText,
    removeMentionToken,
    removeMentionTokens,
    type TextareaSelection,
} from './textarea-mention-utils';
import {
    buildPromptComposerSegments,
    getPromptMentionSuggestions,
    materializePromptMentions,
    resolvePromptMentionDeletion,
} from './generator-mention-view-model';
import {
    getMaxAudiosForVideoModel,
    getMaxImagesForVideoModel,
    getMaxVideosForVideoModel,
    getVideoAddImageTitle,
    getVideoAspectRatioOptions,
    getVideoDurationOptions,
    getVideoResolutionOptions,
    isComponentsVideoModel,
    isDomesticMultimodalVideoModel,
    VIDEO_MODEL_DESC,
    VIDEO_MODEL_LABELS,
    VIDEO_MODEL_OPTIONS,
    type DomesticGenerationMode,
    type VideoAspectRatio as AspectRatio,
    type VideoDurationValue as Duration,
    type VideoModel,
    type VideoResolution,
} from './generator-model-options';
import {
    buildFrameSlotSequence,
    buildVideoPromptMentions,
    buildVideoReferencePreviewItems,
    dedupeMediaItems,
    getAvailableFrameImageTypes,
    getPromptMentionEmptyState,
    getPromptMentionPanelTitle,
    getPromptMentionPlaceholder,
    parseStoredFrameImages,
    parseStoredPromptMentionBindings,
    parseStoredReferenceMedia,
    resolveInitialDomesticMode,
    resolveNextFrameSlotType,
    resolvePromptMentionQuery,
    type FrameImage,
    type PromptMention,
    type PromptMentionBinding,
    type PromptMentionQuery,
    type ReferenceMediaItem,
    type ReferenceMediaKind,
    type ResourceLibraryTab,
} from './generator-reference-view-model';

type PromptSelection = TextareaSelection;

interface VideoGeneratorPanelProps {
    elementId: string;
    onGenerate: (result: { videoUrl: string; taskId?: string | null }) => Promise<void>;
    onRecoverTask?: (elementId: string, taskId: string) => Promise<void>;
    isGenerating: boolean;
    style?: React.CSSProperties;
    canvasElements?: GeneratorCanvasElement[];
    onElementChange?: (id: string, attrs: Record<string, unknown>) => void;
    onSubmittingChange?: (id: string, isSubmitting: boolean, liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; duration?: string }, completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' }) => void;
    onRequestCanvasSelect?: (imageType: 'first_frame' | 'last_frame' | 'reference') => void;
    projectReferenceImages?: ProjectReferenceImageItem[];
    projectMediaItems?: ProjectMediaHistoryItem[];
    onUseProjectReferenceImage?: (id: string) => void;
    onRecordProjectMediaItem?: (params: { kind: 'image' | 'video' | 'audio'; content: string; prompt?: string }) => void;
}

export function VideoGeneratorPanel(props: VideoGeneratorPanelProps) {
    const {
        elementId,
        onGenerate,
        onRecoverTask,
        isGenerating: isGeneratingFromParent,
        style,
        canvasElements,
        onElementChange,
        onSubmittingChange,
        onRequestCanvasSelect,
        projectReferenceImages = [],
        projectMediaItems = [],
        onUseProjectReferenceImage,
        onRecordProjectMediaItem,
    } = props;
    const videoDefaults = useVideoGenerationDefaults();

    // Read initial values from element
    const currentElement = findGeneratorElement(canvasElements, elementId);
    const initialFrameImages = useMemo<FrameImage[]>(
        () => parseStoredFrameImages(currentElement?.savedFrameImages),
        [currentElement?.savedFrameImages],
    );
    const initialReferenceVideos = useMemo(
        () => parseStoredReferenceMedia(currentElement?.savedReferenceVideos, 'video'),
        [currentElement?.savedReferenceVideos],
    );
    const initialReferenceAudios = useMemo(
        () => parseStoredReferenceMedia(currentElement?.savedReferenceAudios, 'audio'),
        [currentElement?.savedReferenceAudios],
    );
    const initialPromptMentionBindings = useMemo(
        () => parseStoredPromptMentionBindings(currentElement?.savedPromptMentionBindings ?? currentElement?.savedPromptMentionIds),
        [currentElement?.savedPromptMentionBindings, currentElement?.savedPromptMentionIds],
    );
    const [prompt, setPrompt] = useState(currentElement?.savedPrompt || '');
    const [model, setModel] = useState<VideoModel>((currentElement?.selectedModel as VideoModel) || videoDefaults.model);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>((currentElement?.selectedAspectRatio as AspectRatio) || videoDefaults.aspectRatio);
    const [duration, setDuration] = useState<Duration>((currentElement?.selectedDuration as Duration) || videoDefaults.duration);
    const [enhancePrompt, setEnhancePrompt] = useState(currentElement?.selectedEnhancePrompt ?? videoDefaults.enhancePrompt);
    const [resolution, setResolution] = useState<VideoResolution>((currentElement?.selectedResolution as VideoResolution) || '720p');
    const [generateAudio, setGenerateAudio] = useState(currentElement?.selectedGenerateAudio ?? true);
    const [frameImages, setFrameImages] = useState<FrameImage[]>(initialFrameImages);
    const [referenceVideos, setReferenceVideos] = useState<ReferenceMediaItem[]>(initialReferenceVideos);
    const [referenceAudios, setReferenceAudios] = useState<ReferenceMediaItem[]>(initialReferenceAudios);
    const [promptMentionBindings, setPromptMentionBindings] = useState<PromptMentionBinding[]>(initialPromptMentionBindings);
    const [domesticMode, setDomesticMode] = useState<DomesticGenerationMode>(() => resolveInitialDomesticMode(
        currentElement?.selectedDomesticMode,
        initialFrameImages,
        initialReferenceVideos,
        initialReferenceAudios,
    ));
    const [mentionQuery, setMentionQuery] = useState<PromptMentionQuery | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryTaskId, setRecoveryTaskId] = useState(currentElement?.generatingTaskId || currentElement?.sourceGenerationTaskId || '');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [uploadingReferenceKind, setUploadingReferenceKind] = useState<ReferenceMediaKind | null>(null);

    // Read generation status from element (polling is done by parent)
    const isGeneratingFromElement = !!currentElement?.generatingTaskId;
    const progressFromElement = currentElement?.generatingProgress || 0;
    const errorFromElement = currentElement?.generatingError || null;
    const isSubmittingToApi = isSubmitting || isGeneratingFromParent;
    const isGenerating = isGeneratingFromElement || isSubmittingToApi;
    const progress = progressFromElement;
    const statusState = getGeneratorStatusState({
        kind: 'video',
        isSubmitting: isGeneratingFromParent,
        isGeneratingTask: isGeneratingFromElement,
        progress,
        error: errorFromElement || errorMsg,
    });

    // Dropdown states
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
    const [showDurationMenu, setShowDurationMenu] = useState(false);
    const [showAddImageMenu, setShowAddImageMenu] = useState(false);
    const [addImageType, setAddImageType] = useState<'first_frame' | 'last_frame' | 'reference'>('first_frame');
    const [showResourceLibrary, setShowResourceLibrary] = useState(false);
    const [resourceLibraryTab, setResourceLibraryTab] = useState<ResourceLibraryTab>('image');
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showRecoveryPanel, setShowRecoveryPanel] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const promptInputRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dismissedCanvasReferenceSourceIdsRef = useRef<Set<string>>(new Set());
    const promptSelectionRef = useRef<PromptSelection>({ start: prompt.length, end: prompt.length });
    const isPromptComposingRef = useRef(false);

    const closeAllMenus = useCallback(() => {
        setShowModelMenu(false);
        setShowAspectRatioMenu(false);
        setShowDurationMenu(false);
        setShowAddImageMenu(false);
        setShowResourceLibrary(false);
        setShowSettingsPanel(false);
        setShowRecoveryPanel(false);
    }, []);

    const aspectRatios = getVideoAspectRatioOptions(model);
    const durations = getVideoDurationOptions(model);
    const resolutionOptions = getVideoResolutionOptions(model);
    const isDomesticModel = isDomesticMultimodalVideoModel(model);
    const isDomesticFirstLastMode = isDomesticModel && domesticMode === 'first-last-frame';
    const isDomesticOmniMode = isDomesticModel && domesticMode === 'omni-reference';
    const usesReferenceImages = isComponentsVideoModel(model) || isDomesticOmniMode;
    const usesFrameImages = !usesReferenceImages;
    const maxImageSlots = isDomesticFirstLastMode ? 2 : getMaxImagesForVideoModel(model);
    const projectVideoLibrary = useMemo(() => dedupeMediaItems(projectMediaItems, 'video'), [projectMediaItems]);
    const projectAudioLibrary = useMemo(() => dedupeMediaItems(projectMediaItems, 'audio'), [projectMediaItems]);
    const resourceLibraryCount = projectReferenceImages.length + (isDomesticModel ? projectVideoLibrary.length + projectAudioLibrary.length : 0);
    const canAddMoreImages = frameImages.length < maxImageSlots;
    const canAddMoreVideos = isDomesticOmniMode && referenceVideos.length < getMaxVideosForVideoModel(model);
    const canAddMoreAudios = isDomesticOmniMode && referenceAudios.length < getMaxAudiosForVideoModel(model);
    const canAddMoreReferences = canAddMoreImages || canAddMoreVideos || canAddMoreAudios;
    const isReferenceUploadBusy = uploadingReferenceKind !== null;
    const basePromptMentions = useMemo(() => buildVideoPromptMentions({
        useFrameLabels: usesFrameImages,
        frameImages,
        referenceVideos,
        referenceAudios,
    }), [frameImages, referenceAudios, referenceVideos, usesFrameImages]);
    const promptMentionBindingMap = useMemo(
        () => new Map(promptMentionBindings.map((binding) => [binding.mentionId, binding])),
        [promptMentionBindings],
    );
    const promptMentions = useMemo(() => basePromptMentions.map((mention) => {
        if (usesFrameImages) {
            return mention;
        }

        const stableToken = promptMentionBindingMap.get(mention.id)?.token?.trim();
        if (!stableToken || stableToken === mention.token) {
            return mention;
        }

        return {
            ...mention,
            token: stableToken,
            label: stableToken,
            searchText: `${stableToken} ${mention.name}`.toLowerCase(),
        };
    }), [basePromptMentions, promptMentionBindingMap, usesFrameImages]);
    const promptMentionMap = useMemo(() => new Map(promptMentions.map((mention) => [mention.id, mention])), [promptMentions]);
    const promptComposerSegments = useMemo(
        () => buildPromptComposerSegments(prompt, promptMentions),
        [prompt, promptMentions],
    );
    const mentionSuggestions = useMemo(() => getPromptMentionSuggestions(promptMentions, mentionQuery), [mentionQuery, promptMentions]);
    const promptMentionPlaceholder = useMemo(
        () => getPromptMentionPlaceholder({ usesFrameImages, isDomesticOmniMode }),
        [isDomesticOmniMode, usesFrameImages],
    );
    const promptMentionPanelTitle = useMemo(
        () => getPromptMentionPanelTitle(isDomesticOmniMode),
        [isDomesticOmniMode],
    );
    const promptMentionEmptyState = useMemo(
        () => getPromptMentionEmptyState({ usesFrameImages, isDomesticOmniMode }),
        [isDomesticOmniMode, usesFrameImages],
    );
    const referencedPromptMentions = useMemo(() => {
        const seen = new Set<string>();
        return promptComposerSegments.flatMap((segment) => {
            if (segment.type !== 'mention' || seen.has(segment.mention.id)) {
                return [];
            }

            seen.add(segment.mention.id);
            return [segment.mention];
        });
    }, [promptComposerSegments]);
    const hasAnyReferenceAssets = frameImages.length > 0 || referenceVideos.length > 0 || referenceAudios.length > 0;
    const canGenerate = (prompt.trim().length > 0 || (isDomesticModel && hasAnyReferenceAssets)) && !isGenerating && !isReferenceUploadBusy;

    useEffect(() => {
        if (aspectRatios.includes(aspectRatio)) {
            return;
        }

        setAspectRatio(aspectRatio === '3:4' ? '9:16' : '16:9');
    }, [aspectRatio, aspectRatios]);

    useEffect(() => {
        if (durations.includes(duration)) {
            return;
        }

        setDuration(durations[0]);
    }, [duration, durations]);

    useEffect(() => {
        if (resolutionOptions.includes(resolution)) {
            return;
        }

        setResolution(resolutionOptions[resolutionOptions.length - 1]);
    }, [resolution, resolutionOptions]);

    useEffect(() => {
        if (!isDomesticModel) {
            setResourceLibraryTab('image');
        }
    }, [isDomesticModel]);

    useEffect(() => {
        if (!isDomesticModel) {
            return;
        }

        if (isDomesticFirstLastMode) {
            setFrameImages((prev) => {
                const next: FrameImage[] = prev.slice(0, 2).map((item, index) => ({
                    ...item,
                    imageType: (index === 0 ? 'first_frame' : 'last_frame') as FrameImage['imageType'],
                }));

                if (
                    next.length === prev.length
                    && next.every((item, index) => item.id === prev[index]?.id && item.imageType === prev[index]?.imageType)
                ) {
                    return prev;
                }

                return next;
            });
            setReferenceVideos((prev) => (prev.length > 0 ? [] : prev));
            setReferenceAudios((prev) => (prev.length > 0 ? [] : prev));
            if (resourceLibraryTab !== 'image') {
                setResourceLibraryTab('image');
            }
            return;
        }

        setFrameImages((prev) => {
            if (prev.every((item) => item.imageType === 'reference')) {
                return prev;
            }

            return prev.map((item) => ({
                ...item,
                imageType: 'reference',
            }));
        });
    }, [isDomesticFirstLastMode, isDomesticModel, resourceLibraryTab]);

    useVideoGeneratorPanelPersistence({
        elementId,
        model,
        aspectRatio,
        duration,
        enhancePrompt,
        domesticMode,
        isDomesticModel,
        resolution,
        generateAudio,
        prompt,
        promptMentionBindings,
        frameImages,
        referenceVideos,
        referenceAudios,
        onElementChange,
    });

    useEffect(() => {
        if (!currentElement?.selectedModel) {
            setModel(videoDefaults.model);
        }
        if (!currentElement?.selectedAspectRatio) {
            setAspectRatio(videoDefaults.aspectRatio);
        }
        if (!currentElement?.selectedDuration) {
            setDuration(videoDefaults.duration);
        }
        if (typeof currentElement?.selectedEnhancePrompt !== 'boolean') {
            setEnhancePrompt(videoDefaults.enhancePrompt);
        }
    }, [videoDefaults, currentElement?.selectedAspectRatio, currentElement?.selectedDuration, currentElement?.selectedEnhancePrompt, currentElement?.selectedModel]);

    useEffect(() => {
        if (!isRecovering) {
            setRecoveryTaskId(currentElement?.generatingTaskId || currentElement?.sourceGenerationTaskId || '');
        }
    }, [currentElement?.generatingTaskId, currentElement?.sourceGenerationTaskId, isRecovering]);

    useEffect(() => {
        setPromptMentionBindings((prev) => {
            const next = prev.filter((binding) => promptMentionMap.has(binding.mentionId));
            if (
                next.length === prev.length
                && next.every((binding, index) => (
                    binding.mentionId === prev[index]?.mentionId
                    && binding.token === prev[index]?.token
                    && binding.note === prev[index]?.note
                ))
            ) {
                return prev;
            }

            return next;
        });
    }, [promptMentionMap]);

    const legacyMentionBindingsMigratedRef = useRef(false);

    useEffect(() => {
        if (legacyMentionBindingsMigratedRef.current) {
            return;
        }

        if (promptMentionBindings.length === 0) {
            legacyMentionBindingsMigratedRef.current = true;
            return;
        }

        const migratedBindings = promptMentionBindings.flatMap((binding) => {
            const mention = promptMentionMap.get(binding.mentionId);
            if (!mention) {
                return [];
            }

            return [{
                mentionId: binding.mentionId,
                token: usesFrameImages ? mention.token : (binding.token?.trim() || mention.token),
            }];
        });

        const legacySegments = promptMentionBindings.flatMap((binding) => {
            if (binding.token?.trim()) {
                return [];
            }

            const mention = promptMentionMap.get(binding.mentionId);
            if (!mention) {
                return [];
            }

            return [[mention.token, binding.note?.trim()].filter(Boolean).join(' ').trim()];
        });

        const promptAlreadyHasMention = promptMentions.some((mention) => prompt.includes(mention.token));
        const hasLegacyMentionPayload = promptMentionBindings.some((binding) => binding.note || !binding.token?.trim());
        const shouldPersistLegacyMentionMigration = !!currentElement
            && !hasCurrentCanvasLegacyMigration(currentElement)
            && hasLegacyMentionPayload;

        if (legacySegments.length > 0 && !promptAlreadyHasMention) {
            setPrompt((prev) => normalizeMentionText([
                legacySegments.join('，'),
                prev.trim(),
            ].filter(Boolean).join('，')));
        }

        if (
            migratedBindings.length !== promptMentionBindings.length
            || migratedBindings.some((binding, index) => (
                binding.mentionId !== promptMentionBindings[index]?.mentionId
                || binding.token !== promptMentionBindings[index]?.token
            ))
            || promptMentionBindings.some((binding) => binding.note)
        ) {
            setPromptMentionBindings(migratedBindings);
        }

        if (shouldPersistLegacyMentionMigration) {
            onElementChange?.(elementId, {
                savedPromptMentionBindings: migratedBindings.length > 0 ? JSON.stringify(migratedBindings) : undefined,
                savedPromptMentionIds: undefined,
                legacyMigrationVersion: CANVAS_LEGACY_MIGRATION_VERSION,
            });
        }

        legacyMentionBindingsMigratedRef.current = true;
    }, [currentElement, elementId, onElementChange, prompt, promptMentionBindings, promptMentionMap, promptMentions, usesFrameImages]);

    const clearCanvasReferenceBinding = useCallback(() => {
        const sourceId = currentElement?.referenceImageId;
        if (sourceId) {
            dismissedCanvasReferenceSourceIdsRef.current.add(sourceId);
        }

        onElementChange?.(elementId, {
            referenceImageId: undefined,
            savedFrameImages: undefined,
        });
    }, [currentElement?.referenceImageId, elementId, onElementChange]);

    // Auto-fill reference image from source
    useEffect(() => {
        if (canvasElements) {
            const currentElement = findGeneratorElement(canvasElements, elementId);
            const sourceId = currentElement?.referenceImageId;
            if (
                sourceId
                && !currentElement.savedFrameImages
                && !dismissedCanvasReferenceSourceIdsRef.current.has(sourceId)
            ) {
                const sourceImage = canvasElements.find(el => el.id === sourceId);
                if (sourceImage?.content) {
                    const defaultType = usesReferenceImages ? 'reference' : 'first_frame';
                    setFrameImages((prev) => (prev.length > 0 ? prev : [{
                        id: uuidv4(),
                        image: sourceImage.content!,
                        imageType: defaultType,
                        name: '画布图片',
                    }]));
                }
            }
        }
    }, [canvasElements, currentElement?.referenceImageId, currentElement?.savedFrameImages, elementId, usesReferenceImages]);

    useClearGeneratorError(elementId, errorFromElement, onElementChange);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = promptInputRef.current;
        if (!textarea) return;
        textarea.style.height = 'auto';
        const maxHeight = 120;
        const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [prompt]);

    const handleCanvasSelectionEvent = useCallback((detail: { imageContent?: string; imageType?: 'first_frame' | 'last_frame' | 'reference' }) => {
        if (!detail.imageContent) return;

        const imageType = detail.imageType || (usesReferenceImages ? 'reference' : resolveNextFrameSlotType(frameImages));
        const maxImages = maxImageSlots;
        if (frameImages.length >= maxImages) return;

        setFrameImages((prev) => [...prev, {
            id: uuidv4(),
            image: detail.imageContent!,
            imageType,
            name: '画布图片',
        }]);
    }, [frameImages, maxImageSlots, usesReferenceImages]);

    useCanvasImageSelectionEvent(elementId, handleCanvasSelectionEvent);

    // Clear frame images when model changes (different types supported)
    useEffect(() => {
        if (usesFrameImages) {
            setFrameImages(prev => {
                if (prev.length === 0) return prev;
                return prev.slice(0, 2).map(img => ({
                    ...img,
                    imageType: img.imageType === 'reference' ? 'first_frame' : img.imageType,
                }));
            });
        } else {
            setFrameImages(prev => {
                if (prev.length === 0) return prev;
                return prev.slice(0, maxImageSlots).map(img => ({
                    ...img,
                    imageType: 'reference' as const,
                }));
            });
        }
    }, [maxImageSlots, usesFrameImages]);

    useEffect(() => {
        if (usesReferenceImages) {
            if (addImageType !== 'reference') {
                setAddImageType('reference');
            }
            return;
        }

        if (frameImages.length >= maxImageSlots) {
            return;
        }

        const nextSlotType = resolveNextFrameSlotType(frameImages);
        if (addImageType !== nextSlotType) {
            setAddImageType(nextSlotType);
        }
    }, [addImageType, frameImages, maxImageSlots, usesReferenceImages]);

    // Polling is handled by parent (canvas page), not here

    const syncPromptMentionQuery = useCallback((nextPrompt: string, caretIndex: number) => {
        setMentionQuery(resolvePromptMentionQuery(nextPrompt, caretIndex));
    }, []);

    const syncPromptSelectionFromInput = useCallback((input: HTMLTextAreaElement | null) => {
        if (!input) {
            return;
        }

        const nextSelection: PromptSelection = {
            start: input.selectionStart ?? 0,
            end: input.selectionEnd ?? (input.selectionStart ?? 0),
        };
        promptSelectionRef.current = nextSelection;

        if (!isPromptComposingRef.current) {
            syncPromptMentionQuery(input.value, nextSelection.start);
        }
    }, [syncPromptMentionQuery]);

    const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextPrompt = event.target.value;
        const nextSelection: PromptSelection = {
            start: event.target.selectionStart ?? nextPrompt.length,
            end: event.target.selectionEnd ?? (event.target.selectionStart ?? nextPrompt.length),
        };

        promptSelectionRef.current = nextSelection;
        setPrompt(nextPrompt);
        if (!isPromptComposingRef.current) {
            syncPromptMentionQuery(nextPrompt, nextSelection.start);
        }
    }, [syncPromptMentionQuery]);

    const handlePromptSelectionChange = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
        syncPromptSelectionFromInput(event.currentTarget);
    }, [syncPromptSelectionFromInput]);

    const handlePromptCompositionEnd = useCallback((event: React.CompositionEvent<HTMLTextAreaElement>) => {
        isPromptComposingRef.current = false;
        const nextPrompt = event.currentTarget.value;
        const nextSelection: PromptSelection = {
            start: event.currentTarget.selectionStart ?? nextPrompt.length,
            end: event.currentTarget.selectionEnd ?? (event.currentTarget.selectionStart ?? nextPrompt.length),
        };

        promptSelectionRef.current = nextSelection;
        setPrompt(nextPrompt);
        syncPromptMentionQuery(nextPrompt, nextSelection.start);
    }, [syncPromptMentionQuery]);

    const applyPromptMention = useCallback((mention: PromptMention) => {
        const input = promptInputRef.current;
        const basePrompt = input?.value ?? prompt;
        const liveSelection = input ? {
            start: input.selectionStart ?? promptSelectionRef.current.start,
            end: input.selectionEnd ?? promptSelectionRef.current.end,
        } : promptSelectionRef.current;
        const stableToken = promptMentionBindingMap.get(mention.id)?.token?.trim() || mention.token;
        const activeQuery = liveSelection.start === liveSelection.end
            ? resolvePromptMentionQuery(basePrompt, liveSelection.start)
            : null;
        const { nextValue, nextSelection } = insertTextAtSelection({
            value: basePrompt,
            selection: liveSelection,
            insertText: `${stableToken} `,
            replaceRange: activeQuery ? { start: activeQuery.start, end: activeQuery.end } : undefined,
            ensureSpacing: true,
        });

        setPromptMentionBindings((prev) => prev.some((binding) => binding.mentionId === mention.id)
            ? prev.map((binding) => (
                binding.mentionId === mention.id
                    ? { mentionId: binding.mentionId, token: binding.token?.trim() || stableToken }
                    : binding
            ))
            : [...prev, { mentionId: mention.id, token: stableToken }]);
        promptSelectionRef.current = nextSelection;
        setPrompt(nextValue);
        setMentionQuery(null);

        requestAnimationFrame(() => {
            const textarea = promptInputRef.current;
            if (!textarea) {
                return;
            }

            textarea.focus();
            textarea.setSelectionRange(nextSelection.start, nextSelection.end);
        });
    }, [prompt, promptMentionBindingMap]);

    const clearMountedReferences = useCallback(() => {
        setPrompt((prev) => removeMentionTokens(prev, promptMentionBindings.flatMap((binding) => binding.token ? [binding.token] : [])));
        setFrameImages([]);
        setReferenceVideos([]);
        setReferenceAudios([]);
        setPromptMentionBindings([]);
        clearCanvasReferenceBinding();
    }, [clearCanvasReferenceBinding, promptMentionBindings]);

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const editor = e.currentTarget;
        const livePrompt = editor.value;
        const liveSelection: PromptSelection = {
            start: editor.selectionStart ?? livePrompt.length,
            end: editor.selectionEnd ?? (editor.selectionStart ?? livePrompt.length),
        };
        promptSelectionRef.current = liveSelection;
        const liveMentionQuery = resolvePromptMentionQuery(livePrompt, liveSelection.start) ?? mentionQuery;
        const liveMentionSuggestions = getPromptMentionSuggestions(promptMentions, liveMentionQuery);

        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (liveSelection.start === liveSelection.end) {
                const mentionDeletion = resolvePromptMentionDeletion(livePrompt, promptMentions, liveSelection.start, e.key);
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
                    applyPromptMention(liveMentionSuggestions[0]);
                }
                return;
            }
        }

        if (e.key === 'Enter' && e.shiftKey) {
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canGenerate) {
                await handleGenerate();
            }
        }
    };

    const handleGenerate = async () => {
        if (isDomesticModel && referenceAudios.length > 0 && referenceVideos.length === 0 && frameImages.length === 0) {
            setErrorMsg('参考音频不能单独使用，还需要至少一张参考图或一条参考视频');
            return;
        }

        const resolvedPrompt = materializePromptMentions(prompt, promptMentions);

        setIsSubmitting(true);
        onSubmittingChange?.(elementId, true, { prompt: resolvedPrompt, model, aspectRatio, duration });
        setErrorMsg(null);
        let submissionAccepted = false;
        let submissionOutcome: 'succeeded' | 'failed' | 'interrupted' = 'failed';

        try {
            // Resolve mounted image references to concrete payload inputs before submission.
            const apiImages: { image: string; image_type: string }[] = [];
            for (const fi of frameImages) {
                let imageData = fi.image;
                if (isImageRef(imageData)) {
                    const dataUrl = await getImageDataUrl(imageData);
                    if (!dataUrl) continue;
                    imageData = dataUrl;
                }
                apiImages.push({ image: imageData, image_type: fi.imageType });
            }

            const apiReferenceImages = usesReferenceImages
                ? apiImages.map((item) => item.image)
                : undefined;
            const apiFrameImages = usesReferenceImages
                ? undefined
                : apiImages;

            const data = await runVideoGenerationFlow({
                prompt: resolvedPrompt,
                model,
                aspectRatio,
                duration,
                enhancePrompt,
                generationMode: isDomesticModel ? domesticMode : undefined,
                referenceImages: apiReferenceImages && apiReferenceImages.length > 0 ? apiReferenceImages : undefined,
                images: apiFrameImages && apiFrameImages.length > 0 ? apiFrameImages : undefined,
                videos: isDomesticOmniMode && referenceVideos.length > 0 ? referenceVideos.map((item) => item.url) : undefined,
                audios: isDomesticOmniMode && referenceAudios.length > 0 ? referenceAudios.map((item) => item.url) : undefined,
                resolution: isDomesticModel ? resolution : undefined,
                generateAudio: isDomesticModel ? generateAudio : undefined,
            });

            debugLog('[VideoGen] API response:', data);

            if (data.status === 'pending') {
                // Async task - store taskId on element, parent will poll
                submissionAccepted = true;
                onElementChange?.(elementId, createGeneratorTaskUpdate(data.taskId, 'video'));
            } else {
                submissionAccepted = true;
                await onGenerate({ videoUrl: data.videoUrl, taskId: data.taskId });
            }

            submissionOutcome = 'succeeded';
        } catch (error) {
            const isInterrupted = !submissionAccepted && isRecoverableGenerationSubmissionError(error);
            const classifiedMessage = classifyGenerationError('video', error);
            submissionOutcome = isInterrupted ? 'interrupted' : 'failed';
            (isInterrupted ? console.warn : console.error)('[VideoGen] Error:', error);
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

    const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const maxImages = maxImageSlots;
            const remaining = maxImages - frameImages.length;
            const filesToAdd = Array.from(e.target.files).slice(0, remaining);
            const frameSlotSequence = usesReferenceImages ? [] : buildFrameSlotSequence(frameImages, filesToAdd.length);
            filesToAdd.forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    addFrameImage(dataUrl, file.name, usesReferenceImages ? undefined : frameSlotSequence.shift());
                };
                reader.readAsDataURL(file);
            });
            setShowAddImageMenu(false);
            e.target.value = '';
        }
    };

    const addFrameImage = (imageData: string, name: string, imageTypeOverride?: 'first_frame' | 'last_frame' | 'reference') => {
        setFrameImages((prev) => {
            const maxImages = maxImageSlots;
            if (prev.length >= maxImages) {
                return prev;
            }

            const nextImageType = imageTypeOverride || (usesReferenceImages ? 'reference' : resolveNextFrameSlotType(prev));

            return [...prev, {
                id: uuidv4(),
                image: imageData,
                imageType: nextImageType,
                name,
            }];
        });
    };

    const addReferenceAsset = useCallback((url: string, name: string, kind: ReferenceMediaKind) => {
        const normalizedUrl = url.trim();
        if (!normalizedUrl) {
            return;
        }

        const item: ReferenceMediaItem = {
            id: uuidv4(),
            url: normalizedUrl,
            name: name.trim() || (kind === 'video' ? '参考视频' : '参考音频'),
            kind,
        };

        if (kind === 'video') {
            setReferenceVideos((prev) => {
                if (prev.some((entry) => entry.url === normalizedUrl) || prev.length >= getMaxVideosForVideoModel(model)) {
                    return prev;
                }
                return [...prev, item];
            });
            return;
        }

        setReferenceAudios((prev) => {
            if (prev.some((entry) => entry.url === normalizedUrl) || prev.length >= getMaxAudiosForVideoModel(model)) {
                return prev;
            }
            return [...prev, item];
        });
    }, [model]);

    const handleUploadReferenceFiles = useCallback(async (files: File[], kind: ReferenceMediaKind) => {
        if (files.length === 0) {
            return;
        }

        setUploadingReferenceKind(kind);
        setErrorMsg(null);

        try {
            for (const file of files) {
                const uploaded = await uploadReferenceFile(file);
                addReferenceAsset(uploaded.reference, file.name, kind);
                onRecordProjectMediaItem?.({
                    kind,
                    content: uploaded.reference,
                    prompt: file.name,
                });
            }
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : '参考素材上传失败');
        } finally {
            setUploadingReferenceKind(null);
        }
    }, [addReferenceAsset, onRecordProjectMediaItem]);

    const handleVideoFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).slice(0, Math.max(0, getMaxVideosForVideoModel(model) - referenceVideos.length));
        event.target.value = '';
        await handleUploadReferenceFiles(files, 'video');
    };

    const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).slice(0, Math.max(0, getMaxAudiosForVideoModel(model) - referenceAudios.length));
        event.target.value = '';
        await handleUploadReferenceFiles(files, 'audio');
    };

    const handleApplyProjectReference = useCallback((item: ProjectReferenceImageItem) => {
        const imageType = usesReferenceImages ? 'reference' : addImageType;
        addFrameImage(item.image, item.label, imageType);
        onUseProjectReferenceImage?.(item.id);
        setShowResourceLibrary(false);
    }, [addImageType, onUseProjectReferenceImage, usesReferenceImages]);

    const handleApplyProjectMediaReference = useCallback((item: ProjectMediaHistoryItem) => {
        if (item.kind !== 'video' && item.kind !== 'audio') {
            return;
        }

        addReferenceAsset(item.content, item.prompt || (item.kind === 'video' ? '项目视频素材' : '项目音频素材'), item.kind);
        setShowResourceLibrary(false);
    }, [addReferenceAsset]);

    const removeFrameImage = (id: string) => {
        const binding = promptMentionBindingMap.get(id);
        const nextFrameImages = frameImages.filter((fi) => fi.id !== id);
        setFrameImages(nextFrameImages);
        const token = binding?.token;
        if (token) {
            setPrompt((prev) => removeMentionToken(prev, token));
        }
        setPromptMentionBindings((prev) => prev.filter((binding) => binding.mentionId !== id));
        if (nextFrameImages.length === 0) {
            clearCanvasReferenceBinding();
        }
    };

    const removeReferenceAsset = (id: string, kind: ReferenceMediaKind) => {
        const binding = promptMentionBindingMap.get(id);
        const token = binding?.token;
        if (token) {
            setPrompt((prev) => removeMentionToken(prev, token));
        }
        setPromptMentionBindings((prev) => prev.filter((binding) => binding.mentionId !== id));
        if (kind === 'video') {
            setReferenceVideos((prev) => prev.filter((item) => item.id !== id));
            return;
        }

        setReferenceAudios((prev) => prev.filter((item) => item.id !== id));
    };

    const activeResourceTab: ResourceLibraryTab = isDomesticOmniMode ? resourceLibraryTab : 'image';
    const availableImageTypes = useMemo(() => getAvailableFrameImageTypes(frameImages, usesReferenceImages), [frameImages, usesReferenceImages]);
    const referencePreviewItems = useMemo(() => buildVideoReferencePreviewItems({
        frameImages,
        referenceVideos,
        referenceAudios,
    }), [frameImages, referenceAudios, referenceVideos]);

    return (
        <div
            className="absolute z-[130] bg-white/96 backdrop-blur-xl rounded-[20px] shadow-xl border border-slate-200/60 w-[620px]"
            data-testid="video-generator-panel"
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
            {/* Hidden file inputs */}
            <input
                type="file"
                ref={imageInputRef}
                className="hidden"
                accept="image/*"
                multiple
                aria-label="上传参考图片"
                onChange={handleImageFileSelect}
            />
            <input
                type="file"
                ref={videoInputRef}
                className="hidden"
                accept="video/*"
                multiple
                aria-label="上传参考视频"
                onChange={(event) => { void handleVideoFileSelect(event); }}
            />
            <input
                type="file"
                ref={audioInputRef}
                className="hidden"
                accept="audio/*"
                multiple
                aria-label="上传参考音频"
                onChange={(event) => { void handleAudioFileSelect(event); }}
            />

            <div className="p-3 pb-2">
                <div className="relative">
                    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                        <div className="relative px-3 py-2.5">
                            <textarea
                                ref={promptInputRef}
                                value={prompt}
                                readOnly={isGenerating}
                                spellCheck={false}
                                rows={2}
                                role="textbox"
                                aria-multiline="true"
                                aria-label="描述你想要生成的视频"
                                placeholder={promptMentionPlaceholder}
                                onChange={handlePromptChange}
                                onKeyDown={handleKeyDown}
                                onKeyUp={handlePromptSelectionChange}
                                onSelect={handlePromptSelectionChange}
                                onClick={handlePromptSelectionChange}
                                onFocus={handlePromptSelectionChange}
                                onCompositionStart={() => {
                                    isPromptComposingRef.current = true;
                                }}
                                onCompositionEnd={handlePromptCompositionEnd}
                                onBlur={() => {
                                    window.setTimeout(() => setMentionQuery(null), 120);
                                }}
                                className="w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400/60"
                            />
                        </div>

                        <GeneratorReferenceStack
                            items={referencePreviewItems}
                            canAddMore={canAddMoreReferences}
                            isAddBusy={isReferenceUploadBusy}
                            addButtonTitle={getVideoAddImageTitle(model, domesticMode)}
                            confirmClear={confirmClear}
                            clearTitle="清空素材"
                            onAdd={() => {
                                if (availableImageTypes.length > 0) setAddImageType(availableImageTypes[0].value);
                                const next = !showAddImageMenu;
                                closeAllMenus();
                                setShowAddImageMenu(next);
                            }}
                            onClear={() => {
                                if (confirmClear) {
                                    clearMountedReferences();
                                    setConfirmClear(false);
                                } else {
                                    setConfirmClear(true);
                                    setTimeout(() => setConfirmClear(false), 2000);
                                }
                            }}
                            onRemove={(item) => item.kind === 'image' ? removeFrameImage(item.id) : removeReferenceAsset(item.id, item.kind)}
                        />
                    </div>

                    {/* Add image menu (positioned outside overflow container) */}
                    {showAddImageMenu && (
                        <div className="absolute bottom-[48px] left-3 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-50 min-w-[160px]" data-popover-menu>
                            {usesFrameImages && availableImageTypes.length > 1 && (
                                <>
                                    <div className="px-2 py-1 text-[10px] text-slate-400 uppercase">帧类型</div>
                                    <div className="flex gap-1 px-2 pb-1">
                                        {availableImageTypes.map(t => (
                                            <button key={t.value} onClick={() => setAddImageType(t.value)} className={`px-2 py-0.5 text-xs rounded-md transition-colors ${addImageType === t.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.label}</button>
                                        ))}
                                    </div>
                                    <div className="border-t border-slate-100 my-1" />
                                </>
                            )}
                            <button type="button" onClick={() => { imageInputRef.current?.click(); setShowAddImageMenu(false); }} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                                <Upload size={14} className="text-slate-400" /><span>上传图片</span>
                            </button>
                            {isDomesticOmniMode && (
                                <>
                                    <button type="button" onClick={() => { videoInputRef.current?.click(); setShowAddImageMenu(false); }} disabled={!canAddMoreVideos} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreVideos ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                                        <Film size={14} className="text-slate-400" /><span>上传视频</span>
                                    </button>
                                    <button type="button" onClick={() => { audioInputRef.current?.click(); setShowAddImageMenu(false); }} disabled={!canAddMoreAudios} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreAudios ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                                        <Volume2 size={14} className="text-slate-400" /><span>上传音频</span>
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={() => { setShowAddImageMenu(false); onRequestCanvasSelect?.(usesReferenceImages ? 'reference' : addImageType); }} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                                <MousePointerClick size={14} className="text-slate-400" /><span>从画布选择</span>
                            </button>
                        </div>
                    )}

                    {mentionQuery && (
                        <MentionComposerSuggestions
                            title={promptMentionPanelTitle}
                            suggestions={mentionSuggestions.map((mention) => ({
                                id: mention.id,
                                name: mention.name,
                                label: mention.label,
                                kind: mention.kind,
                                previewImage: mention.previewImage,
                            }))}
                            emptyText={promptMentionEmptyState}
                            onApply={(item) => {
                                const mention = mentionSuggestions.find((candidate) => candidate.id === item.id);
                                if (mention) applyPromptMention(mention);
                            }}
                        />
                    )}
                </div>
            </div>

            <GeneratorStatusSection
                kind="video"
                state={statusState}
                error={errorFromElement || errorMsg}
                onClearError={() => setErrorMsg(null)}
            />

            {/* Footer Controls — single row */}
            <div className="relative z-10 rounded-b-[20px] border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    {/* Model Selector */}
                    <div className="relative" data-popover-menu>
                        <button
                            onClick={() => { const next = !showModelMenu; closeAllMenus(); setShowModelMenu(next); }}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white rounded-lg transition-colors text-xs font-medium text-slate-700 whitespace-nowrap"
                        >
                            <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                                <Video size={8} className="text-white" />
                            </div>
                            <span className="whitespace-nowrap">{VIDEO_MODEL_LABELS[model]}</span>
                            <ChevronDown size={11} className="text-slate-400" />
                        </button>
                        {showModelMenu && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-30 min-w-[200px]">
                                {VIDEO_MODEL_OPTIONS.map((m) => (
                                    <div key={m} onClick={() => { setModel(m); setShowModelMenu(false); }} className={`px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg mx-1 transition-colors ${model === m ? 'bg-slate-50' : ''}`}>
                                            <div className={`text-xs font-medium ${model === m ? 'text-violet-600' : 'text-slate-700'}`}>{VIDEO_MODEL_LABELS[m]}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">{VIDEO_MODEL_DESC[m]}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Params summary labels — click to open settings */}
                    <div className="relative shrink-0" data-popover-menu>
                        <button
                            type="button"
                            onClick={() => { const next = !showSettingsPanel; closeAllMenus(); setShowSettingsPanel(next); }}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/60 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white hover:text-slate-700 hover:border-slate-300"
                        >
                            {isDomesticModel && <><Settings2 size={12} /><span className="font-medium">{domesticMode === 'first-last-frame' ? '首尾帧' : '全能参考'}</span><span className="text-slate-300">·</span></>}
                            <span>{aspectRatio}</span>
                            <span className="text-slate-300">·</span>
                            {isDomesticModel && <><span>{resolution.toUpperCase()}</span><span className="text-slate-300">·</span></>}
                            <span>{duration}</span>
                            {isDomesticModel && <><span className="text-slate-300">·</span><Volume2 size={11} className={generateAudio ? 'text-emerald-500' : 'text-slate-300'} /></>}
                            {enhancePrompt && <><span className="text-slate-300">·</span><Sparkles size={11} className="text-violet-500" /></>}
                            <ChevronDown size={11} className="text-slate-400 ml-0.5" />
                        </button>

                        {showSettingsPanel && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[280px] overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                    <span className="text-xs font-medium text-slate-700">生成设置</span>
                                    <span className="text-[10px] text-slate-400">{isDomesticModel ? `${domesticMode === 'first-last-frame' ? '首尾帧' : '全能参考'} · ` : ''}{aspectRatio}{isDomesticModel ? ` · ${resolution.toUpperCase()}` : ''} · {duration}</span>
                                </div>
                                <div className="p-4 space-y-0">
                                    {/* Domestic mode toggle — prominent card */}
                                    {isDomesticModel && (
                                        <div className="rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/80 p-3 mb-4">
                                            <div className="mb-2 text-[11px] font-semibold text-slate-600">生成方式</div>
                                            <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm">
                                                {([{ value: 'first-last-frame' as const, label: '首尾帧' }, { value: 'omni-reference' as const, label: '全能参考' }]).map((opt) => (
                                                    <button key={opt.value} type="button" onClick={() => setDomesticMode(opt.value)} disabled={isGenerating || isReferenceUploadBusy} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${domesticMode === opt.value ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{opt.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Aspect ratio with visual icons */}
                                    <div className="py-3 border-t border-slate-100/80">
                                        <div className="mb-2 text-[11px] font-medium text-slate-500">画面比例</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {aspectRatios.map((ratio) => {
                                                const ratioShapes: Record<string, { w: number; h: number }> = { '16:9': { w: 14, h: 8 }, '9:16': { w: 8, h: 14 }, '1:1': { w: 10, h: 10 }, '4:3': { w: 12, h: 9 }, '3:4': { w: 9, h: 12 } };
                                                const shape = ratioShapes[ratio] || { w: 10, h: 10 };
                                                return (
                                                    <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${aspectRatio === ratio ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                        <span className={`inline-block rounded-[2px] border ${aspectRatio === ratio ? 'border-white/50' : 'border-slate-400/50'}`} style={{ width: `${shape.w}px`, height: `${shape.h}px` }} />
                                                        {ratio}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Resolution (domestic only) */}
                                    {isDomesticModel && (
                                        <div className="py-3 border-t border-slate-100/80">
                                            <div className="mb-2 text-[11px] font-medium text-slate-500">分辨率</div>
                                            <div className="flex gap-1.5">
                                                {resolutionOptions.map((opt) => (
                                                    <button key={opt} type="button" onClick={() => setResolution(opt)} disabled={isGenerating || isReferenceUploadBusy} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${resolution === opt ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{opt.toUpperCase()}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Duration — compact grid */}
                                    <div className="py-3 border-t border-slate-100/80">
                                        <div className="mb-2 text-[11px] font-medium text-slate-500">时长</div>
                                        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(durations.length, 6)}, 1fr)` }}>
                                            {durations.map((d) => (
                                                <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-lg py-1.5 text-xs font-medium transition-colors text-center ${duration === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d}</button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Audio toggle (domestic only) — inline toggle */}
                                    {isDomesticModel && (
                                        <div className="flex items-center justify-between py-3 border-t border-slate-100/80">
                                            <div className="flex items-center gap-1.5">
                                                <Volume2 size={13} className={generateAudio ? 'text-emerald-500' : 'text-slate-400'} />
                                                <span className="text-[11px] font-medium text-slate-600">生成音频</span>
                                            </div>
                                            <button type="button" onClick={() => setGenerateAudio(!generateAudio)} disabled={isGenerating || isReferenceUploadBusy} className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${generateAudio ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                                <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${generateAudio ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Enhance prompt toggle — inline toggle */}
                                    <div className="flex items-center justify-between py-3 border-t border-slate-100/80">
                                        <div className="flex items-center gap-1.5">
                                            <Sparkles size={13} className={enhancePrompt ? 'text-violet-500' : 'text-slate-400'} />
                                            <span className="text-[11px] font-medium text-slate-600">提示词增强</span>
                                        </div>
                                        <button type="button" onClick={() => setEnhancePrompt(!enhancePrompt)} className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${enhancePrompt ? 'bg-violet-500' : 'bg-slate-200'}`}>
                                            <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${enhancePrompt ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Resource Library */}
                    {resourceLibraryCount > 0 && (
                        <div className="relative" data-popover-menu>
                            <button
                                onClick={() => { const next = !showResourceLibrary; closeAllMenus(); setShowResourceLibrary(next); }}
                                className={`relative flex items-center justify-center rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${showResourceLibrary ? 'bg-violet-50 text-violet-600' : 'text-slate-500 hover:bg-white'}`}
                                title="资源库"
                            >
                                <FolderOpen size={13} />
                                <span className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${showResourceLibrary ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{resourceLibraryCount}</span>
                            </button>

                            {showResourceLibrary && (
                                <div className="absolute bottom-full right-0 mb-1 bg-white/96 backdrop-blur-xl rounded-[16px] shadow-lg border border-slate-200/60 z-30 w-[400px] overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                                        <LibraryBig size={12} className="text-violet-600" />
                                        <span className="text-xs font-medium text-slate-700">项目素材库</span>
                                        <span className="text-[10px] text-slate-400">({resourceLibraryCount})</span>
                                    </div>

                                    {isDomesticModel && (
                                        <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
                                            {([
                                                { id: 'image' as const, label: '图片', count: projectReferenceImages.length },
                                                ...(isDomesticOmniMode
                                                    ? [
                                                        { id: 'video' as const, label: '视频', count: projectVideoLibrary.length },
                                                        { id: 'audio' as const, label: '音频', count: projectAudioLibrary.length },
                                                    ]
                                                    : []),
                                            ]).map((tab) => (
                                                <button key={tab.id} type="button" onClick={() => setResourceLibraryTab(tab.id)} className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${activeResourceTab === tab.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tab.label} {tab.count}</button>
                                            ))}
                                        </div>
                                    )}

                                    {activeResourceTab === 'image' && usesFrameImages && availableImageTypes.length > 0 && (
                                        <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
                                            <span className="text-[10px] text-slate-400">帧类型:</span>
                                            {availableImageTypes.map((typeOption) => (
                                                <button key={typeOption.value} type="button" onClick={() => setAddImageType(typeOption.value)} className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${addImageType === typeOption.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{typeOption.label}</button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="max-h-[240px] overflow-y-auto panel-scroll p-2">
                                        {activeResourceTab === 'image' && (
                                            projectReferenceImages.length > 0 ? (
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {projectReferenceImages.slice(0, 8).map((item) => {
                                                        const isDisabled = !canAddMoreImages;
                                                        return (
                                                            <button key={item.id} type="button" onClick={() => handleApplyProjectReference(item)} disabled={isDisabled} className={`overflow-hidden rounded-lg border text-left transition-all ${isDisabled ? 'cursor-not-allowed border-violet-200 bg-violet-50/70 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm'}`} title={item.label}>
                                                                <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                                <div className="px-1.5 py-1">
                                                                    <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                                                    <div className="text-[9px] text-violet-600">{isDisabled ? '已达上限' : usesReferenceImages ? '加入参考' : `加入${addImageType === 'last_frame' ? '尾帧' : '首帧'}`}</div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">项目里还没有可用的参考图片</div>
                                            )
                                        )}

                                        {activeResourceTab === 'video' && (
                                            projectVideoLibrary.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {projectVideoLibrary.slice(0, 8).map((item) => {
                                                        const isDisabled = !canAddMoreVideos;
                                                        return (
                                                            <button key={item.id} type="button" onClick={() => handleApplyProjectMediaReference(item)} disabled={isDisabled} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isDisabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'}`}>
                                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><Film size={15} /></div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-[11px] font-medium text-slate-700">{item.prompt || '项目视频素材'}</div>
                                                                    <div className="text-[10px] text-slate-400">{isDisabled ? '视频参考已达上限' : '加入参考视频'}</div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">当前项目还没有可复用的视频素材</div>
                                            )
                                        )}

                                        {activeResourceTab === 'audio' && (
                                            projectAudioLibrary.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {projectAudioLibrary.slice(0, 8).map((item) => {
                                                        const isDisabled = !canAddMoreAudios;
                                                        return (
                                                            <button key={item.id} type="button" onClick={() => handleApplyProjectMediaReference(item)} disabled={isDisabled} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isDisabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'}`}>
                                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Volume2 size={15} /></div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-[11px] font-medium text-slate-700">{item.prompt || '项目音频素材'}</div>
                                                                    <div className="text-[10px] text-slate-400">{isDisabled ? '音频参考已达上限' : '加入参考音频'}</div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">当前项目还没有可复用的音频素材</div>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Task Recovery */}
                    <GeneratorRecoveryTaskCard
                        isOpen={showRecoveryPanel}
                        taskId={recoveryTaskId}
                        isGenerating={isGenerating}
                        isRecovering={isRecovering}
                        onToggle={() => { const next = !showRecoveryPanel; closeAllMenus(); setShowRecoveryPanel(next); }}
                        onTaskIdChange={setRecoveryTaskId}
                        onRecover={() => void handleRecoverTask()}
                    />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Generate button */}
                    <GeneratorSubmitButton
                        disabled={!canGenerate}
                        busy={isGenerating || isReferenceUploadBusy}
                        label={statusState.buttonLabel}
                        busyLabel={isReferenceUploadBusy ? '上传中' : undefined}
                        onClick={() => canGenerate && handleGenerate()}
                    />
                </div>
            </div>
        </div>
    );
}
