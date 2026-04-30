import { ChevronLeft, Sparkles, Cloud, CloudOff, HardDrive } from 'lucide-react';
import Link from 'next/link';
import { ApiSettingsButton } from '@/components/lovart/ApiSettingsDialog';
import { CanvasWorkbenchSwitcher } from '@/components/lovart/CanvasWorkbenchSwitcher';

export type CanvasSaveStatus = 'saved' | 'saving' | 'offline';

interface CanvasHeaderProps {
    title: string;
    isLoading: boolean;
    isSignedIn: boolean;
    saveStatus: CanvasSaveStatus;
    elementCount: number;
    selectionCount: number;
    historyCount: number;
    referenceCount: number;
    showLayers: boolean;
    showHistory: boolean;
    showMedia: boolean;
    showReferences: boolean;
    showChat: boolean;
    autoSaveGenerated: boolean;
    onTitleChange: (title: string) => void;
    onToggleLayers: () => void;
    onToggleHistory: () => void;
    onToggleMedia: () => void;
    onToggleReferences: () => void;
    onToggleChat: () => void;
    onOpenCommandPalette: () => void;
    onOpenShortcutHelp: () => void;
    onToggleAutoSaveGenerated: () => void;
}

export function CanvasHeader({
    title,
    isLoading,
    isSignedIn,
    saveStatus,
    elementCount,
    selectionCount,
    historyCount,
    referenceCount,
    showLayers,
    showHistory,
    showMedia,
    showReferences,
    showChat,
    autoSaveGenerated,
    onTitleChange,
    onToggleLayers,
    onToggleHistory,
    onToggleMedia,
    onToggleReferences,
    onToggleChat,
    onOpenCommandPalette,
    onOpenShortcutHelp,
    onToggleAutoSaveGenerated,
}: CanvasHeaderProps) {
    return (
        <header className="pointer-events-none absolute top-0 left-0 z-50 flex h-12 w-full items-center justify-between border-b border-slate-200/60 bg-white/90 px-4 backdrop-blur-xl">
            <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                <Link href="/projects" className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[13px] text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700">
                    <ChevronLeft size={14} />
                    <span className="hidden sm:inline">返回</span>
                </Link>
                <div className="h-3.5 w-px bg-slate-200/80" />
                <div className="flex min-w-0 items-center gap-2">
                    <input
                        type="text"
                        value={title}
                        onChange={(event) => onTitleChange(event.target.value)}
                        className="w-36 rounded-lg border-none bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50"
                        placeholder="未命名"
                        disabled={isLoading}
                        data-testid="canvas-title-input"
                    />
                    <div
                        className="flex items-center gap-1.5"
                        data-testid="canvas-save-status"
                        data-status={saveStatus}
                    >
                        {saveStatus === 'saving' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-sky-500">
                                <Cloud size={11} className="animate-pulse" />
                                <span className="hidden md:inline">保存中</span>
                            </span>
                        )}
                        {saveStatus === 'saved' && isSignedIn && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                                <Cloud size={11} />
                                <span className="hidden md:inline">已保存</span>
                            </span>
                        )}
                        {saveStatus === 'offline' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-500">
                                <CloudOff size={11} />
                                <span className="hidden md:inline">离线</span>
                            </span>
                        )}
                        {!isSignedIn && (
                            <span className="inline-flex items-center text-[11px] text-amber-500">未登录</span>
                        )}
                    </div>
                    <span className="hidden rounded-md bg-slate-100/80 px-1.5 py-px text-[10px] font-medium text-slate-400 lg:inline-flex">
                        {elementCount} 项
                    </span>
                </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
                <CanvasWorkbenchSwitcher
                    showLayers={showLayers}
                    showHistory={showHistory}
                    showMedia={showMedia}
                    showReferences={showReferences}
                    showChat={showChat}
                    elementCount={elementCount}
                    selectionCount={selectionCount}
                    historyCount={historyCount}
                    referenceCount={referenceCount}
                    onToggleLayers={onToggleLayers}
                    onToggleHistory={onToggleHistory}
                    onToggleMedia={onToggleMedia}
                    onToggleReferences={onToggleReferences}
                    onToggleChat={onToggleChat}
                    onOpenCommandPalette={onOpenCommandPalette}
                    onOpenShortcutHelp={onOpenShortcutHelp}
                />

                <div className="flex items-center gap-1.5 xl:hidden">
                    <button
                        onClick={onToggleLayers}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showLayers ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                        title={showLayers ? '关闭图层面板' : '打开图层面板'}
                        data-testid="canvas-layers-toggle"
                    >
                        层
                    </button>
                    <button
                        onClick={onToggleHistory}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showHistory ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                        title={showHistory ? '关闭历史侧栏' : '打开历史侧栏'}
                        data-testid="canvas-history-toggle"
                    >
                        史
                    </button>
                    <button
                        onClick={onToggleMedia}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showMedia ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                        title={showMedia ? '关闭媒体历史' : '打开媒体历史'}
                        data-testid="canvas-media-toggle"
                    >
                        媒
                    </button>
                    <button
                        onClick={onToggleReferences}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showReferences ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                        title={showReferences ? '关闭项目参考库' : '打开项目参考库'}
                        data-testid="canvas-reference-toggle"
                    >
                        参
                    </button>
                    <button
                        onClick={onToggleChat}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${showChat ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                        title={showChat ? '关闭 AI 对话' : '打开 AI 对话'}
                        data-testid="canvas-chat-toggle"
                    >
                        <Sparkles size={13} />
                    </button>
                </div>

                <button
                    onClick={onToggleAutoSaveGenerated}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        autoSaveGenerated
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                    title={autoSaveGenerated ? '关闭生成结果自动落盘' : '开启生成结果自动落盘'}
                >
                    <HardDrive size={14} />
                    {autoSaveGenerated && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-white bg-green-500" />
                    )}
                </button>
                <ApiSettingsButton />
            </div>
        </header>
    );
}