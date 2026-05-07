"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Frame, Image as ImageIcon, MapPin, Minus, MousePointer2, Send, Sparkles, Square, Trash2, Type, Video } from 'lucide-react';
import { ExportMenu } from './ExportMenu';
import type { CanvasElement, CanvasElementExportFormat } from './canvas-types';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

export type CanvasContextMenuState = {
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    targetElementId: string | null;
};

export function useCanvasContextMenu() {
    const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
    const [contextMenuAdjusted, setContextMenuAdjusted] = useState<{ x: number; y: number } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
        setContextMenuAdjusted(null);
    }, []);

    useEffect(() => {
        if (!contextMenu) return;

        const raf = requestAnimationFrame(() => {
            const element = contextMenuRef.current;
            if (!element) {
                setContextMenuAdjusted({ x: contextMenu.x, y: contextMenu.y });
                return;
            }

            const rect = element.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            let x = contextMenu.x;
            let y = contextMenu.y;
            if (y + rect.height > viewportHeight - 8) {
                y = Math.max(8, viewportHeight - rect.height - 8);
            }
            if (x + rect.width > viewportWidth - 8) {
                x = Math.max(8, viewportWidth - rect.width - 8);
            }
            setContextMenuAdjusted({ x, y });
        });

        return () => cancelAnimationFrame(raf);
    }, [contextMenu]);

    useEffect(() => {
        if (!contextMenu) return;

        const handler = () => {
            closeContextMenu();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [closeContextMenu, contextMenu]);

    return {
        contextMenu,
        setContextMenu,
        contextMenuAdjusted,
        setContextMenuAdjusted,
        contextMenuRef,
        closeContextMenu,
    };
}

export interface CanvasContextMenuProps {
    contextMenu: CanvasContextMenuState;
    adjustedPosition: { x: number; y: number } | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    contextTargetElement: CanvasElement | null;
    contextTargetIds: string[];
    selectedCount: number;
    canPaste?: boolean;
    contextAllHidden: boolean;
    contextAllLocked: boolean;
    contextCanSendToChat: boolean;
    contextCanGroup: boolean;
    contextCanUngroup: boolean;
    contextCanMerge: boolean;
    onContextCopySelection: () => void;
    onContextCutSelection: () => void;
    onContextPaste: () => void;
    onContextDuplicate: () => void;
    onContextSendToChat: () => void;
    onContextBringForward: () => void;
    onContextSendBackward: () => void;
    onContextBringToFront: () => void;
    onContextSendToBack: () => void;
    onContextGroup: () => void;
    onContextUngroup: () => void;
    onContextMerge: () => void;
    onContextToggleHidden: () => void;
    onContextToggleLocked: () => void;
    onContextDeleteSelection: () => void;
    onContextImageUpload: () => void;
    onContextVideoUpload: () => void;
    onContextImageGenerator: () => void;
    onContextVideoGenerator: () => void;
    onContextAddText: () => void;
    onContextAddShape: () => void;
    onContextAddMark: () => void;
    onContextAddFrame: () => void;
    onContextSelectAll: () => void;
    onDownloadElement?: (element: CanvasElement, format?: CanvasElementExportFormat) => void;
    onClose: () => void;
    renderAlignmentMenuSection: (selectionCount: number) => React.ReactNode;
}

export function CanvasContextMenu({
    contextMenu,
    adjustedPosition,
    menuRef,
    contextTargetElement,
    selectedCount,
    canPaste,
    contextAllHidden,
    contextAllLocked,
    contextCanSendToChat,
    contextCanGroup,
    contextCanUngroup,
    contextCanMerge,
    onContextCopySelection,
    onContextCutSelection,
    onContextPaste,
    onContextDuplicate,
    onContextSendToChat,
    onContextBringForward,
    onContextSendBackward,
    onContextBringToFront,
    onContextSendToBack,
    onContextGroup,
    onContextUngroup,
    onContextMerge,
    onContextToggleHidden,
    onContextToggleLocked,
    onContextDeleteSelection,
    onContextImageUpload,
    onContextVideoUpload,
    onContextImageGenerator,
    onContextVideoGenerator,
    onContextAddText,
    onContextAddShape,
    onContextAddMark,
    onContextAddFrame,
    onContextSelectAll,
    onDownloadElement,
    onClose,
    renderAlignmentMenuSection,
}: CanvasContextMenuProps) {
    const menuPosition = adjustedPosition ?? contextMenu;
    const menuPositionClassName = buildFloatingPanelPositionClassName('canvas-context-menu-position', `${Math.round(menuPosition.x)}-${Math.round(menuPosition.y)}`);
    const menuPositionCss = `.${menuPositionClassName} { left: ${menuPosition.x}px; top: ${menuPosition.y}px; }`;

    return (
        <div
            ref={menuRef}
            className={`${menuPositionClassName} canvas-popover fixed z-[200] rounded-xl py-1.5 min-w-[180px] max-h-[calc(100vh-16px)] overflow-y-auto animate-in fade-in zoom-in-95 duration-150`}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <style>{menuPositionCss}</style>
            {contextTargetElement ? (
                <>
                    <button onClick={onContextCopySelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">⎘</span>
                        复制
                        <span className="ml-auto text-xs text-gray-400">Ctrl+C</span>
                    </button>
                    <button onClick={onContextCutSelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">✂</span>
                        剪切
                        <span className="ml-auto text-xs text-gray-400">Ctrl+X</span>
                    </button>
                    <button
                        onClick={onContextPaste}
                        disabled={!canPaste}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${canPaste ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                    >
                        <span className="w-4 text-center text-gray-400">⌘</span>
                        粘贴到此处
                        <span className="ml-auto text-xs text-gray-400">Ctrl+V</span>
                    </button>
                    <button onClick={onContextDuplicate} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">⊕</span>
                        创建副本
                        <span className="ml-auto text-xs text-gray-400">Ctrl+D</span>
                    </button>
                    {contextCanSendToChat && (
                        <button onClick={onContextSendToChat} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Send size={14} className="text-gray-400" />
                            发送至对话
                        </button>
                    )}
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={onContextBringForward} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">↑</span>
                        上移一层
                    </button>
                    <button onClick={onContextSendBackward} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">↓</span>
                        下移一层
                    </button>
                    <button onClick={onContextBringToFront} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">⇡</span>
                        移动至顶层
                    </button>
                    <button onClick={onContextSendToBack} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">⇣</span>
                        移动至底层
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    {renderAlignmentMenuSection(selectedCount)}
                    {selectedCount === 1 && contextTargetElement.type !== 'frame' && !!contextTargetElement.content && onDownloadElement && (
                        (contextTargetElement.type === 'image' || contextTargetElement.type === 'video') ? (
                            <div className="px-3 py-2">
                                <ExportMenu
                                    kind={contextTargetElement.type === 'video' ? 'video' : 'image'}
                                    onSelect={(format) => { onDownloadElement(contextTargetElement, format); onClose(); }}
                                    className="w-full shadow-sm"
                                />
                            </div>
                        ) : (
                            <button onClick={() => { onDownloadElement(contextTargetElement, 'original'); onClose(); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <Download size={14} className="text-gray-400" />
                                导出
                            </button>
                        )
                    )}
                    {contextCanGroup && (
                        <button onClick={onContextGroup} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Frame size={14} className="text-gray-400" />
                            创建编组
                        </button>
                    )}
                    {contextCanUngroup && (
                        <button onClick={onContextUngroup} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Frame size={14} className="text-gray-400" />
                            解除编组
                        </button>
                    )}
                    {contextCanMerge && (
                        <button onClick={onContextMerge} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Minus size={14} className="text-gray-400" />
                            合并图层
                        </button>
                    )}
                    <button onClick={onContextToggleHidden} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">{contextAllHidden ? '◐' : '◌'}</span>
                        {contextAllHidden ? '显示' : '隐藏'}
                    </button>
                    <button onClick={onContextToggleLocked} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="w-4 text-center text-gray-400">{contextAllLocked ? '🔓' : '🔒'}</span>
                        {contextAllLocked ? '解锁' : '锁定'}
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={onContextDeleteSelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
                        <Trash2 size={14} className="text-red-400" />
                        删除
                    </button>
                </>
            ) : (
                <>
                    <button
                        onClick={onContextPaste}
                        disabled={!canPaste}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${canPaste ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                    >
                        <span className="w-4 text-center text-gray-400">⌘</span>
                        粘贴到此处
                        <span className="ml-auto text-xs text-gray-400">Ctrl+V</span>
                    </button>
                    {renderAlignmentMenuSection(selectedCount)}
                    <button onClick={onContextImageUpload} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <ImageIcon size={14} className="text-gray-400" />
                        上传图片
                    </button>
                    <button onClick={onContextVideoUpload} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Video size={14} className="text-gray-400" />
                        上传视频
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={onContextImageGenerator} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Sparkles size={14} className="text-gray-400" />
                        图像生成器
                    </button>
                    <button onClick={onContextVideoGenerator} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Video size={14} className="text-gray-400" />
                        视频生成器
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={onContextAddText} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Type size={14} className="text-gray-400" />
                        添加文本
                        <span className="ml-auto text-xs text-gray-400">T</span>
                    </button>
                    <button onClick={onContextAddShape} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Square size={14} className="text-gray-400" />
                        添加形状
                    </button>
                    <button onClick={onContextAddMark} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <MapPin size={14} className="text-red-400" />
                        添加标记
                        <span className="ml-auto text-xs text-gray-400">M</span>
                    </button>
                    <button onClick={onContextAddFrame} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Frame size={14} className="text-blue-400" />
                        添加画板
                        <span className="ml-auto text-xs text-gray-400">F</span>
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={onContextSelectAll} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <MousePointer2 size={14} className="text-gray-400" />
                        全选
                        <span className="ml-auto text-xs text-gray-400">Ctrl+A</span>
                    </button>
                </>
            )}
        </div>
    );
}