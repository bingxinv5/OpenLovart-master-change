"use client";

import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ChevronDown, Loader2, Scissors, Sparkles, X, Zap } from 'lucide-react';
import type { CanvasElement } from './canvas-types';
import { buildDefaultNamePrefix } from './panel-defaults';
import type { StoryboardSplitOptions } from '@/lib/storyboard-split';
import { checkUpscaleApiHealth, UPSCALE_MODELS } from '@/lib/upscale-api';

interface SplitStoryboardPanelProps {
  element: CanvasElement;
  style: CSSProperties;
  isSubmitting?: boolean;
  submitStatusText?: string;
  onSubmit: (options: StoryboardSplitOptions) => void;
  onClose: () => void;
  onCancelSubmit?: () => void;
}

const DEFAULT_OPTIONS: StoryboardSplitOptions = {
  rows: 2,
  cols: 2,
  gap: 0,
  padding: 0,
  namePrefix: '',
  upscaleEnabled: false,
  upscaleModel: 'upscayl-standard-4x',
  upscaleScale: 4,
};

export function SplitStoryboardPanel({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: SplitStoryboardPanelProps) {
  return (
    <SplitStoryboardPanelContent
      key={element.id}
      element={element}
      style={style}
      isSubmitting={isSubmitting}
      submitStatusText={submitStatusText}
      onSubmit={onSubmit}
      onClose={onClose}
      onCancelSubmit={onCancelSubmit}
    />
  );
}

function SplitStoryboardPanelContent({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: SplitStoryboardPanelProps) {
  const [options, setOptions] = useState<StoryboardSplitOptions>(() => ({
    ...DEFAULT_OPTIONS,
    namePrefix: buildDefaultNamePrefix(element),
  }));
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [apiGpu, setApiGpu] = useState<string>('');

  const checkApi = useCallback(async () => {
    setApiStatus('checking');
    const result = await checkUpscaleApiHealth();
    setApiStatus(result.ok ? 'ok' : 'fail');
    if (result.gpu) setApiGpu(result.gpu);
  }, []);

  useEffect(() => {
    if (options.upscaleEnabled) {
      void checkApi();
    }
  }, [options.upscaleEnabled, checkApi]);

  const updateField = <K extends keyof StoryboardSplitOptions>(key: K, value: StoryboardSplitOptions[K]) => {
    setOptions((prev) => ({
      ...prev,
      [key]: typeof value === 'number'
        ? (Number.isFinite(value) ? value : 0)
        : value,
    }));
  };

  return (
    <div
      className="absolute z-[120] w-[360px] workbench-panel-elevated rounded-xl p-3"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-white">
            <Scissors size={11} />
          </div>
          <span>分镜切割</span>
        </div>
        <button
          type="button"
          onClick={isSubmitting && onCancelSubmit ? onCancelSubmit : onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title={isSubmitting ? '取消任务' : '关闭'}
        >
          <X size={12} />
        </button>
      </div>

      {/* 命名前缀 — inline */}
      <div className="mt-2.5 flex items-center gap-2 border-b border-slate-100 pb-2">
        <span className="flex-shrink-0 text-[11px] font-medium text-slate-500">命名前缀</span>
        <input
          type="text"
          value={options.namePrefix || ''}
          onChange={(e) => updateField('namePrefix', e.target.value)}
          placeholder="如：镜头A"
          className="min-w-0 flex-1 text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-300"
        />
      </div>

      {/* 网格参数 — 统一容器 */}
      <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200/60">
        <div className="flex divide-x divide-slate-100">
          <label className="flex-1 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">行数</div>
            <input
              type="number"
              min={1}
              max={12}
              value={options.rows}
              onChange={(e) => updateField('rows', Number(e.target.value))}
              className="mt-0.5 w-full bg-transparent text-[13px] font-semibold text-slate-800 outline-none tabular-nums"
            />
          </label>
          <label className="flex-1 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">列数</div>
            <input
              type="number"
              min={1}
              max={12}
              value={options.cols}
              onChange={(e) => updateField('cols', Number(e.target.value))}
              className="mt-0.5 w-full bg-transparent text-[13px] font-semibold text-slate-800 outline-none tabular-nums"
            />
          </label>
        </div>
        <div className="flex divide-x divide-slate-100">
          <label className="flex-1 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">间距 (px)</div>
            <input
              type="number"
              min={0}
              max={200}
              value={options.gap}
              onChange={(e) => updateField('gap', Number(e.target.value))}
              className="mt-0.5 w-full bg-transparent text-[13px] font-semibold text-slate-800 outline-none tabular-nums"
            />
          </label>
          <label className="flex-1 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">边距 (px)</div>
            <input
              type="number"
              min={0}
              max={200}
              value={options.padding}
              onChange={(e) => updateField('padding', Number(e.target.value))}
              className="mt-0.5 w-full bg-transparent text-[13px] font-semibold text-slate-800 outline-none tabular-nums"
            />
          </label>
        </div>
      </div>

      {/* AI 放大 */}
      <div className="mt-2 rounded-md border border-slate-200/60">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-slate-500" />
            <span className="text-[11px] font-medium text-slate-700">AI 放大</span>
          </div>
          <button
            type="button"
            onClick={() => updateField('upscaleEnabled', !options.upscaleEnabled)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              options.upscaleEnabled ? 'bg-violet-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                options.upscaleEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {options.upscaleEnabled && (
          <div className="space-y-2 border-t border-slate-100 px-3 py-2">
            {/* API 状态 */}
            <div className="flex items-center gap-1.5 text-[10px]">
              {apiStatus === 'checking' && (
                <><Loader2 size={10} className="animate-spin text-slate-400" /><span className="text-slate-500">检测服务中...</span></>
              )}
              {apiStatus === 'ok' && (
                <><Zap size={10} className="text-green-500" /><span className="text-green-700">服务可用{apiGpu ? ` (${apiGpu})` : ''}</span></>
              )}
              {apiStatus === 'fail' && (
                <><span className="text-red-500">●</span><span className="text-red-600">服务不可用</span>
                  <button type="button" onClick={checkApi} className="ml-1 text-violet-600 underline hover:text-violet-800">重试</button>
                </>
              )}
            </div>

            {/* 模型选择 */}
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-500">放大模型</div>
              <div className="relative">
                <select
                  aria-label="放大模型"
                  value={options.upscaleModel || 'upscayl-standard-4x'}
                  onChange={(e) => updateField('upscaleModel', e.target.value)}
                  className="w-full appearance-none rounded border border-slate-200 bg-white py-1 pl-2 pr-7 text-[11px] font-medium text-slate-800 outline-none"
                >
                  {UPSCALE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} ({m.id.replace('-4x', '')})</option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {/* 放大倍率 */}
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-500">放大倍率</div>
              <div className="inline-flex rounded-md bg-slate-100 p-0.5">
                {[2, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateField('upscaleScale', s)}
                    className={`rounded px-3 py-1 text-[11px] font-medium transition-colors ${
                      (options.upscaleScale || 4) === s
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-slate-500">
          预计生成 <span className="font-semibold text-slate-700">{Math.max(1, options.rows) * Math.max(1, options.cols)}</span> 张
          {options.upscaleEnabled && (
            <span className="ml-1 text-[10px] text-violet-500">+AI {options.upscaleScale || 4}x</span>
          )}
        </span>
        {isSubmitting && submitStatusText && (
          <span className="text-[11px] text-slate-500">{submitStatusText}</span>
        )}
        <button
          type="button"
          onClick={isSubmitting && onCancelSubmit ? onCancelSubmit : onClose}
          className="rounded-md border border-slate-200/60 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onSubmit(options)}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-violet-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
          <span>{isSubmitting ? '切割中...' : '开始切割'}</span>
        </button>
      </div>
    </div>
  );
}
