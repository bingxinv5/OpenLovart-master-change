import React from 'react';
import { Check, Clock, Layout, Maximize2, MessageSquare, Minimize2, PanelRight, Share2, Trash2, X } from 'lucide-react';

interface AiDesignerHeaderProps {
    messageCount: number;
    showHistory: boolean;
    copiedId: string | null;
    panelMode?: 'side' | 'bottom';
    isExpanded?: boolean;
    onClearChat: () => void;
    onNewChat: () => void;
    onToggleHistory: () => void;
    onExportChat: () => void;
    onPanelModeChange?: (mode: 'side' | 'bottom') => void;
    onExpandToggle?: () => void;
    onClose?: () => void;
}

export function AiDesignerHeader({
    messageCount,
    showHistory,
    copiedId,
    panelMode,
    isExpanded,
    onClearChat,
    onNewChat,
    onToggleHistory,
    onExportChat,
    onPanelModeChange,
    onExpandToggle,
    onClose,
}: AiDesignerHeaderProps) {
    return (
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
                {messageCount > 0 && (
                    <button onClick={onClearChat} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="清空对话">
                        <Trash2 size={12} />
                        <span>清空</span>
                    </button>
                )}
            </div>
            <div className="flex items-center gap-3 text-gray-400">
                <button onClick={onNewChat} className={`hover:text-gray-600 transition-colors ${messageCount > 0 ? 'text-gray-400' : 'text-gray-200 cursor-not-allowed'}`} title="新建对话" disabled={messageCount === 0}>
                    <MessageSquare size={18} />
                </button>
                <button onClick={onToggleHistory} className={`transition-colors ${showHistory ? 'text-blue-500' : 'hover:text-gray-600'}`} title="历史记录">
                    <Clock size={18} />
                </button>
                <button onClick={onExportChat} className={`transition-colors ${messageCount > 0 ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${copiedId === 'export' ? 'text-green-500' : ''}`} title={copiedId === 'export' ? '已复制到剪贴板!' : '导出对话'} disabled={messageCount === 0}>
                    {copiedId === 'export' ? <Check size={18} /> : <Share2 size={18} />}
                </button>
                <button onClick={() => onPanelModeChange?.(panelMode === 'side' ? 'bottom' : 'side')} className={`transition-colors ${onPanelModeChange ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${panelMode === 'bottom' ? 'text-blue-500' : ''}`} title={panelMode === 'bottom' ? '侧边面板' : '底部面板'}>
                    {panelMode === 'bottom' ? <PanelRight size={18} /> : <Layout size={18} />}
                </button>
                <button onClick={() => onExpandToggle?.()} className={`transition-colors ${onExpandToggle ? 'hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'} ${isExpanded ? 'text-blue-500' : ''}`} title={isExpanded ? '收缩面板' : '展开面板'}>
                    {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                {onClose && (
                    <button onClick={onClose} title="关闭 AI 设计师" aria-label="关闭 AI 设计师" className="hover:text-gray-600 transition-colors ml-1">
                        <X size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}