'use client';

import React from 'react';
import {
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  MapPin,
  Maximize2,
  Paperclip,
  Sparkles,
  StopCircle,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';
import { aiModels, quickCommands } from './ai-designer-panel-constants';
import type { ChatAttachment, MentionItem } from './ai-designer-panel-types';

type CanvasImageItem = {
  id: string;
  content: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

type CanvasMark = {
  id: string;
  markNumber: number;
  markText?: string;
  x: number;
  y: number;
  targetImageContent?: string;
};

type AiDesignerInputAreaProps = {
  inputValue: string;
  attachments: ChatAttachment[];
  webSearchEnabled: boolean;
  selectedModel: string;
  showCanvasImagesMenu: boolean;
  showMentionMenu: boolean;
  mentionSuggestions: MentionItem[];
  mentionMenuTitle: string;
  mentionMenuEmptyText: string;
  showQuickMenu: boolean;
  showMarksMenu: boolean;
  showModelMenu: boolean;
  isStreaming: boolean;
  isGenerating: boolean;
  canvasImages?: CanvasImageItem[];
  marks?: CanvasMark[];
  onPickFromCanvas?: () => void;
  onDeleteMark?: (id: string) => void;
  onClearAllMarks?: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  quickMenuRef: React.RefObject<HTMLDivElement | null>;
  modelMenuRef: React.RefObject<HTMLDivElement | null>;
  mentionRef: React.RefObject<HTMLDivElement | null>;
  canvasImagesMenuRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onInputSelectionChange: (selection: { start: number; end: number }, value?: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent) => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (id: string) => void;
  onToggleCanvasImagesMenu: () => void;
  onAddCanvasImageAttachment: (image: CanvasImageItem, index: number) => void;
  onToggleMentionMenu: () => void;
  onMentionSelect: (insert: string) => void;
  onToggleQuickMenu: () => void;
  onQuickCommand: (prompt: string) => void;
  onToggleWebSearch: () => void;
  onToggleMarksMenu: () => void;
  onReferenceMark: (mark: CanvasMark) => void;
  onReferenceAllMarks: () => void;
  onToggleModelMenu: () => void;
  onSelectModel: (modelId: string) => void;
  onStop: () => void;
  onSend: () => void;
};

export function AiDesignerInputArea({
  inputValue,
  attachments,
  webSearchEnabled,
  selectedModel,
  showCanvasImagesMenu,
  showMentionMenu,
  mentionSuggestions,
  mentionMenuTitle,
  mentionMenuEmptyText,
  showQuickMenu,
  showMarksMenu,
  showModelMenu,
  isStreaming,
  isGenerating,
  canvasImages,
  marks,
  onPickFromCanvas,
  onDeleteMark,
  onClearAllMarks,
  fileInputRef,
  textareaRef,
  quickMenuRef,
  modelMenuRef,
  mentionRef,
  canvasImagesMenuRef,
  onInputChange,
  onInputSelectionChange,
  onKeyDown,
  onPaste,
  onFileSelect,
  onRemoveAttachment,
  onToggleCanvasImagesMenu,
  onAddCanvasImageAttachment,
  onToggleMentionMenu,
  onMentionSelect,
  onToggleQuickMenu,
  onQuickCommand,
  onToggleWebSearch,
  onToggleMarksMenu,
  onReferenceMark,
  onReferenceAllMarks,
  onToggleModelMenu,
  onSelectModel,
  onStop,
  onSend,
}: AiDesignerInputAreaProps) {
  const syncSelectionFromInput = (textarea: HTMLTextAreaElement) => {
    onInputSelectionChange({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? (textarea.selectionStart ?? 0),
    }, textarea.value);
  };

  return (
    <div className="p-4 pt-2">
      <div className="canvas-ai-input-shell relative rounded-2xl transition-all">
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="relative group">
                <WorkbenchImage
                  content={attachment.dataUrl}
                  alt={attachment.name}
                  containerClassName="w-14 h-14 rounded-lg"
                  imageClassName="rounded-lg"
                  fit="cover"
                  showSurface={false}
                />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveAttachment(attachment.id);
                  }}
                  title={`移除附件 ${attachment.name}`}
                  aria-label={`移除附件 ${attachment.name}`}
                  className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-100 hover:scale-110 transition-transform shadow-sm"
                >
                  <XCircle size={12} />
                </button>
                <p className="text-[9px] text-[var(--canvas-text-tertiary)] mt-0.5 truncate w-14 text-center">{attachment.name}</p>
              </div>
            ))}
            {attachments.length < 4 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                title="继续添加图片"
                aria-label="继续添加图片"
                className="canvas-reference-add-button w-14 h-14 rounded-lg border-2 flex items-center justify-center transition-colors"
              >
                <ImageIcon size={18} />
              </button>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(event) => {
            onInputChange(event.target.value);
            syncSelectionFromInput(event.target);
          }}
          placeholder={webSearchEnabled ? '输入关键词，AI 将联网搜索后回答...' : '请输入你的设计需求'}
          className="w-full min-h-[60px] max-h-[120px] p-4 pb-2 resize-none outline-none text-[var(--canvas-text-primary)] placeholder:text-[var(--canvas-text-tertiary)] bg-transparent rounded-t-2xl text-sm"
          onKeyDown={onKeyDown}
          onKeyUp={(event) => syncSelectionFromInput(event.currentTarget)}
          onSelect={(event) => syncSelectionFromInput(event.currentTarget)}
          onClick={(event) => syncSelectionFromInput(event.currentTarget)}
          onFocus={(event) => syncSelectionFromInput(event.currentTarget)}
          onPaste={onPaste}
          rows={1}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="上传参考图片"
          onChange={onFileSelect}
        />

        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--canvas-border)]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`canvas-control-button p-2 rounded-full transition-colors ${attachments.length > 0 ? 'bg-[var(--accent-primary-soft)] text-blue-500' : ''}`}
              title="上传图片（最多4张）"
            >
              <Paperclip size={16} />
            </button>

            <div ref={canvasImagesMenuRef} className="relative">
              <button
                onClick={onToggleCanvasImagesMenu}
                className={`canvas-control-button p-2 rounded-full transition-colors ${showCanvasImagesMenu ? 'bg-[var(--accent-primary-soft)] text-purple-500' : canvasImages && canvasImages.length > 0 ? '' : 'cursor-not-allowed opacity-45'}`}
                title={canvasImages && canvasImages.length > 0 ? '引用画布中的图片' : '画布上还没有图片'}
                disabled={!canvasImages || canvasImages.length === 0}
              >
                <ImageIcon size={16} />
              </button>
              {showCanvasImagesMenu && canvasImages && canvasImages.length > 0 && (
                <div className="canvas-popover absolute bottom-full mb-2 left-0 w-72 rounded-xl z-50 max-h-80 overflow-y-auto">
                  <div className="p-2">
                    <p className="text-xs text-[var(--canvas-text-tertiary)] px-2 py-1 font-medium">🖼 画布图片</p>
                    <div className="grid grid-cols-3 gap-2 p-1">
                      {canvasImages.map((image, index) => (
                        <button
                          key={image.id}
                          onClick={() => onAddCanvasImageAttachment(image, index)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${attachments.some((attachment) => attachment.id === `canvas-${image.id}`) ? 'border-purple-500 ring-2 ring-purple-300/30' : 'border-[var(--canvas-border)] hover:border-purple-300'}`}
                          title={`添加画布图片 ${index + 1} 到对话`}
                        >
                          <WorkbenchImage
                            content={image.content}
                            alt={`Canvas image ${index + 1}`}
                            containerClassName="w-full h-full rounded-md"
                            imageClassName="rounded-md"
                            fit="cover"
                            showSurface={false}
                          />
                          {attachments.some((attachment) => attachment.id === `canvas-${image.id}`) && (
                            <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                              <Check size={16} className="text-purple-600" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-[var(--canvas-text-tertiary)] px-2 pt-1 mt-1 border-t border-[var(--canvas-border)]">
                      点击图片将其添加为附件（最多 4 张）
                    </p>
                    {onPickFromCanvas && (
                      <button
                        onClick={onPickFromCanvas}
                        className="canvas-menu-item w-full text-left px-3 py-2 text-sm text-purple-600 rounded-lg transition-colors font-medium mt-1 flex items-center gap-2"
                      >
                        <Maximize2 size={12} />
                        从画布中选择
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div ref={mentionRef} className="relative">
              <button
                onMouseDown={(event) => event.preventDefault()}
                onClick={onToggleMentionMenu}
                className={`canvas-control-button p-2 rounded-full transition-colors ${showMentionMenu ? 'bg-[var(--accent-primary-soft)] text-blue-500' : ''}`}
                title="@ 提及工具"
              >
                <AtSign size={16} />
              </button>
              {showMentionMenu && (
                <div className="canvas-popover absolute bottom-full mb-2 left-0 w-60 rounded-xl z-50 max-h-80 overflow-y-auto">
                  <div className="p-2">
                    <p className="text-xs text-[var(--canvas-text-tertiary)] px-2 py-1 font-medium">{mentionMenuTitle}</p>
                    {mentionSuggestions.length > 0 ? mentionSuggestions.map((item) => (
                      <button
                        key={item.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onMentionSelect(item.insert)}
                        className="canvas-menu-item w-full text-left px-3 py-2 rounded-lg transition-colors"
                      >
                        <span className="text-sm text-[var(--canvas-text-primary)]">{item.label}</span>
                        <p className="text-[11px] text-[var(--canvas-text-tertiary)] mt-0.5">{item.description}</p>
                      </button>
                    )) : (
                      <div className="px-3 py-4 text-[12px] text-[var(--canvas-text-tertiary)]">
                        {mentionMenuEmptyText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[var(--canvas-surface-muted)] rounded-full p-0.5 border border-[var(--canvas-border)] relative">
              <div ref={quickMenuRef} className="relative">
                <button
                  onClick={onToggleQuickMenu}
                  className={`canvas-control-button p-1.5 rounded-full transition-all ${showQuickMenu ? 'bg-[var(--canvas-warning-surface)] text-orange-500' : ''}`}
                  title="快捷指令"
                >
                  <Zap size={14} />
                </button>
                {showQuickMenu && (
                  <div className="canvas-popover absolute bottom-full mb-2 right-0 w-56 rounded-xl z-50">
                    <div className="p-2">
                      <p className="text-xs text-[var(--canvas-text-tertiary)] px-2 py-1 font-medium">⚡ 快捷指令</p>
                      {quickCommands.map((command, index) => (
                        <button
                          key={index}
                          onClick={() => onQuickCommand(command.prompt)}
                          className="canvas-menu-item w-full text-left px-3 py-2 text-sm rounded-lg transition-colors"
                        >
                          {command.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={onToggleWebSearch}
                className={`canvas-control-button p-1.5 rounded-full transition-all ${webSearchEnabled ? 'bg-[var(--canvas-success-surface)] text-green-600 ring-1 ring-[var(--canvas-success-border)]' : ''}`}
                title={webSearchEnabled ? '已开启联网搜索' : '开启联网搜索'}
              >
                <Globe size={14} />
              </button>

              <div className="relative">
                <button
                  onClick={onToggleMarksMenu}
                  className={`canvas-control-button p-1.5 rounded-full transition-all ${showMarksMenu ? 'bg-[var(--canvas-danger-surface)] text-red-500' : marks && marks.length > 0 ? 'text-red-400' : 'cursor-not-allowed opacity-45'}`}
                  title={marks && marks.length > 0 ? '引用画布标记' : '画布上还没有标记'}
                  disabled={!marks || marks.length === 0}
                >
                  <MapPin size={14} />
                </button>
                {showMarksMenu && marks && marks.length > 0 && (
                  <div className="canvas-popover absolute bottom-full mb-2 right-0 w-56 rounded-xl z-50 max-h-60 overflow-y-auto">
                    <div className="p-2">
                      <p className="text-xs text-[var(--canvas-text-tertiary)] px-2 py-1 font-medium">📍 画布标记</p>
                      {marks.map((mark) => (
                        <div key={mark.id} className="flex items-center gap-1 group">
                          <button
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onReferenceMark(mark)}
                            className="canvas-menu-item flex-1 text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2"
                          >
                            <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold flex-shrink-0">{mark.markNumber}</span>
                            {mark.targetImageContent ? (
                              <WorkbenchImage content={mark.targetImageContent} alt="" containerClassName="w-6 h-6 rounded flex-shrink-0" imageClassName="rounded" fit="cover" showSurface={false} />
                            ) : null}
                            <span className="truncate">{mark.markText || `标记 #${mark.markNumber}`}</span>
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteMark?.(mark.id);
                            }}
                            className="canvas-inline-action is-danger p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                            title="删除此标记"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <div className="canvas-menu-separator h-px my-1" />
                      <button
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={onReferenceAllMarks}
                        className="canvas-menu-item w-full text-left px-3 py-2 text-sm text-blue-600 rounded-lg transition-colors font-medium"
                      >
                        引用所有标记
                      </button>
                      <button
                        onClick={onClearAllMarks}
                        className="canvas-menu-item w-full text-left px-3 py-2 text-sm text-red-500 rounded-lg transition-colors font-medium"
                      >
                        清除所有标记
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isStreaming ? (
              <button
                onClick={onStop}
                className="p-2 bg-red-500 text-white hover:bg-red-600 rounded-full transition-all shadow-md"
                title="停止生成"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={(!inputValue.trim() && attachments.length === 0) || isGenerating}
                className={`p-2 rounded-full transition-all ${(inputValue.trim() || attachments.length > 0) && !isGenerating
                  ? 'bg-[var(--canvas-active-surface)] text-[var(--canvas-active-text)] hover:opacity-90 shadow-md'
                  : 'bg-[var(--canvas-hover)] text-[var(--canvas-text-tertiary)] cursor-not-allowed'
                }`}
                title="发送"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="canvas-ai-bottom-meta flex items-center justify-center gap-1.5 mt-2 text-[10px]">
        <div ref={modelMenuRef} className="relative">
          <button
            onClick={onToggleModelMenu}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full hover:bg-[var(--canvas-hover)] transition-colors group"
          >
            <Sparkles size={10} className={aiModels.find((model) => model.id === selectedModel)?.color || ''} />
            <span className={`font-medium ${aiModels.find((model) => model.id === selectedModel)?.color || 'text-gray-400'}`}>
              {aiModels.find((model) => model.id === selectedModel)?.label || selectedModel}
            </span>
            <ChevronDown size={10} className={`transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
          </button>
          {showModelMenu && (
            <div className="canvas-popover absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 rounded-xl z-50">
              <div className="p-1.5">
                <p className="text-[10px] text-[var(--canvas-text-tertiary)] px-2 py-1 font-medium">切换模型</p>
                {aiModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => onSelectModel(model.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      selectedModel === model.id ? 'canvas-menu-item is-active font-medium' : 'canvas-menu-item'
                    }`}
                  >
                    <div>
                      <span className={`text-xs ${model.color}`}>{model.label}</span>
                      <span className="text-[10px] text-gray-300 ml-1.5">{model.provider}</span>
                    </div>
                    {selectedModel === model.id && <Check size={12} className="text-blue-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {webSearchEnabled && (
          <span className="ml-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded-full text-[9px] font-medium">🌐 联网</span>
        )}
        {attachments.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-medium">📎 {attachments.length}张图</span>
        )}
      </div>
    </div>
  );
}
