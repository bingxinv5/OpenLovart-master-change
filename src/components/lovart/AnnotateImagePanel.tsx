"use client";

import React, { useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Highlighter, Loader2, Palette, Type, X } from 'lucide-react';
import type { CanvasElement } from './canvas-types';
import { buildDefaultNamePrefix } from './panel-defaults';
import { useToolPresets } from './useToolPresets';
import type { AnnotateImageOptions, AnnotateLabelPosition } from '@/lib/image-annotate';

interface AnnotateImagePanelProps {
  element: CanvasElement;
  style: CSSProperties;
  isSubmitting?: boolean;
  submitStatusText?: string;
  onSubmit: (options: AnnotateImageOptions) => void;
  onClose: () => void;
  onCancelSubmit?: () => void;
}

const DEFAULT_OPTIONS: AnnotateImageOptions = {
  label: '',
  note: '',
  markerNumber: 1,
  position: 'bottom',
  accentColor: '#7c3aed',
  namePrefix: '',
};

const positionOptions: Array<{ id: AnnotateLabelPosition; label: string }> = [
  { id: 'top', label: '顶部' },
  { id: 'bottom', label: '底部' },
];

const accentPresets = ['#7c3aed', '#ef4444', '#f59e0b', '#10b981', '#0ea5e9'];

export function AnnotateImagePanel({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: AnnotateImagePanelProps) {
  return (
    <AnnotateImagePanelContent
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

function AnnotateImagePanelContent({
  element,
  style,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onCancelSubmit,
}: AnnotateImagePanelProps) {
  const [options, setOptions] = useState<AnnotateImageOptions>(() => ({
    ...DEFAULT_OPTIONS,
    namePrefix: buildDefaultNamePrefix(element),
  }));
  const { presetHint, presetName, presets, setPresetName, saveNamedPreset, rememberPreset, loadLastPreset, applyPreset, removePreset } = useToolPresets<AnnotateImageOptions>('annotate-image', '标注预设');
  const [presetsExpanded, setPresetsExpanded] = useState(false);

  const updateField = <K extends keyof AnnotateImageOptions>(key: K, value: AnnotateImageOptions[K]) => {
    setOptions((prev) => ({
      ...prev,
      [key]: value,
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
            <Highlighter size={11} />
          </div>
          <span>标注图片</span>
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

      {/* 输入字段 — 统一容器 */}
      <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200/60">
        <label className="block px-3 py-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Type size={11} /> 标题
          </div>
          <input
            type="text"
            value={options.label}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="例如：镜头 01 / 主视觉 / 重点说明"
            className="w-full bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-300"
          />
        </label>

        <label className="block px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-slate-500">备注</div>
          <textarea
            value={options.note || ''}
            onChange={(e) => updateField('note', e.target.value)}
            placeholder="补充信息，例如机位、动作、注意事项"
            rows={2}
            className="w-full resize-none bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-300"
          />
        </label>

        <div className="flex items-center gap-3 px-3 py-2">
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">序号</span>
            <input
              type="number"
              min={1}
              max={999}
              value={options.markerNumber ?? 1}
              onChange={(e) => updateField('markerNumber', Number(e.target.value))}
              className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 outline-none"
            />
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">位置</span>
            <div className="inline-flex rounded-md bg-slate-100 p-0.5">
              {positionOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => updateField('position', item.id)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    options.position === item.id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Palette size={11} /> 强调色
          </span>
          <div className="flex items-center gap-1.5">
            {accentPresets.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateField('accentColor', color)}
                className={`h-5 w-5 rounded-full transition-all ${options.accentColor === color ? 'ring-2 ring-slate-800 ring-offset-1' : ''}`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <input
              type="color"
              value={options.accentColor}
              onChange={(e) => updateField('accentColor', e.target.value)}
              className="h-5 w-5 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              title="自定义颜色"
            />
          </div>
        </div>
      </div>

      {/* 预设管理 — 默认折叠 */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setPresetsExpanded((v) => !v)}
          className="flex w-full items-center gap-1 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          {presetsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>预设管理</span>
          {presets.length > 0 && <span className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-400">{presets.length}</span>}
          {presetHint && <span className="ml-auto text-[10px] text-slate-400">{presetHint}</span>}
        </button>
        {presetsExpanded && (
          <div className="mt-1 space-y-1.5 rounded-md border border-slate-100 p-2">
            {options.namePrefix?.trim() && (
              <div className="text-[10px] text-slate-400">命名示例：{options.namePrefix.trim()} · 标注</div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="预设名，如：产品标注卡"
                className="h-6 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none placeholder:text-slate-300"
              />
              <button type="button" onClick={() => saveNamedPreset(options)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">保存</button>
              <button type="button" onClick={() => rememberPreset(options)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">记住</button>
              <button type="button" onClick={() => loadLastPreset((preset) => { setOptions((prev) => ({ ...prev, ...preset })); })} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">上次</button>
            </div>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {presets.map((preset) => (
                  <div key={preset.id} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5">
                    <button type="button" onClick={() => applyPreset(preset, (value) => { setOptions((prev) => ({ ...prev, ...value })); })} className="text-[10px] font-medium text-slate-700 hover:text-slate-900">{preset.name}</button>
                    <button type="button" onClick={() => removePreset(preset)} className="text-[10px] text-slate-400 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {isSubmitting && submitStatusText && (
          <span className="mr-auto text-[11px] text-slate-500">{submitStatusText}</span>
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
          disabled={isSubmitting || !options.label.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-amber-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Highlighter size={14} />}
          <span>{isSubmitting ? '生成中...' : '生成标注图'}</span>
        </button>
      </div>
    </div>
  );
}
