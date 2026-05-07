import React from 'react';
import { Download, Frame, MousePointer2, Trash2 } from 'lucide-react';
import { DragNumberInput, StableColorInput } from './canvas-ui-utils';
import type { CanvasElement } from './canvas-types';
import { FrameExportMenu } from './frame-export-menu';
import { FRAME_LAYOUT_ALIGN_LABELS, FRAME_LAYOUT_MODE_LABELS, FrameAutoLayoutControls, FramePresetButton, FramePresetMenu } from './frame-toolbar-controls';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';
import { sanitizeElementCssColor } from './canvas-element-style-utils';
import type { ElementHandlers } from './CanvasElementRenderer';

interface FrameElementRendererProps {
    el: CanvasElement;
    showToolbar: boolean;
    isDropTarget: boolean;
    isEditingFrameName: boolean;
    showFramePresetMenu: boolean;
    showFrameExportMenu: boolean;
    frameChildCount: number;
    handlersRef: React.RefObject<ElementHandlers>;
}

export function FrameElementRenderer({
    el,
    showToolbar,
    isDropTarget,
    isEditingFrameName,
    showFramePresetMenu,
    showFrameExportMenu,
    frameChildCount,
    handlersRef,
}: FrameElementRendererProps) {
    const h = handlersRef.current!;
    const frameColorClassName = buildFloatingPanelPositionClassName('canvas-frame-color', el.id);
    const frameColorCss = `.${frameColorClassName} { background-color: ${sanitizeElementCssColor(el.frameBgColor)}; }`;

    return (
        <div className="w-full h-full relative overflow-visible">
            <style>{frameColorCss}</style>
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 select-none whitespace-nowrap">
                <Frame size={12} className="canvas-frame-meta-label" />
                {isEditingFrameName ? (
                    <input
                        autoFocus
                        type="text"
                        title="编辑画板名称"
                        className="canvas-frame-name-input text-xs font-medium rounded px-1 py-0.5 outline-none min-w-[60px]"
                        value={el.frameName || 'Frame'}
                        onChange={(event) => h.onElementChange(el.id, { frameName: event.target.value })}
                        onBlur={() => h.setEditingFrameName(null)}
                        onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') h.setEditingFrameName(null); }}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                ) : (
                    <span
                        className="canvas-frame-meta-label text-xs font-medium cursor-text hover:opacity-80"
                        onDoubleClick={(event) => { event.stopPropagation(); h.setEditingFrameName(el.id); }}
                    >
                        {el.frameName || 'Frame'}
                    </span>
                )}
                {frameChildCount > 0 && (
                    <span className="canvas-frame-chip canvas-frame-chip-blue text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                        {frameChildCount}
                    </span>
                )}
                {el.groupFrame && (
                    <span className="canvas-frame-chip canvas-frame-chip-violet text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                        编组
                    </span>
                )}
                {el.frameAutoLayout && (
                    <span className="canvas-frame-chip canvas-frame-chip-emerald text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                        {FRAME_LAYOUT_MODE_LABELS[el.frameAutoLayoutMode || 'flow']}
                    </span>
                )}
                {el.frameAutoLayout && (
                    <span className="canvas-frame-chip text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                        {FRAME_LAYOUT_ALIGN_LABELS[el.frameAutoLayoutAlign || 'center']} · {Math.round(el.frameAutoLayoutGap ?? 14)}
                    </span>
                )}
            </div>

            <div
                data-frame-body="true"
                data-testid={`frame-body-${el.id}`}
                className={`${frameColorClassName} w-full h-full border rounded-sm transition-colors ${el.frameClip ? 'overflow-hidden' : 'overflow-visible'} ${
                    isDropTarget
                        ? 'border-blue-500 border-2 shadow-lg shadow-blue-100 dark:shadow-none'
                        : el.groupFrame
                            ? 'border-violet-400 border-2 bg-violet-50/30'
                            : 'border-gray-300'
                }`}
            />

            {isDropTarget && (
                <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-sm pointer-events-none flex items-center justify-center">
                    <div className="bg-blue-500 text-white text-xs px-3 py-1.5 rounded-full shadow-lg font-medium">
                        放入画板
                    </div>
                </div>
            )}

            <div className="canvas-frame-meta-label absolute -top-6 right-0 text-[10px] select-none pointer-events-none opacity-80">
                {Math.round(el.width || 0)} × {Math.round(el.height || 0)}
            </div>

            {showToolbar && (
                <FrameToolbar
                    el={el}
                    showFramePresetMenu={showFramePresetMenu}
                    showFrameExportMenu={showFrameExportMenu}
                    handlersRef={handlersRef}
                />
            )}
        </div>
    );
}

