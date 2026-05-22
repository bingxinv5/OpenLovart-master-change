import React from 'react';
import {
    GeneratorReferenceStack,
    GeneratorPromptInlineMentionLayer,
    MentionComposerSuggestions,
    type GeneratorReferencePreviewItem,
} from './generator-panel-sections';
import type { PromptReferenceMention } from './generator-mention-view-model';
import type { TextareaMentionQuery } from './textarea-mention-utils';
import { ImageAddReferenceMenu } from './ImageGeneratorPanelSettings';

interface ImageGeneratorPromptComposerProps {
    promptInputRef: React.RefObject<HTMLTextAreaElement | null>;
    prompt: string;
    isGenerating: boolean;
    referencePreviewItems: GeneratorReferencePreviewItem[];
    canAddMoreImages: boolean;
    confirmClear: boolean;
    showAddImageMenu: boolean;
    mentionQuery: TextareaMentionQuery | null;
    mentionSuggestions: PromptReferenceMention[];
    mentionActiveIndex: number;
    referencedMentions: PromptReferenceMention[];
    hasPromptReferenceMentions: boolean;
    onPromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onPromptKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onPromptSelectionChange: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
    onPromptCompositionStart: () => void;
    onPromptCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement>) => void;
    onPromptBlur: () => void;
    onToggleAddImageMenu: () => void;
    onClearReferences: () => void;
    onRemoveReferenceImage: (index: number) => void;
    onUploadImage: () => void;
    onSelectFromCanvas: () => void;
    onApplyMention: (mention: PromptReferenceMention) => void;
}

export function ImageGeneratorPromptComposer({
    promptInputRef,
    prompt,
    isGenerating,
    referencePreviewItems,
    canAddMoreImages,
    confirmClear,
    showAddImageMenu,
    mentionQuery,
    mentionSuggestions,
    mentionActiveIndex,
    referencedMentions,
    hasPromptReferenceMentions,
    onPromptChange,
    onPromptKeyDown,
    onPromptSelectionChange,
    onPromptCompositionStart,
    onPromptCompositionEnd,
    onPromptBlur,
    onToggleAddImageMenu,
    onClearReferences,
    onRemoveReferenceImage,
    onUploadImage,
    onSelectFromCanvas,
    onApplyMention,
}: ImageGeneratorPromptComposerProps) {
    const promptOverlayRef = React.useRef<HTMLDivElement>(null);
    const hasInlineMentions = referencedMentions.length > 0;

    return (
        <div className="p-3 pb-2">
            <div className="relative">
                <div className="canvas-settings-input rounded-2xl shadow-sm">
                    <div className="relative px-3 py-2.5">
                        <GeneratorPromptInlineMentionLayer
                            prompt={prompt}
                            mentions={referencedMentions.map((mention) => ({
                                id: mention.id,
                                name: mention.name,
                                label: mention.label,
                                token: mention.token,
                                replacement: mention.replacement,
                                searchText: mention.searchText,
                                kind: 'image' as const,
                                previewImage: mention.image,
                            }))}
                            scrollContainerRef={promptOverlayRef}
                        />
                        <textarea
                            ref={promptInputRef}
                            value={prompt}
                            onChange={onPromptChange}
                            onScroll={(event) => {
                                if (promptOverlayRef.current) {
                                    promptOverlayRef.current.scrollTop = event.currentTarget.scrollTop;
                                }
                            }}
                            onKeyDown={onPromptKeyDown}
                            onKeyUp={onPromptSelectionChange}
                            onSelect={onPromptSelectionChange}
                            onClick={onPromptSelectionChange}
                            onFocus={onPromptSelectionChange}
                            readOnly={isGenerating}
                            spellCheck={false}
                            rows={2}
                            role="textbox"
                            aria-multiline="true"
                            aria-label="描述你想要生成的图片"
                            placeholder="描述图片内容，输入 @ 引用参考图..."
                            onCompositionStart={onPromptCompositionStart}
                            onCompositionEnd={onPromptCompositionEnd}
                            onBlur={onPromptBlur}
                            className={`relative z-10 w-full resize-none overflow-hidden bg-transparent text-sm leading-6 outline-none placeholder:text-[var(--canvas-text-tertiary)] ${hasInlineMentions ? 'text-transparent caret-[var(--canvas-text-primary)]' : 'text-[var(--canvas-text-primary)]'}`}
                            disabled={isGenerating}
                        />
                    </div>

                    <GeneratorReferenceStack
                        items={referencePreviewItems}
                        canAddMore={canAddMoreImages}
                        addButtonTitle="添加参考图"
                        confirmClear={confirmClear}
                        clearTitle="清空参考图"
                        testId="image-generator-reference-count"
                        onAdd={onToggleAddImageMenu}
                        onClear={onClearReferences}
                        onRemove={(_item, index) => onRemoveReferenceImage(index)}
                    />
                </div>

                <ImageAddReferenceMenu
                    isOpen={showAddImageMenu}
                    canAddMoreImages={canAddMoreImages}
                    onUploadImage={onUploadImage}
                    onSelectFromCanvas={onSelectFromCanvas}
                />

                {mentionQuery && (
                    <MentionComposerSuggestions
                        title="可引用的参考图"
                        activeIndex={mentionActiveIndex}
                        suggestions={mentionSuggestions.map((mention) => ({
                            id: mention.id,
                            name: mention.name,
                            label: mention.label,
                            token: mention.token,
                            kind: 'image' as const,
                            previewImage: mention.image,
                        }))}
                        emptyText={hasPromptReferenceMentions ? '没有匹配的参考图，请继续输入或调整关键词' : '先添加参考图，再输入 @ 进行引用'}
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