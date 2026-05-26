import React from 'react';
import {
    GeneratorReferenceStack,
    MentionComposerSuggestions,
    type GeneratorReferencePreviewItem,
} from './generator-panel-sections';
import type { PromptMention, PromptMentionQuery } from './generator-reference-view-model';
import { VideoAddReferenceMenu, type VideoAddImageType } from './VideoGeneratorPanelSettings';
import {
    GeneratorPromptMentionEditor,
    type PromptMentionEditorContext,
    type PromptMentionEditorHandle,
} from './GeneratorPromptMentionEditor';

interface VideoGeneratorPromptComposerProps {
    promptInputRef: React.RefObject<PromptMentionEditorHandle | null>;
    prompt: string;
    isGenerating: boolean;
    placeholder: string;
    referencePreviewItems: GeneratorReferencePreviewItem[];
    canAddMoreReferences: boolean;
    isReferenceUploadBusy: boolean;
    addButtonTitle: string;
    confirmClear: boolean;
    showAddImageMenu: boolean;
    usesFrameImages: boolean;
    availableImageTypes: Array<{ value: VideoAddImageType; label: string }>;
    addImageType: VideoAddImageType;
    canAddMoreImages: boolean;
    canAddMoreVideos: boolean;
    canAddMoreAudios: boolean;
    isDomesticOmniMode: boolean;
    usesReferenceImages: boolean;
    mentionQuery: PromptMentionQuery | null;
    mentionPanelTitle: string;
    mentionEmptyState: string;
    mentionSuggestions: PromptMention[];
    mentionActiveIndex: number;
    referencedMentions: PromptMention[];
    onPromptChange: (value: string, selection: { start: number; end: number }) => void;
    onPromptKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onPromptSelectionChange: (selection: { start: number; end: number }) => void;
    onPromptCompositionStart: () => void;
    onPromptCompositionEnd: (event: React.CompositionEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onPromptBlur: () => void;
    onToggleAddImageMenu: () => void;
    onClearReferences: () => void;
    onRemoveReferenceItem: (item: GeneratorReferencePreviewItem) => void;
    onAddImageTypeChange: (value: VideoAddImageType) => void;
    onUploadImage: () => void;
    onUploadVideo: () => void;
    onUploadAudio: () => void;
    onSelectFromCanvas: (imageType: VideoAddImageType) => void;
    onApplyMention: (mention: PromptMention) => void;
}

export function VideoGeneratorPromptComposer({
    promptInputRef,
    prompt,
    isGenerating,
    placeholder,
    referencePreviewItems,
    canAddMoreReferences,
    isReferenceUploadBusy,
    addButtonTitle,
    confirmClear,
    showAddImageMenu,
    usesFrameImages,
    availableImageTypes,
    addImageType,
    canAddMoreImages,
    canAddMoreVideos,
    canAddMoreAudios,
    isDomesticOmniMode,
    usesReferenceImages,
    mentionQuery,
    mentionPanelTitle,
    mentionEmptyState,
    mentionSuggestions,
    mentionActiveIndex,
    referencedMentions,
    onPromptChange,
    onPromptKeyDown,
    onPromptSelectionChange,
    onPromptCompositionStart,
    onPromptCompositionEnd,
    onPromptBlur,
    onToggleAddImageMenu,
    onClearReferences,
    onRemoveReferenceItem,
    onAddImageTypeChange,
    onUploadImage,
    onUploadVideo,
    onUploadAudio,
    onSelectFromCanvas,
    onApplyMention,
}: VideoGeneratorPromptComposerProps) {
    return (
        <div className="p-3 pb-2">
            <div className="relative">
                <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                    <div className="relative px-3 py-2.5">
                        <GeneratorPromptMentionEditor
                            ref={promptInputRef}
                            value={prompt}
                            mentions={referencedMentions.map((mention) => ({
                                id: mention.id,
                                name: mention.name,
                                label: mention.label,
                                token: mention.token,
                                replacement: mention.replacement,
                                searchText: mention.searchText,
                                kind: mention.kind,
                                previewImage: mention.previewImage,
                            }))}
                            readOnly={isGenerating}
                            ariaLabel="描述你想要生成的视频"
                            placeholder={placeholder}
                            onChange={onPromptChange}
                            onKeyDown={onPromptKeyDown}
                            onSelectionChange={onPromptSelectionChange}
                            onCompositionStart={onPromptCompositionStart}
                            onCompositionEnd={onPromptCompositionEnd}
                            onBlur={onPromptBlur}
                            className="text-slate-700 caret-[var(--canvas-text-primary)]"
                            placeholderClassName="text-slate-400/60"
                        />
                    </div>

                    <GeneratorReferenceStack
                        items={referencePreviewItems}
                        canAddMore={canAddMoreReferences}
                        isAddBusy={isReferenceUploadBusy}
                        addButtonTitle={addButtonTitle}
                        confirmClear={confirmClear}
                        clearTitle="清空素材"
                        onAdd={onToggleAddImageMenu}
                        onClear={onClearReferences}
                        onRemove={(item) => onRemoveReferenceItem(item)}
                    />
                </div>

                <VideoAddReferenceMenu
                    isOpen={showAddImageMenu}
                    usesFrameImages={usesFrameImages}
                    availableImageTypes={availableImageTypes}
                    addImageType={addImageType}
                    canAddMoreImages={canAddMoreImages}
                    canAddMoreVideos={canAddMoreVideos}
                    canAddMoreAudios={canAddMoreAudios}
                    isDomesticOmniMode={isDomesticOmniMode}
                    usesReferenceImages={usesReferenceImages}
                    onAddImageTypeChange={onAddImageTypeChange}
                    onUploadImage={onUploadImage}
                    onUploadVideo={onUploadVideo}
                    onUploadAudio={onUploadAudio}
                    onSelectFromCanvas={onSelectFromCanvas}
                />

                {mentionQuery && (
                    <MentionComposerSuggestions
                        title={mentionPanelTitle}
                        activeIndex={mentionActiveIndex}
                        suggestions={mentionSuggestions.map((mention) => ({
                            id: mention.id,
                            name: mention.name,
                            label: mention.label,
                            token: mention.token,
                            kind: mention.kind,
                            previewImage: mention.previewImage,
                        }))}
                        emptyText={mentionEmptyState}
                        onApply={(item) => {
                            const mention = mentionSuggestions.find((candidate) => candidate.id === item.id);
                            if (mention) onApplyMention(mention);
                        }}
                    />
                )}
            </div>
        </div>
    );
}