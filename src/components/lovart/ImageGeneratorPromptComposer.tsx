import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
    GeneratorReferenceStack,
    MentionComposerSuggestions,
    type GeneratorReferencePreviewItem,
} from './generator-panel-sections';
import type { PromptReferenceMention } from './generator-mention-view-model';
import type { TextareaMentionQuery } from './textarea-mention-utils';
import { ImageAddReferenceMenu } from './ImageGeneratorPanelSettings';
import {
    GeneratorPromptMentionEditor,
    type PromptMentionEditorContext,
    type PromptMentionEditorHandle,
} from './GeneratorPromptMentionEditor';

interface ImageGeneratorPromptComposerProps {
    promptInputRef: React.RefObject<PromptMentionEditorHandle | null>;
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
    onPromptChange: (value: string, selection: { start: number; end: number }) => void;
    onPromptKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onPromptSelectionChange: (selection: { start: number; end: number }) => void;
    onPromptCompositionStart: () => void;
    onPromptCompositionEnd: (event: React.CompositionEvent<HTMLDivElement>, context: PromptMentionEditorContext) => void;
    onPromptBlur: () => void;
    onToggleAddImageMenu: () => void;
    onClearReferences: () => void;
    onRemoveReferenceImage: (index: number) => void;
    onUploadImage: () => void;
    onSelectFromCanvas: () => void;
    onApplyMention: (mention: PromptReferenceMention) => void;
    isPromptExpanded: boolean;
    onExpandPrompt: () => void;
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
    isPromptExpanded,
    onExpandPrompt,
}: ImageGeneratorPromptComposerProps) {
    const mentionAnchorRef = React.useRef<HTMLDivElement>(null);

    return (
        <div className={`p-3 pb-2 ${isPromptExpanded ? 'generator-prompt-expanded' : ''}`}>
            <div ref={mentionAnchorRef} className="relative">
                <div className="canvas-settings-input rounded-2xl shadow-sm">
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
                                kind: 'image' as const,
                                previewImage: mention.image,
                            }))}
                            onChange={onPromptChange}
                            onKeyDown={onPromptKeyDown}
                            readOnly={isGenerating}
                            onSelectionChange={onPromptSelectionChange}
                            ariaLabel="描述你想要生成的图片"
                            placeholder="描述图片内容，输入 @ 引用参考图..."
                            onCompositionStart={onPromptCompositionStart}
                            onCompositionEnd={onPromptCompositionEnd}
                            onBlur={onPromptBlur}
                            className={`text-[var(--canvas-text-primary)] caret-[var(--canvas-text-primary)] ${isPromptExpanded ? '!min-h-[66vh] !max-h-[calc(100vh-176px)] resize-y' : ''}`}
                        />
                        <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={onExpandPrompt}
                            className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--canvas-border)] bg-[var(--canvas-surface-elevated)]/90 text-[var(--canvas-text-tertiary)] opacity-70 shadow-sm backdrop-blur transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-primary)] hover:opacity-100"
                            title={isPromptExpanded ? '收起提示词编辑' : '放大编辑提示词'}
                            aria-label={isPromptExpanded ? '收起提示词编辑' : '放大编辑提示词'}
                        >
                            {isPromptExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        </button>
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
                        portal={isPromptExpanded}
                        portalAnchorRef={mentionAnchorRef}
                    />
                )}
            </div>
        </div>
    );
}