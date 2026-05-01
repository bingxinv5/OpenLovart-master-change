'use client';

import React from 'react';
import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';
import { suggestions } from './ai-designer-panel-constants';
import type { ChatMessage } from './ai-designer-panel-types';
import { formatTime, renderMarkdown } from './ai-designer-panel-utils';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

type AiDesignerMessageListProps = {
  messages: ChatMessage[];
  suggestionIndex: number;
  copiedId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSuggestionClick: (description: string) => void;
  onShuffleSuggestions: () => void;
  onCopy: (content: string, id: string) => void;
};

function getMessageProgressClassName(messageId: string) {
  return buildFloatingPanelPositionClassName('ai-message-progress', messageId);
}

function getMessageProgressCss(message: ChatMessage) {
  const progressPercent = Math.max(message.taskProgress || 0, 5);
  return `.${getMessageProgressClassName(message.id)} { width: ${progressPercent}%; }`;
}

const TOOL_TAG_COLORS: Record<string, string> = {
  '@图片生成': 'bg-purple-50 text-purple-600',
  '@视频生成': 'bg-blue-50 text-blue-600',
  '@设计评审': 'bg-amber-50 text-amber-600',
  '@配色方案': 'bg-pink-50 text-pink-600',
  '@字体搭配': 'bg-indigo-50 text-indigo-600',
  '@布局建议': 'bg-cyan-50 text-cyan-600',
  '@品牌设计': 'bg-emerald-50 text-emerald-600',
  '@UX分析': 'bg-orange-50 text-orange-600',
};

export function AiDesignerMessageList({
  messages,
  suggestionIndex,
  copiedId,
  messagesEndRef,
  onSuggestionClick,
  onShuffleSuggestions,
  onCopy,
}: AiDesignerMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 pb-4">
      {messages.length === 0 ? (
        <>
          <div className="mb-8 mt-2">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Hi，我是你的AI设计师</h1>
            <p className="text-xl text-gray-400 font-light">让我们开始今天的创作吧！</p>
          </div>

          <div className="space-y-4 mb-6">
            {[...suggestions, ...suggestions].slice(suggestionIndex, suggestionIndex + 3).map((item, index) => (
              <div
                key={`${suggestionIndex}-${index}`}
                onClick={() => onSuggestionClick(item.description)}
                className="group relative flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-white to-gray-50"
              >
                <div className="flex-1 pr-4">
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-400 line-clamp-1">{item.description}</p>
                </div>
                <div className={`w-16 h-20 rounded-lg shadow-sm ${item.imageColor} transform group-hover:scale-105 transition-transform rotate-3`} />
                <div className={`absolute right-8 w-16 h-20 rounded-lg shadow-sm ${item.imageColor} opacity-50 transform rotate-12 -z-10`} />
              </div>
            ))}
          </div>

          <button
            onClick={onShuffleSuggestions}
            className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm mb-4"
          >
            <RefreshCw size={14} />
            <span>换一批</span>
          </button>
        </>
      ) : (
        <div className="space-y-4 mt-2">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-gray-100 text-gray-900 px-4 py-3 rounded-2xl rounded-tr-sm">
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {message.attachments.map((attachment) => (
                          <WorkbenchImage
                            key={attachment.id}
                            content={attachment.dataUrl}
                            alt={attachment.name}
                            containerClassName="w-20 h-20 rounded-lg"
                            imageClassName="rounded-lg"
                            fit="cover"
                            showSurface={false}
                          />
                        ))}
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{renderUserMessage(message.content)}</p>
                    <p className="text-[10px] text-gray-400 mt-1 text-right">{formatTime(message.timestamp)}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="max-w-[95%] bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                    {message.toolType && (
                      <div className="mb-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          message.toolType === 'image-gen'
                            ? 'bg-purple-50 text-purple-600'
                            : message.toolType === 'video-gen'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-gray-50 text-gray-500'
                        }`}>
                          {message.toolType === 'image-gen'
                            ? '🖼️ 图片生成'
                            : message.toolType === 'video-gen'
                              ? '🎬 视频生成'
                              : ''}
                        </span>
                      </div>
                    )}
                    {message.content ? (
                      <div className="prose-sm">{renderMarkdown(message.content)}</div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400 py-1">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm">思考中...</span>
                      </div>
                    )}
                    {(message.taskStatus === 'processing' || message.taskStatus === 'pending') && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <style>{getMessageProgressCss(message)}</style>
                          <div
                            className={`${message.taskStatus === 'processing' ? getMessageProgressClassName(message.id) : ''} h-1.5 rounded-full transition-all duration-500 ease-out ${
                              message.taskStatus === 'pending'
                                ? 'bg-gray-300 animate-pulse w-full'
                                : 'bg-gradient-to-r from-blue-500 to-purple-500'
                            }`}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {message.taskStatus === 'pending' ? '任务排队中...' : `${message.taskProgress || 0}%`}
                        </p>
                      </div>
                    )}
                    {message.generatedImage && (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.generatedImage}
                          alt="AI 生成图片"
                          className="w-full max-w-[520px] rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => window.open(message.generatedImage, '_blank')}
                          draggable={false}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <a
                            href={message.generatedImage}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors px-2 py-1 hover:bg-blue-50 rounded-lg"
                          >
                            <Download size={12} />
                            下载图片
                          </a>
                        </div>
                      </div>
                    )}
                    {message.generatedVideo && (
                      <div className="mt-3">
                        <video
                          src={message.generatedVideo}
                          controls
                          className="rounded-xl max-w-full max-h-[400px] border border-gray-100 shadow-sm"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <a
                            href={message.generatedVideo}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors px-2 py-1 hover:bg-blue-50 rounded-lg"
                          >
                            <Download size={12} />
                            下载视频
                          </a>
                        </div>
                      </div>
                    )}
                    {message.isStreaming && message.content && !message.toolType && (
                      <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                    )}
                  </div>
                  {!message.isStreaming && message.content && !message.content.startsWith('❌') && (!message.taskStatus || message.taskStatus === 'completed') && (
                    <div className="flex items-center gap-1 mt-1 ml-1">
                      <button
                        onClick={() => onCopy(message.content, message.id)}
                        className="p-1 text-gray-300 hover:text-gray-500 transition-colors rounded"
                        title="复制"
                      >
                        {copiedId === message.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                      <span className="text-[10px] text-gray-300">{formatTime(message.timestamp)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}

function renderUserMessage(content: string) {
  const match = content.match(/^(@(?:图片生成|视频生成|设计评审|配色方案|字体搭配|布局建议|品牌设计|UX分析))\s*/);
  if (!match) {
    return content;
  }

  const tag = match[1];
  const rest = content.slice(match[0].length);

  return (
    <>
      <span className={`inline-flex items-center px-1.5 py-0.5 mr-1.5 text-[11px] font-medium rounded-md ${TOOL_TAG_COLORS[tag] || 'bg-blue-50 text-blue-600'}`}>
        {tag}
      </span>
      {rest}
    </>
  );
}
