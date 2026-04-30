import React, { useId, useMemo } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpDown } from 'lucide-react';
import type { StoryboardExportOptions } from '@/lib/storyboard-export';
import {
    type StoryboardExportPreviewItem,
    type StoryboardFieldValidation,
    getCaptionByMode,
    getStoryboardMetaTitle,
    getStoryboardMetaNote,
    resolvePreviewTheme,
} from './storyboard-export-panel-utils';

const GRID_COLUMN_CLASSES = [
    'grid-cols-1',
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-5',
    'grid-cols-6',
    'grid-cols-7',
    'grid-cols-8',
];

function sanitizePreviewCssColor(value: string | undefined, fallback: string) {
    const color = value?.trim();
    if (!color) return fallback;
    if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
    if (/^rgba?\([0-9.,%\s]+\)$/i.test(color)) return color;
    if (/^hsla?\([0-9.,%\s]+\)$/i.test(color)) return color;
    return fallback;
}

interface StoryboardExportPreviewSectionProps {
    options: StoryboardExportOptions;
    orderedItems: StoryboardExportPreviewItem[];
    previewUrls: Record<string, string>;
    resolvedActiveItemId: string | null;
    validationById: Map<string, StoryboardFieldValidation>;
    onActiveItemChange: (id: string) => void;
    onMoveItem: (index: number, direction: -1 | 1) => void;
    onRestoreSelectionOrder: () => void;
    onAutofillMissingShotCodes: () => void;
    onApplyStoryboardShotOrder: () => void;
}

