import React from 'react';
import {
    GeneratorReferenceStack,
    MentionComposerSuggestions,
    type GeneratorReferencePreviewItem,
} from './generator-panel-sections';
import type { PromptMention, PromptMentionQuery } from './generator-reference-view-model';
import { VideoAddReferenceMenu, type VideoAddImageType } from './VideoGeneratorPanelSettings';

interface VideoGeneratorPromptComposerProps {
    promptInputRef: React.RefObject<HTMLTextAreaElement | null>;
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
    onPromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onPromptKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onPromptSelectionChange: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
    onPromptCompositionStart: () => void;
    onPromptCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement>) => void;
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
                        <textarea
                            ref={promptInputRef}
                            value={prompt}
                            readOnly={isGenerating}
                            spellCheck={false}
                            rows={2}
                            role="textbox"
                            aria-multiline="true"
                            aria-label="描述你想要生成的视频"
                            placeholder={placeholder}
                            onChange={onPromptChange}
                            onKeyDown={onPromptKeyDown}
                            onKeyUp={onPromptSelectionChange}
                            onSelect={onPromptSelectionChange}
                            onClick={onPromptSelectionChange}
                            onFocus={onPromptSelectionChange}
                            onCompositionStart={onPromptCompositionStart}
                            onCompositionEnd={onPromptCompositionEnd}
                            onBlur={onPromptBlur}
                            className="w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400/60"
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
                        suggestions={mentionSuggestions.map((mention) => ({
                            id: mention.id,
                            name: mention.name,
                            label: mention.label,
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