function FrameToolbar({
    el,
    showFramePresetMenu,
    showFrameExportMenu,
    handlersRef,
}: {
    el: CanvasElement;
    showFramePresetMenu: boolean;
    showFrameExportMenu: boolean;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;
    const frameColorClassName = buildFloatingPanelPositionClassName('canvas-frame-toolbar-color', el.id);
    const frameColorCss = `.${frameColorClassName} { background-color: ${sanitizeElementCssColor(el.frameBgColor)}; }`;

    return (
        <div
            className="absolute -top-14 left-1/2 -translate-x-1/2 z-30"
            onMouseDown={(event) => event.stopPropagation()}
            data-testid={`frame-toolbar-${el.id}`}
        >
            <style>{frameColorCss}</style>
            <div className="canvas-inline-toolbar flex items-center rounded-xl px-3 py-2 gap-2">
                <FramePresetButton el={el} showFramePresetMenu={showFramePresetMenu} handlersRef={handlersRef} />
                <div className="canvas-toolbar-separator w-px h-7" />
                <DragNumberInput label="W" value={el.width || 0} onChange={(value) => { h.onElementChange(el.id, { width: value, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <DragNumberInput label="H" value={el.height || 0} onChange={(value) => { h.onElementChange(el.id, { height: value, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <div className="canvas-toolbar-separator w-px h-7" />
                <div className="relative">
                    <div
                        className={`${frameColorClassName} w-8 h-8 rounded-lg border border-[var(--canvas-border)] cursor-pointer relative overflow-hidden hover:ring-2 hover:ring-[var(--canvas-focus-ring)] transition-all`}
                        title="背景颜色"
                    >
                        <StableColorInput
                            value={el.frameBgColor}
                            fallbackValue="#FFFFFF"
                            title="背景颜色"
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            onChange={(value) => h.onElementChange(el.id, { frameBgColor: value })}
                            onMouseDown={(event) => event.stopPropagation()}
                        />
                    </div>
                </div>
                <button
                    className={`canvas-inline-action p-2 rounded-lg transition-colors flex items-center gap-0.5 ${el.frameClip ? 'is-active' : ''}`}
                    onClick={() => h.onElementChange(el.id, { frameClip: !el.frameClip })}
                    title={el.frameClip ? '裁剪已开启' : '裁剪已关闭'}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                </button>
                <FrameAutoLayoutControls el={el} handlersRef={handlersRef} />
                <div className="canvas-toolbar-separator w-px h-7" />
                <button
                    className="canvas-inline-action p-2 rounded-lg transition-colors"
                    onClick={() => {
                        const childIds = h.getElements().filter((child) => child.parentFrameId === el.id).map((child) => child.id);
                        if (childIds.length > 0) h.onSelect(childIds);
                    }}
                    title="选择画板内所有元素"
                >
                    <MousePointer2 size={18} />
                </button>
                <div className="relative">
                    <button
                        className={`canvas-inline-action p-2 rounded-lg transition-colors ${showFrameExportMenu ? 'is-active' : ''}`}
                        onClick={() => { h.setShowFrameExportMenu(showFrameExportMenu ? null : el.id); h.setShowFramePresetMenu(null); }}
                        title="导出"
                    >
                        <Download size={18} />
                        <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" className="absolute -bottom-0.5 right-0.5 opacity-60"><path d="M0 1.5l3 3 3-3H0z"/></svg>
                    </button>
                    {showFrameExportMenu && (
                        <FrameExportMenu el={el} handlersRef={handlersRef} />
                    )}
                </div>
                <button
                    className={`canvas-inline-action p-2 rounded-lg transition-colors ${el.frameLocked ? 'is-warning' : ''}`}
                    onClick={() => h.onElementChange(el.id, { frameLocked: !el.frameLocked })}
                    title={el.frameLocked ? '解锁画板' : '锁定画板'}
                >
                    {el.frameLocked ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    )}
                </button>
                <button
                    className="canvas-inline-action is-danger p-2 rounded-lg transition-colors"
                    onClick={() => {
                        h.getElements().filter((child) => child.parentFrameId === el.id).forEach((child) => {
                            h.onElementChange(child.id, { parentFrameId: undefined });
                        });
                        h.onDelete(el.id);
                    }}
                    title="删除画板"
                >
                    <Trash2 size={18} />
                </button>
            </div>
            {showFramePresetMenu && (
                <FramePresetMenu el={el} handlersRef={handlersRef} />
            )}
        </div>
    );
}
