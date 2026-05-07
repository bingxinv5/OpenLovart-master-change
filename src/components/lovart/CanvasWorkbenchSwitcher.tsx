"use client";

import React from 'react';
import { Bookmark, Command, History, Images, Keyboard, Layers3, Sparkles } from 'lucide-react';

interface CanvasWorkbenchSwitcherProps {
    showLayers: boolean;
    showHistory: boolean;
    showMedia: boolean;
    showReferences: boolean;
    showChat: boolean;
    elementCount: number;
    selectionCount: number;
    historyCount: number;
    referenceCount: number;
    onToggleLayers: () => void;
    onToggleHistory: () => void;
    onToggleMedia: () => void;
    onToggleReferences: () => void;
    onToggleChat: () => void;
    onOpenCommandPalette: () => void;
    onOpenShortcutHelp: () => void;
}

function DockButton({
    active,
    icon,
    label,
    badge,
    testId,
    title,
    onClick,
}: {
    active: boolean;
    icon: React.ReactNode;
    label: string;
    badge?: string;
    testId?: string;
    title?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            title={title}
            className={`canvas-chip-button inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition ${active ? 'is-active' : ''}`}
        >
            {icon}
            <span>{label}</span>
            {badge && (
                <span className="canvas-chip-badge rounded-full px-1.5 py-px text-[10px]">
                    {badge}
                </span>
            )}
        </button>
    );
}

export function CanvasWorkbenchSwitcher({
    showLayers,
    showHistory,
    showMedia,
    showReferences,
    showChat,
    elementCount,
    selectionCount,
    historyCount,
    referenceCount,
    onToggleLayers,
    onToggleHistory,
    onToggleMedia,
    onToggleReferences,
    onToggleChat,
    onOpenCommandPalette,
    onOpenShortcutHelp,
}: CanvasWorkbenchSwitcherProps) {
    return (
        <div className="hidden items-center gap-1.5 xl:flex">
            <div className="canvas-workbench-group inline-flex items-center gap-0.5 rounded-2xl px-1 py-1">
                <DockButton active={showLayers} icon={<Layers3 size={15} />} label="图层" badge={selectionCount > 0 ? `${selectionCount}` : `${elementCount}`} onClick={onToggleLayers} testId="canvas-layers-toggle" title={showLayers ? '关闭图层面板' : '打开图层面板'} />
                <DockButton active={showHistory} icon={<History size={15} />} label="历史" badge={`${historyCount}`} onClick={onToggleHistory} testId="canvas-history-toggle" title={showHistory ? '关闭历史侧栏' : '打开历史侧栏'} />
                <DockButton active={showMedia} icon={<Images size={15} />} label="媒体" onClick={onToggleMedia} testId="canvas-media-toggle" title={showMedia ? '关闭媒体历史' : '打开媒体历史'} />
                <DockButton active={showReferences} icon={<Bookmark size={15} />} label="参考" badge={referenceCount > 0 ? `${referenceCount}` : undefined} onClick={onToggleReferences} testId="canvas-reference-toggle" title={showReferences ? '关闭参考库' : '打开参考库'} />
                <DockButton active={showChat} icon={<Sparkles size={15} />} label="AI" onClick={onToggleChat} testId="canvas-chat-toggle" title={showChat ? '关闭 AI 设计师' : '打开 AI 设计师'} />
            </div>

            <div className="canvas-workbench-group inline-flex items-center gap-0.5 rounded-2xl px-1 py-1">
                <button
                    type="button"
                    onClick={onOpenCommandPalette}
                    className="canvas-chip-button inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition"
                    title="命令面板 (Ctrl+K)"
                >
                    <Command size={15} />
                    <kbd className="canvas-kbd text-[10px]">⌘K</kbd>
                </button>

                <button
                    type="button"
                    onClick={onOpenShortcutHelp}
                    className="canvas-chip-button inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition"
                    title="快捷键帮助"
                >
                    <Keyboard size={15} />
                    <kbd className="canvas-kbd text-[10px]">?</kbd>
                </button>
            </div>
        </div>
    );
}