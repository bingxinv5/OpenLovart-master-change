'use client';

import { Clock, Trash2, X } from 'lucide-react';
import { aiModels } from './ai-designer-panel-constants';
import type { ChatSession } from './ai-designer-panel-types';
import { formatTime } from './ai-designer-panel-utils';

type AiDesignerHistoryPanelProps = {
  showHistory: boolean;
  chatSessions: ChatSession[];
  onClose: () => void;
  onRestoreSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string, event: React.MouseEvent) => void;
  onClearSessions: () => void;
};

export function AiDesignerHistoryPanel({
  showHistory,
  chatSessions,
  onClose,
  onRestoreSession,
  onDeleteSession,
  onClearSessions,
}: AiDesignerHistoryPanelProps) {
  if (!showHistory) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-white rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">📋 对话历史</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {chatSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <Clock size={32} className="mb-2" />
            <p className="text-sm">暂无历史记录</p>
            <p className="text-xs mt-1">新建对话时，当前对话会自动保存</p>
          </div>
        ) : (
          <div className="space-y-2">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onRestoreSession(session)}
                className="group p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{session.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">
                        {session.updatedAt.toLocaleDateString('zh-CN')} {formatTime(session.updatedAt)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded-full">
                        {session.messages.length} 条
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${aiModels.find((model) => model.id === session.model)?.color || 'text-gray-400'} bg-gray-50`}>
                        {aiModels.find((model) => model.id === session.model)?.label || session.model}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(event) => onDeleteSession(session.id, event)}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {chatSessions.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={onClearSessions}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={11} />
            <span>清空所有历史</span>
          </button>
        </div>
      )}
    </div>
  );
}