export function StoryboardExportPreviewSection({
    options,
    orderedItems,
    previewUrls,
    resolvedActiveItemId,
    validationById,
    onActiveItemChange,
    onMoveItem,
    onRestoreSelectionOrder,
    onAutofillMissingShotCodes,
    onApplyStoryboardShotOrder,
}: StoryboardExportPreviewSectionProps) {
    const reactId = useId();
    const previewClassName = useMemo(() => `storyboard-export-preview-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId]);
    const safeBackgroundColor = sanitizePreviewCssColor(options.backgroundColor, '#ffffff');
    const safeTextColor = sanitizePreviewCssColor(options.textColor, '#334155');
    const previewTheme = useMemo(() => resolvePreviewTheme(options.exportStyle, safeBackgroundColor), [safeBackgroundColor, options.exportStyle]);
    const previewItems = useMemo(() => orderedItems.slice(0, 8), [orderedItems]);
    const previewColumns = Math.max(1, Math.min(options.columns, orderedItems.length || 1));
    const previewGridClassName = GRID_COLUMN_CLASSES[previewColumns - 1] || 'grid-cols-1';
    const previewCss = useMemo(() => `
.${previewClassName} .storyboard-export-preview-panel { background-color: ${previewTheme.panelBg}; }
.${previewClassName} .storyboard-export-preview-card { background-color: ${previewTheme.cardBg}; border-color: ${previewTheme.cardBorder}; }
.${previewClassName} .storyboard-export-preview-card-active { border-color: #7dd3fc; }
.${previewClassName} .storyboard-export-preview-card-invalid { border-color: #fda4af; }
.${previewClassName} .storyboard-export-preview-header { background-color: ${previewTheme.headerBg}; }
.${previewClassName} .storyboard-export-preview-text { color: ${safeTextColor}; }
`, [previewClassName, previewTheme.cardBg, previewTheme.cardBorder, previewTheme.headerBg, previewTheme.panelBg, safeTextColor]);

    return (
        <div className={`${previewClassName} mt-3 rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3`}>
            <style>{previewCss}</style>
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>导出预览</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onRestoreSelectionOrder}
                        disabled={!!options.lockCurrentOrder}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="恢复为当前画布中的选择顺序"
                    >
                        <span>恢复选择顺序</span>
                    </button>
                    <button
                        type="button"
                        onClick={onAutofillMissingShotCodes}
                        disabled={!!options.lockCurrentOrder}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="按当前导出顺序自动补齐缺失的镜头号"
                    >
                        <span>补齐缺失镜头号</span>
                    </button>
                    <button
                        type="button"
                        onClick={onApplyStoryboardShotOrder}
                        disabled={!!options.lockCurrentOrder}
                        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-medium text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="按镜头号排序并应用到当前导出顺序"
                    >
                        <ArrowUpDown size={11} />
                        <span>按镜头号排序</span>
                    </button>
                    <span>{previewItems.length} / {orderedItems.length}</span>
                </div>
            </div>
            <div className="storyboard-export-preview-panel rounded-xl border border-white/80 p-3">
                {(options.showHeader ?? false) && ((options.headerTitle || '').trim() || (options.headerSubtitle || '').trim()) && (
                    <div className={`mb-3 rounded-2xl border px-4 py-3 ${options.exportStyle === 'cinema' ? 'border-slate-700/70 bg-slate-950/80' : options.exportStyle === 'worksheet' ? 'border-slate-300 bg-white' : 'border-slate-200 bg-white/90'}`}>
                        <div className={`text-sm font-semibold ${options.exportStyle === 'cinema' ? 'text-slate-50' : 'text-slate-900'}`}>
                            {options.headerTitle || options.suggestedFileName || '分镜表'}
                        </div>
                        {(options.headerSubtitle || '').trim() && (
                            <div className={`mt-1 text-[11px] ${options.exportStyle === 'cinema' ? 'text-slate-300' : 'text-slate-500'}`}>
                                {options.headerSubtitle}
                            </div>
                        )}
                    </div>
                )}
                <div className={`grid gap-3 ${previewGridClassName}`}>
                    {previewItems.map((item, index) => {
                        const isStoryboardMetaMode = options.captionMode === 'storyboard-meta';
                        const metaTitle = getStoryboardMetaTitle(item);
                        const metaNote = getStoryboardMetaNote(item);

                        return (
                            <div key={item.id} className={`storyboard-export-preview-card overflow-hidden rounded-[18px] border shadow-sm transition-all ${resolvedActiveItemId === item.id ? 'storyboard-export-preview-card-active border-sky-300 shadow-[0_0_0_1px_rgba(125,211,252,0.5),0_12px_32px_rgba(14,165,233,0.16)]' : ''} ${validationById.has(item.id) ? 'storyboard-export-preview-card-invalid ring-1 ring-rose-200' : ''}`}>
                                {isStoryboardMetaMode && (
                                    <div className="storyboard-export-preview-header flex items-center justify-between gap-2 px-3 py-2">
                                        <div className="min-w-0">
                                            <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${previewTheme.headerSubtle}`}>
                                                {item.storyboardShotCode || `SHOT ${index + 1}`}
                                            </div>
                                            <div className={`truncate text-[11px] font-medium ${previewTheme.headerText}`}>{metaTitle}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {validationById.has(item.id) && (
                                                <div className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-1 text-[10px] font-medium text-rose-100 ring-1 ring-rose-200/20">
                                                    <AlertCircle size={10} />
                                                    <span>需校验</span>
                                                </div>
                                            )}
                                            {options.showNumbers && (
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 text-[11px] font-semibold text-white ring-1 ring-white/10">
                                                    {index + 1}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div
                                    className={`relative overflow-hidden bg-slate-100 ${isStoryboardMetaMode ? 'aspect-[4/3]' : `aspect-[4/3] ${resolvedActiveItemId === item.id ? 'ring-2 ring-sky-300' : ''}`}`}
                                    onClick={() => onActiveItemChange(item.id)}
                                >
                                    {previewUrls[item.id] ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={previewUrls[item.id]} alt={`preview-${index + 1}`} className="h-full w-full object-contain" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-[11px] text-slate-400">载入中</div>
                                    )}
                                    {!isStoryboardMetaMode && options.showNumbers && (
                                        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                                            {index + 1}
                                        </div>
                                    )}
                                    <div className="absolute right-2 top-2 flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => onMoveItem(index, -1)}
                                            disabled={index === 0 || !!options.lockCurrentOrder}
                                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                            title="前移"
                                        >
                                            <ArrowLeft size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onMoveItem(index, 1)}
                                            disabled={index === orderedItems.length - 1 || !!options.lockCurrentOrder}
                                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                            title="后移"
                                        >
                                            <ArrowRight size={12} />
                                        </button>
                                    </div>
                                </div>

                                {isStoryboardMetaMode ? (
                                    <div className="space-y-2 border-t border-slate-100 bg-gradient-to-br from-white via-slate-50 to-amber-50/60 px-3 py-3">
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className={`rounded-xl border px-2.5 py-2 ${previewTheme.fieldBg} ${previewTheme.fieldBorder}`}>
                                                <div className={`text-[10px] font-medium ${previewTheme.fieldTitle}`}>景别</div>
                                                <div className={`mt-1 truncate text-[11px] font-semibold ${previewTheme.fieldText}`}>{item.storyboardSceneType || '未填写'}</div>
                                            </div>
                                            <div className={`rounded-xl border px-2.5 py-2 ${previewTheme.fieldBg} ${previewTheme.fieldBorder}`}>
                                                <div className={`text-[10px] font-medium ${previewTheme.fieldTitle}`}>运镜</div>
                                                <div className={`mt-1 truncate text-[11px] font-semibold ${previewTheme.fieldText}`}>{item.storyboardCameraMove || '未填写'}</div>
                                            </div>
                                            <div className={`rounded-xl border px-2.5 py-2 ${previewTheme.fieldBg} ${previewTheme.fieldBorder}`}>
                                                <div className={`text-[10px] font-medium ${previewTheme.fieldTitle}`}>时长</div>
                                                <div className={`mt-1 truncate text-[11px] font-semibold ${previewTheme.fieldText}`}>{item.storyboardDuration || '未填写'}</div>
                                            </div>
                                        </div>
                                        <div className={`rounded-xl border px-2.5 py-2 ${previewTheme.noteBg} ${previewTheme.noteBorder}`}>
                                            <div className={`text-[10px] font-medium ${previewTheme.noteTitle}`}>备注</div>
                                            <div className="storyboard-export-preview-text mt-1 line-clamp-2 text-[11px] leading-5">
                                                {metaNote}
                                            </div>
                                        </div>
                                    </div>
                                ) : options.captionMode !== 'none' && (
                                    <div className="storyboard-export-preview-text px-3 py-2 text-[11px]">
                                        {getCaptionByMode(item, options.captionMode).trim() || '无文案'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
