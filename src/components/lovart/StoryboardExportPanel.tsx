"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, LayoutGrid, Loader2, Type, X } from 'lucide-react';
import type { StoryboardExportOptions, StoryboardExportStyle } from '@/lib/storyboard-export';
import { getImageBlobUrlWithLOD, isImageRef } from '@/lib/editor-kernel';
import { deleteStoryboardExportTemplate, listStoryboardExportTemplates, saveStoryboardExportTemplate, type StoryboardExportTemplateEntry } from '@/lib/storyboard-export-presets';
import { loadStoryboardExportOptions, persistStoryboardExportOptions } from '@/lib/storyboard-export-settings';
import {
    type StoryboardExportPreviewItem,
    type StoryboardOrderStatus,
    type BatchMetadataFields,
    type BatchApplyMode,
    type BatchShotCodeFields,
    captionOptions,
    exportStyleOptions,
    DEFAULT_BATCH_METADATA_FIELDS,
    DEFAULT_BATCH_SHOT_CODE_FIELDS,
    getOrderStatusMeta,
    getTemplateSummary,
    sortByStoryboardShotCode,
    mergeWithSelectionOrder,
    autofillMissingShotCodes,
    applyBatchMetadataToItems,
    applyBatchShotCodesToItems,
    computeValidationById,
    computePreflightSummary,
    computePendingCanvasApplyCount,
    computeIssueItemIds,
} from './storyboard-export-panel-utils';
import { StoryboardExportPreviewSection } from './StoryboardExportPreviewSection';

interface StoryboardExportPanelProps {
  selectedCount: number;
  items: StoryboardExportPreviewItem[];
  defaultFileName?: string;
  isSubmitting?: boolean;
  submitStatusText?: string;
  onSubmit: (options: StoryboardExportOptions, orderedItems: StoryboardExportPreviewItem[]) => void;
  onClose: () => void;
  onApplyToCanvas?: (items: StoryboardExportPreviewItem[]) => void;
  onLocateItem?: (id: string) => void;
  onCancelSubmit?: () => void;
}

