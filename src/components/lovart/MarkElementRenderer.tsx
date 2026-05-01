import React from 'react';
import { MapPin, Send, Wand2 } from 'lucide-react';
import type { CanvasElement } from './canvas-types';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';
import { sanitizeElementCssColor } from './canvas-element-style-utils';
import type { ElementHandlers } from './CanvasElementRenderer';

interface MarkElementRendererProps {
    el: CanvasElement;
    isEditingMark: boolean;
    isQuickEditing: boolean;
    quickEditPrompt: string;
    markTargetHasContent: boolean;
    handlersRef: React.RefObject<ElementHandlers>;
}

export function MarkElementRenderer({
    el,
    isEditingMark,
    isQuickEditing,
    quickEditPrompt,
    markTargetHasContent,
    handlersRef,
}: MarkElementRendererProps) {
    const h = handlersRef.current!;
    const markColorClassName = buildFloatingPanelPositionClassName('canvas-mark-color', el.id);
    const markColorCss = `.${markColorClassName} { color: ${sanitizeElementCssColor(el.color, '#EF4444')}; }`;

    return (
        <div className="w-full h-full relative overflow-visible">
            <style>{markColorCss}</style>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)] flex items-start gap-0.5">
                <div className="relative">
                    <MapPin size={32} fill={el.color || '#EF4444'} color="white" strokeWidth={1.5} />
                    <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                        <span className={`${markColorClassName} text-[9px] font-bold`}>{el.markNumber || '?'}</span>
                    </div>
                </div>
                {markTargetHasContent && !isQuickEditing && (
                    <button
                        className="mt-0.5 w-6 h-6 rounded-md bg-white border border-gray-200 shadow-md flex items-center justify-center hover:bg-purple-50 hover:border-purple-300 transition-all cursor-pointer"
                        title="快速编辑此图片"
                        onMouseDown={(event) => {
                            event.stopPropagation();
                            h.setQuickEditMarkId(el.id);
                            h.setQuickEditPrompt('');
                        }}
                    >
                        <Wand2 size={13} className="text-purple-500" />
                    </button>
                )}
            </div>

            {isQuickEditing && el.markTargetId && (
                <div className="absolute top-9 left-1/2 -translate-x-1/2 z-30 min-w-[240px]" onMouseDown={(event) => event.stopPropagation()}>
                    <div className="bg-white border border-purple-200 rounded-xl shadow-xl p-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 px-1">
                            <Wand2 size={12} className="text-purple-500 flex-shrink-0" />
                            <span className="text-[10px] text-purple-600 font-medium">AI 快速编辑</span>
                            <span className="text-[9px] text-gray-300 ml-auto">标记#{el.markNumber}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <input
                                autoFocus
                                type="text"
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-purple-400 focus:bg-white transition-colors min-w-[180px]"
                                placeholder="输入编辑指令，如：把这里改成蓝色"
                                value={quickEditPrompt}
                                onChange={(event) => h.setQuickEditPrompt(event.target.value)}
                                onKeyDown={(event) => {
                                    event.stopPropagation();
                                    if (event.key === 'Enter' && quickEditPrompt.trim()) {
                                        h.handleQuickEditSubmit(el);
                                    }
                                    if (event.key === 'Escape') {
                                        h.setQuickEditMarkId(null);
                                        h.setQuickEditPrompt('');
                                    }
                                }}
                            />
                            <button
                                className={`p-1.5 rounded-lg transition-all ${quickEditPrompt.trim() ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-sm' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                                title="提交快速编辑"
                                aria-label="提交快速编辑"
                                disabled={!quickEditPrompt.trim()}
                                onMouseDown={(event) => {
                                    event.stopPropagation();
                                    if (quickEditPrompt.trim()) h.handleQuickEditSubmit(el);
                                }}
                            >
                                <Send size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isQuickEditing && (isEditingMark || el.markText) && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 min-w-[120px]">
                    {isEditingMark ? (
                        <input
                            autoFocus
                            type="text"
                            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs shadow-lg outline-none focus:border-blue-500 w-full min-w-[150px]"
                            placeholder="输入标记备注..."
                            value={el.markText || ''}
                            onChange={(event) => h.onElementChange(el.id, { markText: event.target.value })}
                            onBlur={() => h.setEditingMarkId(null)}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === 'Enter') h.setEditingMarkId(null);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                        />
                    ) : (
                        <div className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap max-w-[200px] truncate">
                            {el.markText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
