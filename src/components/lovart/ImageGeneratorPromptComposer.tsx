import React from 'react';
import {
    GeneratorReferenceStack,
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
    return (
        <div className="p-3 pb-2">
            <div className="relative">
                <div className="canvas-settings-input rounded-2xl shadow-sm">
                    <div className="relative px-3 py-2.5">
                        <textarea
                            ref={promptInputRef}
                            value={prompt}
                            onChange={onPromptChange}
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
                            className="w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-[var(--canvas-text-primary)] outline-none placeholder:text-[var(--canvas-text-tertiary)]"
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
                        suggestions={mentionSuggestions.map((mention) => ({
                            id: mention.id,
                            name: mention.name,
                            label: mention.label,
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