export function StoryboardExportPanel({
  selectedCount,
  items,
  defaultFileName,
  isSubmitting = false,
  submitStatusText,
  onSubmit,
  onClose,
  onApplyToCanvas,
  onLocateItem,
  onCancelSubmit,
}: StoryboardExportPanelProps) {
  const [options, setOptions] = useState<StoryboardExportOptions>(() => loadStoryboardExportOptions(defaultFileName));
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [draftOrderedItems, setDraftOrderedItems] = useState(items);
  const [activeItemId, setActiveItemId] = useState<string | null>(items[0]?.id || null);
  const [templateName, setTemplateName] = useState('');
  const [templateHint, setTemplateHint] = useState('');
  const [applyHint, setApplyHint] = useState('');
  const [batchFields, setBatchFields] = useState<BatchMetadataFields>(DEFAULT_BATCH_METADATA_FIELDS);
  const [batchShotCodeFields, setBatchShotCodeFields] = useState<BatchShotCodeFields>(DEFAULT_BATCH_SHOT_CODE_FIELDS);
  const [batchApplyMode, setBatchApplyMode] = useState<BatchApplyMode>('empty-only');
  const [templates, setTemplates] = useState<StoryboardExportTemplateEntry[]>(() => listStoryboardExportTemplates());
  const [templateFilter, setTemplateFilter] = useState<'all' | StoryboardExportStyle>('all');
  const [orderStatusState, setOrderStatusState] = useState<{ status: StoryboardOrderStatus; itemIdsSignature: string }>(() => ({
    status: { source: 'selection' },
    itemIdsSignature: items.map((item) => item.id).join('|'),
  }));
  const itemIdsSignature = useMemo(() => items.map((item) => item.id).join('|'), [items]);
  const orderedItems = useMemo(() => {
    if (draftOrderedItems.length === 0) {
      return items;
    }

    const incomingMap = new Map(items.map((item) => [item.id, item] as const));
    const draftIds = new Set(draftOrderedItems.map((item) => item.id));
    const preservedItems = draftOrderedItems
      .filter((item) => incomingMap.has(item.id))
      .map((draftItem) => {
        const incomingItem = incomingMap.get(draftItem.id) || draftItem;
        return {
          ...incomingItem,
          storyboardShotCode: draftItem.storyboardShotCode,
          storyboardSceneType: draftItem.storyboardSceneType,
          storyboardCameraMove: draftItem.storyboardCameraMove,
          storyboardDuration: draftItem.storyboardDuration,
          storyboardNote: draftItem.storyboardNote,
        };
      });
    const appendedItems = items.filter((item) => !draftIds.has(item.id));

    return [...preservedItems, ...appendedItems];
  }, [draftOrderedItems, items]);

  const orderStatus = orderStatusState.itemIdsSignature === itemIdsSignature
    ? orderStatusState.status
    : { source: 'selection' as const };

  useEffect(() => {
    persistStoryboardExportOptions(options);
  }, [options]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(orderedItems.map(async (item) => {
        if (!item.content) return [item.id, ''] as const;
        if (isImageRef(item.content)) {
          const url = await getImageBlobUrlWithLOD(item.content, 384);
          return [item.id, url || ''] as const;
        }
        return [item.id, item.content] as const;
      }));

      if (!cancelled) {
        setPreviewUrls(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderedItems]);

  const updateField = <K extends keyof StoryboardExportOptions>(key: K, value: StoryboardExportOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    if (options.lockCurrentOrder) return;
    setDraftOrderedItems(() => {
      const prev = orderedItems;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      setOrderStatusState({ status: { source: 'manual' }, itemIdsSignature });
      return next;
    });
  };

  const applyStoryboardShotOrder = () => {
    if (options.lockCurrentOrder) return;
    const nextItems = sortByStoryboardShotCode(orderedItems);
    setDraftOrderedItems(nextItems);
    setOrderStatusState({ status: { source: 'shot-code' }, itemIdsSignature });
  };

  const restoreSelectionOrder = () => {
    if (options.lockCurrentOrder) return;
    const nextItems = mergeWithSelectionOrder(orderedItems, items);
    setDraftOrderedItems(nextItems);
    setOrderStatusState({
      status: {
        source: 'selection',
        detail: '已恢复为当前画布选择顺序。',
      },
      itemIdsSignature,
    });
  };

  const handleAutofillMissingShotCodes = () => {
    if (options.lockCurrentOrder) return;
    const result = autofillMissingShotCodes(orderedItems);
    setDraftOrderedItems(result.items);

    if (result.filledCount > 0) {
      setApplyHint('当前补齐结果仅用于本次导出；如需写回画布，请点击"应用到画布"。');
    }

    setOrderStatusState({
      status: {
        source: 'autofill',
        detail: result.filledCount > 0
          ? `已自动补齐 ${result.filledCount} 个缺失镜头号，当前顺序保持不变。`
          : '当前镜头号已经完整，无需补齐。',
      },
      itemIdsSignature,
    });
  };

;

;

;

  const activeItem = orderedItems.find((item) => item.id === activeItemId) || orderedItems[0] || null;
  const resolvedActiveItemId = activeItem?.id || null;
  const orderStatusMeta = getOrderStatusMeta(orderStatus);
  const templateCountsByStyle = useMemo(() => {
    return exportStyleOptions.reduce((acc, item) => {
      acc[item.id] = templates.filter((template) => (template.value.exportStyle || 'classic') === item.id).length;
      return acc;
    }, {} as Record<StoryboardExportStyle, number>);
  }, [templates]);
  const filteredTemplates = useMemo(() => {
    if (templateFilter === 'all') return templates;
    return templates.filter((template) => (template.value.exportStyle || 'classic') === templateFilter);
  }, [templateFilter, templates]);
  const groupedTemplates = useMemo(() => {
    return exportStyleOptions
      .map((style) => ({
        style,
        templates: filteredTemplates.filter((template) => (template.value.exportStyle || 'classic') === style.id),
      }))
      .filter((group) => group.templates.length > 0);
  }, [filteredTemplates]);
  const validationById = useMemo(() => computeValidationById(orderedItems), [orderedItems]);
  const invalidItemCount = validationById.size;
  const activeItemValidation = activeItem ? validationById.get(activeItem.id) : undefined;
  const preflightSummary = useMemo(() => computePreflightSummary(orderedItems), [orderedItems]);
  const requiresStructuredStoryboardMeta = options.captionMode === 'storyboard-meta';
  const missingStructuredMetaCount = preflightSummary.missingShotCodeCount
    + preflightSummary.missingSceneTypeCount
    + preflightSummary.missingCameraMoveCount
    + preflightSummary.missingDurationCount;
  const issueItemIds = useMemo(() => computeIssueItemIds(orderedItems, validationById, requiresStructuredStoryboardMeta), [orderedItems, requiresStructuredStoryboardMeta, validationById]);
  const shouldBlockExport = invalidItemCount > 0 || (requiresStructuredStoryboardMeta && missingStructuredMetaCount > 0);
  const pendingCanvasApplyCount = useMemo(() => computePendingCanvasApplyCount(items, orderedItems), [items, orderedItems]);

  const updateActiveItemField = (
    key: 'storyboardShotCode' | 'storyboardSceneType' | 'storyboardCameraMove' | 'storyboardDuration' | 'storyboardNote',
    value: string,
  ) => {
    if (!activeItem) return;
    setDraftOrderedItems(() => {
      const prev = orderedItems;
      setApplyHint('当前编辑仅用于本次导出；如需写回画布，请点击“应用到画布”。');
      return prev.map((item) => item.id === activeItem.id ? { ...item, [key]: value } : item);
    });
  };

  const updateBatchField = (key: keyof BatchMetadataFields, value: string) => {
    setBatchFields((prev) => ({ ...prev, [key]: value }));
  };

  const updateBatchShotCodeField = <K extends keyof BatchShotCodeFields>(key: K, value: BatchShotCodeFields[K]) => {
    setBatchShotCodeFields((prev) => ({ ...prev, [key]: value }));
  };

  const applyBatchMetadata = () => {
    const hasBatchValue = Object.values(batchFields).some((value) => value.trim());
    if (!hasBatchValue) {
      setApplyHint('请至少填写一个批量字段后再应用。');
      return;
    }

    const result = applyBatchMetadataToItems(orderedItems, batchFields, batchApplyMode);
    setDraftOrderedItems(result.items);

    setApplyHint(
      result.affectedCount > 0
        ? `已批量更新 ${result.affectedCount} 个分镜，可继续微调后再导出或写回画布。`
        : batchApplyMode === 'empty-only'
          ? '没有可补齐的空白字段。'
          : '当前分镜字段已经与批量值一致。',
    );
  };

  const applyBatchShotCodes = () => {
    const result = applyBatchShotCodesToItems(orderedItems, batchShotCodeFields, batchApplyMode);
    setDraftOrderedItems(result.items);

    setApplyHint(
      result.affectedCount > 0
        ? `已批量生成 ${result.affectedCount} 个镜头号，可继续检查后导出或写回画布。`
        : batchApplyMode === 'empty-only'
          ? '当前没有可补齐镜头号的分镜。'
          : '镜头号已经与当前规则一致。',
    );
  };

  const jumpToIssue = (mode: 'first' | 'next') => {
    if (issueItemIds.length === 0) {
      setApplyHint('当前没有待修正的分镜项。');
      return;
    }

    const currentIndex = resolvedActiveItemId ? issueItemIds.indexOf(resolvedActiveItemId) : -1;
    const nextIndex = mode === 'first'
      ? 0
      : currentIndex >= 0
        ? (currentIndex + 1) % issueItemIds.length
        : 0;

    const nextId = issueItemIds[nextIndex];
    setActiveItemId(nextId);
    onLocateItem?.(nextId);
    setApplyHint(`已跳转到待修正分镜 ${nextIndex + 1} / ${issueItemIds.length}。`);
  };

  return (
    <div
      className="absolute right-4 top-20 bottom-4 z-[130] flex w-[360px] flex-col overflow-hidden workbench-panel-elevated rounded-[20px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 固定头部 */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <LayoutGrid size={15} />
            </div>
            <span>分镜表合成导出</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">
            将当前选中的 {selectedCount} 张图片合成为一张分镜表，并直接导出为 PNG。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all"
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>

      {/* 可滚动主体 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="grid grid-cols-3 gap-2.5">
        <label className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">列数</div>
          <input type="number" min={1} max={8} value={options.columns} onChange={(e) => updateField('columns', Number(e.target.value))} className="mt-1.5 w-full bg-transparent text-[15px] font-semibold text-slate-800 outline-none tabular-nums" />
        </label>
        <label className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">间距</div>
          <input type="number" min={0} max={120} value={options.gap} onChange={(e) => updateField('gap', Number(e.target.value))} className="mt-1.5 w-full bg-transparent text-[15px] font-semibold text-slate-800 outline-none tabular-nums" />
        </label>
        <label className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">边距</div>
          <input type="number" min={0} max={200} value={options.padding} onChange={(e) => updateField('padding', Number(e.target.value))} className="mt-1.5 w-full bg-transparent text-[15px] font-semibold text-slate-800 outline-none tabular-nums" />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">背景色</div>
          <input type="color" value={options.backgroundColor} onChange={(e) => updateField('backgroundColor', e.target.value)} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200/60 bg-white p-0.5" />
        </label>
        <label className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">文字色</div>
          <input type="color" value={options.textColor} onChange={(e) => updateField('textColor', e.target.value)} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200/60 bg-white p-0.5" />
        </label>
      </div>

      <label className="mt-3 block rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-3 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-sky-700">
          <span>导出文件名</span>
          <span className="text-sky-500">可手动覆盖</span>
        </div>
        <input
          type="text"
          value={options.suggestedFileName || ''}
          onChange={(e) => updateField('suggestedFileName', e.target.value)}
          placeholder="例如：镜头A 分镜表 6张"
          className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 placeholder:text-sky-300"
        />
      </label>

      <div className="mt-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-violet-700">
          <span>导出页眉信息</span>
          <span className="text-violet-500">项目名 / 日期 / 说明</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-violet-800">
          <input
            type="checkbox"
            checked={options.showHeader ?? false}
            onChange={(e) => {
              const checked = e.target.checked;
              updateField('showHeader', checked);
              if (checked && !(options.headerTitle || '').trim()) {
                updateField('headerTitle', options.suggestedFileName || '分镜表');
              }
            }}
            className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
          />
          <span>导出图顶部显示页眉</span>
        </label>
        {(options.showHeader ?? false) && (
          <div className="mt-3 grid gap-2">
            <label className="rounded-xl border border-violet-200 bg-white px-3 py-2">
              <div className="text-[10px] font-medium text-violet-500">页眉标题</div>
              <input
                type="text"
                value={options.headerTitle || ''}
                onChange={(e) => updateField('headerTitle', e.target.value)}
                placeholder="例如：项目 A 分镜表"
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-violet-300"
              />
            </label>
            <label className="rounded-xl border border-violet-200 bg-white px-3 py-2">
              <div className="text-[10px] font-medium text-violet-500">页眉副标题</div>
              <input
                type="text"
                value={options.headerSubtitle || ''}
                onChange={(e) => updateField('headerSubtitle', e.target.value)}
                placeholder="例如：2026-03-12 · 第一版审片"
                className="mt-1 w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-violet-300"
              />
            </label>
            <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] text-violet-700">
              页眉会显示在导出图顶部，适合补充项目名、日期或版本说明。
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/80 to-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-sky-700">
          <span>导出模板预设</span>
          <span className="text-sky-500">保存常用参数组合</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="例如：白底三列图文版"
            className="h-9 flex-1 rounded-xl border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 placeholder:text-sky-300"
          />
          <button
            type="button"
            onClick={() => {
              const next = saveStoryboardExportTemplate(templateName || '导出模板', options);
              setTemplates(next);
              setTemplateHint('已保存导出模板');
              setTemplateName('');
            }}
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
          >
            保存模板
          </button>
        </div>
        {templateHint && (
          <div className="mt-2 text-[11px] text-sky-600">{templateHint}</div>
        )}
        {templates.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTemplateFilter('all')}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${templateFilter === 'all' ? 'border-sky-200 bg-sky-100 text-sky-700' : 'border-sky-100 bg-white text-sky-600 hover:bg-sky-50'}`}
            >
              全部 · {templates.length}
            </button>
            {exportStyleOptions.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setTemplateFilter(style.id)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${templateFilter === style.id ? 'border-sky-200 bg-sky-100 text-sky-700' : 'border-sky-100 bg-white text-sky-600 hover:bg-sky-50'}`}
              >
                {style.label} · {templateCountsByStyle[style.id]}
              </button>
            ))}
          </div>
        )}
        {templates.length > 0 && (
          <div className="mt-3 rounded-xl border border-sky-100 bg-white/80 p-2">
            {groupedTemplates.length > 0 ? (
              <div className="space-y-2">
                {groupedTemplates.map((group) => (
                  <div key={group.style.id} className="rounded-xl border border-sky-100 bg-sky-50/40 p-2">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-sky-700">
                      <span>{group.style.label}</span>
                      <span className="text-sky-500">{group.templates.length} 个</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.templates.map((template) => (
                        <div key={template.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setOptions((prev) => ({
                                ...prev,
                                ...template.value,
                                suggestedFileName: prev.suggestedFileName,
                              }));
                              setTemplateHint(`已载入模板：${template.name}`);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-[11px] font-medium text-sky-800 hover:text-sky-900">{template.name}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">{getTemplateSummary(template)}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = deleteStoryboardExportTemplate(template.id);
                              setTemplates(next);
                              setTemplateHint(`已删除模板：${template.name}`);
                            }}
                            className="text-[11px] text-sky-500 hover:text-red-500"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-sky-100 bg-sky-50/50 px-3 py-3 text-[11px] text-sky-600">
                当前筛选下暂无模板，可先保存一个当前风格的模板。
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-3">
        <div className="mb-3 rounded-xl border border-slate-200/60 bg-white/80 p-2">
          <div className="mb-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <LayoutGrid size={12} /> 导出风格
          </div>
          <div className="grid gap-2">
            {exportStyleOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => updateField('exportStyle', item.id)}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${options.exportStyle === item.id ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="text-[12px] font-medium">{item.label}</div>
                <div className="mt-0.5 text-[10px] opacity-75">{item.description}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <Type size={12} /> 文案模式
        </div>
        <div className="grid grid-cols-2 gap-2">
          {captionOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => updateField('captionMode', item.id)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition-all ${
                options.captionMode === item.id
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={options.showNumbers}
            onChange={(e) => updateField('showNumbers', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span>显示序号角标</span>
        </label>

        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={options.lockCurrentOrder ?? false}
            onChange={(e) => updateField('lockCurrentOrder', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span>锁定当前排序</span>
        </label>
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-700">
        <div className="flex flex-wrap items-center gap-2">
          <span>导出会保持当前排序，并以浏览器保存或下载方式输出 PNG。</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${orderStatusMeta.badgeClassName}`}>
            {orderStatusMeta.badge}
          </span>
          {options.lockCurrentOrder && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
              已锁定
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] leading-5 text-sky-700/90">
          {orderStatusMeta.description}
          {options.lockCurrentOrder ? ' 当前排序已锁定，如需重排请先取消锁定。' : ' 可继续手动调整，也可一键按镜头号排序或补齐缺失编号。'}
        </div>
        <div className="mt-1 text-[11px] leading-5 text-sky-600/90">
          分镜字段编辑默认只作用于本次导出，不会实时改写画布数据。
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-emerald-700">
          <span>批量填写分镜字段</span>
          <span className="text-emerald-500">快速补齐景别 / 运镜 / 时长 / 备注</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-xl border border-emerald-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-emerald-500">景别</div>
            <input type="text" value={batchFields.storyboardSceneType} onChange={(e) => updateBatchField('storyboardSceneType', e.target.value)} placeholder="如：中景" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <label className="rounded-xl border border-emerald-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-emerald-500">运镜</div>
            <input type="text" value={batchFields.storyboardCameraMove} onChange={(e) => updateBatchField('storyboardCameraMove', e.target.value)} placeholder="如：推镜" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <label className="rounded-xl border border-emerald-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-emerald-500">时长</div>
            <input type="text" value={batchFields.storyboardDuration} onChange={(e) => updateBatchField('storyboardDuration', e.target.value)} placeholder="如：3s" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <label className="rounded-xl border border-emerald-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-emerald-500">备注</div>
            <input type="text" value={batchFields.storyboardNote} onChange={(e) => updateBatchField('storyboardNote', e.target.value)} placeholder="如：角色抬头" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-700">
            <button
              type="button"
              onClick={() => setBatchApplyMode('empty-only')}
              className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${batchApplyMode === 'empty-only' ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-emerald-100 bg-white text-emerald-600 hover:bg-emerald-50'}`}
            >
              仅填空缺
            </button>
            <button
              type="button"
              onClick={() => setBatchApplyMode('all')}
              className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${batchApplyMode === 'all' ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-emerald-100 bg-white text-emerald-600 hover:bg-emerald-50'}`}
            >
              覆盖全部
            </button>
          </div>
          <button
            type="button"
            onClick={applyBatchMetadata}
            disabled={isSubmitting}
            className="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            应用批量字段
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-violet-700">
          <span>批量整理镜头号</span>
          <span className="text-violet-500">统一前缀、起始编号和位数</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="rounded-xl border border-violet-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-violet-500">前缀</div>
            <input type="text" value={batchShotCodeFields.prefix} onChange={(e) => updateBatchShotCodeField('prefix', e.target.value.toUpperCase())} placeholder="A" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <label className="rounded-xl border border-violet-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-violet-500">起始编号</div>
            <input type="number" min={1} max={9999} value={batchShotCodeFields.startNumber} onChange={(e) => updateBatchShotCodeField('startNumber', Number(e.target.value))} className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <label className="rounded-xl border border-violet-100 bg-white px-2.5 py-2">
            <div className="text-[10px] font-medium text-violet-500">位数</div>
            <input type="number" min={2} max={6} value={batchShotCodeFields.digits} onChange={(e) => updateBatchShotCodeField('digits', Number(e.target.value))} className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-violet-700/90">
            示例：{(batchShotCodeFields.prefix || 'A').toUpperCase()}{String(Math.max(1, Math.round(batchShotCodeFields.startNumber || 1))).padStart(Math.max(2, Math.round(batchShotCodeFields.digits || 2)), '0')}
          </div>
          <button
            type="button"
            onClick={applyBatchShotCodes}
            disabled={isSubmitting}
            className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            生成镜头号
          </button>
        </div>
      </div>

      <StoryboardExportPreviewSection
        options={options}
        orderedItems={orderedItems}
        previewUrls={previewUrls}
        resolvedActiveItemId={resolvedActiveItemId}
        validationById={validationById}
        onActiveItemChange={setActiveItemId}
        onMoveItem={moveItem}
        onRestoreSelectionOrder={restoreSelectionOrder}
        onAutofillMissingShotCodes={handleAutofillMissingShotCodes}
        onApplyStoryboardShotOrder={applyStoryboardShotOrder}
      />

      {activeItem && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-amber-700">
            <span>分镜结构化字段</span>
            <span className="text-amber-500">当前：{activeItem.displayName || activeItem.annotationTitle || '未命名分镜'}</span>
          </div>
          {activeItemValidation && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              当前分镜有待修正字段，请先处理后再导出。
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={`rounded-xl border bg-white px-2.5 py-2 ${activeItemValidation?.shotCode ? 'border-rose-200 bg-rose-50/50' : 'border-amber-100'}`}>
              <div className="text-[10px] font-medium text-amber-500">镜头号</div>
              <input type="text" value={activeItem.storyboardShotCode || ''} onChange={(e) => updateActiveItemField('storyboardShotCode', e.target.value)} placeholder="如：A01" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
              {activeItemValidation?.shotCode && (
                <div className="mt-1 text-[10px] leading-4 text-rose-600">{activeItemValidation.shotCode}</div>
              )}
            </label>
            <label className="rounded-xl border border-amber-100 bg-white px-2.5 py-2">
              <div className="text-[10px] font-medium text-amber-500">景别</div>
              <input type="text" value={activeItem.storyboardSceneType || ''} onChange={(e) => updateActiveItemField('storyboardSceneType', e.target.value)} placeholder="如：中景" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
            </label>
            <label className="rounded-xl border border-amber-100 bg-white px-2.5 py-2">
              <div className="text-[10px] font-medium text-amber-500">运镜</div>
              <input type="text" value={activeItem.storyboardCameraMove || ''} onChange={(e) => updateActiveItemField('storyboardCameraMove', e.target.value)} placeholder="如：推镜" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
            </label>
            <label className={`rounded-xl border bg-white px-2.5 py-2 ${activeItemValidation?.duration ? 'border-rose-200 bg-rose-50/50' : 'border-amber-100'}`}>
              <div className="text-[10px] font-medium text-amber-500">时长</div>
              <input type="text" value={activeItem.storyboardDuration || ''} onChange={(e) => updateActiveItemField('storyboardDuration', e.target.value)} placeholder="如：3s" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
              {activeItemValidation?.duration && (
                <div className="mt-1 text-[10px] leading-4 text-rose-600">{activeItemValidation.duration}</div>
              )}
            </label>
            <label className="col-span-2 rounded-xl border border-amber-100 bg-white px-2.5 py-2">
              <div className="text-[10px] font-medium text-amber-500">备注</div>
              <input type="text" value={activeItem.storyboardNote || ''} onChange={(e) => updateActiveItemField('storyboardNote', e.target.value)} placeholder="如：角色转身看向镜头" className="mt-1 w-full bg-transparent text-sm text-slate-700 outline-none" />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-[11px] text-amber-700/80">
              {applyHint || '可先临时编辑导出内容，确认后再选择是否写回画布。'}
            </div>
            {onApplyToCanvas && (
              <button
                type="button"
                onClick={() => {
                  onApplyToCanvas(orderedItems);
                  setApplyHint('已将当前分镜字段写回画布。');
                }}
                disabled={pendingCanvasApplyCount === 0 || invalidItemCount > 0 || isSubmitting}
                className="shrink-0 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                应用到画布{pendingCanvasApplyCount > 0 ? ` (${pendingCanvasApplyCount})` : ''}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`mt-3 rounded-2xl border px-3 py-3 text-[11px] ${shouldBlockExport ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
        <div className="mb-2 flex items-center gap-2 font-medium">
          <AlertCircle size={14} />
          <span>导出前检查</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-current/15 bg-white/60 px-2.5 py-2">镜头号缺失：{preflightSummary.missingShotCodeCount}</div>
          <div className="rounded-xl border border-current/15 bg-white/60 px-2.5 py-2">景别缺失：{preflightSummary.missingSceneTypeCount}</div>
          <div className="rounded-xl border border-current/15 bg-white/60 px-2.5 py-2">运镜缺失：{preflightSummary.missingCameraMoveCount}</div>
          <div className="rounded-xl border border-current/15 bg-white/60 px-2.5 py-2">时长缺失：{preflightSummary.missingDurationCount}</div>
        </div>
        <div className="mt-2 leading-5">
          {invalidItemCount > 0
            ? `当前有 ${invalidItemCount} 个分镜存在格式错误，必须修正后才能导出。`
            : requiresStructuredStoryboardMeta && missingStructuredMetaCount > 0
              ? '当前使用“分镜字段”文案模式，镜头号 / 景别 / 运镜 / 时长需要补齐后才能导出。'
              : '当前导出内容已通过基础检查，可以直接导出。'}
        </div>
        {!requiresStructuredStoryboardMeta && (preflightSummary.missingShotCodeCount > 0 || preflightSummary.missingSceneTypeCount > 0 || preflightSummary.missingCameraMoveCount > 0 || preflightSummary.missingDurationCount > 0) && (
          <div className="mt-1 leading-5 opacity-90">
            当前不是“分镜字段”文案模式，因此缺失字段不会阻断导出，但建议先补齐以便后续归档和复用。
          </div>
        )}
        {issueItemIds.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => jumpToIssue('first')}
              className="rounded-xl border border-current/20 bg-white/70 px-3 py-2 font-medium hover:bg-white"
            >
              跳到第一个问题项
            </button>
            <button
              type="button"
              onClick={() => jumpToIssue('next')}
              className="rounded-xl border border-current/20 bg-white/70 px-3 py-2 font-medium hover:bg-white"
            >
              跳到下一个问题项
            </button>
            <span className="text-[10px] opacity-80">共 {issueItemIds.length} 个待修正分镜</span>
          </div>
        )}
      </div>

      {invalidItemCount > 0 && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          有 {invalidItemCount} 个分镜的镜头号或时长格式待修正。修正后才可导出。
        </div>
      )}

      <div className="mt-3 space-y-2">
        {isSubmitting && submitStatusText && (
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-700">
            {submitStatusText}
          </div>
        )}
      </div>
      </div>

      {/* 固定底部 */}
      <div className="shrink-0 border-t border-slate-100 bg-white/90 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={isSubmitting && onCancelSubmit ? onCancelSubmit : onClose} className="rounded-xl border border-slate-200/60 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">{isSubmitting ? '取消任务' : '取消'}</button>
          <button type="button" onClick={() => onSubmit(options, orderedItems)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-sky-500/20 hover:from-sky-700 hover:to-sky-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 transition-all" disabled={isSubmitting || shouldBlockExport}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>{isSubmitting ? '导出中...' : '导出分镜表'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
