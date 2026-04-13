/**
 * storyboard-export-panel-utils.ts — StoryboardExportPanel 纯计算逻辑
 *
 * 从 StoryboardExportPanel.tsx 中提取的纯函数和常量，
 * 便于独立测试和复用。
 */

import type { StoryboardCaptionMode, StoryboardExportStyle } from '@/lib/storyboard-export';
import type { StoryboardExportTemplateEntry } from '@/lib/storyboard-export-presets';
import { getStoryboardShotSortTuple, parseStoryboardShotCode, validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';

// ── Re-exported types ────────────────────────────────────────

export interface StoryboardExportPreviewItem {
    id: string;
    content: string;
    displayName?: string;
    prompt?: string;
    annotationTitle?: string;
    annotationNote?: string;
    storyboardShotCode?: string;
    storyboardSceneType?: string;
    storyboardCameraMove?: string;
    storyboardDuration?: string;
    storyboardNote?: string;
}

export type StoryboardOrderSource = 'selection' | 'manual' | 'shot-code' | 'autofill';

export interface StoryboardOrderStatus {
    source: StoryboardOrderSource;
    detail?: string;
}

export interface StoryboardFieldValidation {
    shotCode?: string;
    duration?: string;
}

export type BatchMetadataFields = {
    storyboardSceneType: string;
    storyboardCameraMove: string;
    storyboardDuration: string;
    storyboardNote: string;
};

export type BatchApplyMode = 'all' | 'empty-only';

export type BatchShotCodeFields = {
    prefix: string;
    startNumber: number;
    digits: number;
};

export type StoryboardPreflightSummary = {
    missingShotCodeCount: number;
    missingSceneTypeCount: number;
    missingCameraMoveCount: number;
    missingDurationCount: number;
    missingNoteCount: number;
};

// ── Constants ────────────────────────────────────────────────

export const captionOptions: Array<{ id: StoryboardCaptionMode; label: string }> = [
    { id: 'none', label: '无文案' },
    { id: 'display-name', label: '图层名' },
    { id: 'prompt', label: '提示词' },
    { id: 'annotation-title', label: '标注标题' },
    { id: 'annotation-note', label: '标注备注' },
    { id: 'annotation-full', label: '标题 + 备注' },
    { id: 'storyboard-meta', label: '分镜字段' },
];

export const exportStyleOptions: Array<{ id: StoryboardExportStyle; label: string; description: string }> = [
    { id: 'classic', label: '经典卡片', description: '白底信息卡，适合常规分镜表' },
    { id: 'cinema', label: '电影暗板', description: '深色电影感，更像审片板' },
    { id: 'worksheet', label: '制片表单', description: '边框更明确，适合打印批注' },
];

export const DEFAULT_BATCH_METADATA_FIELDS: BatchMetadataFields = {
    storyboardSceneType: '',
    storyboardCameraMove: '',
    storyboardDuration: '',
    storyboardNote: '',
};

export const DEFAULT_BATCH_SHOT_CODE_FIELDS: BatchShotCodeFields = {
    prefix: 'A',
    startNumber: 1,
    digits: 2,
};

// ── Pure display helpers ─────────────────────────────────────

export function getOrderStatusMeta(status: StoryboardOrderStatus) {
    switch (status.source) {
        case 'manual':
            return {
                badge: '手动调整',
                badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
                description: status.detail || '当前顺序已按你的拖动微调结果排列。',
            };
        case 'shot-code':
            return {
                badge: '镜头号排序',
                badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                description: status.detail || '当前顺序已按镜头号重新排序。',
            };
        case 'autofill':
            return {
                badge: '补齐编号后',
                badgeClassName: 'border-violet-200 bg-violet-50 text-violet-700',
                description: status.detail || '已补齐缺失镜头号，当前导出顺序保持不变。',
            };
        case 'selection':
        default:
            return {
                badge: '当前选择顺序',
                badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700',
                description: status.detail || '当前顺序跟随画布中的选择结果。',
            };
    }
}

export function getCaptionOptionLabel(mode?: StoryboardCaptionMode) {
    return captionOptions.find((item) => item.id === mode)?.label || '图层名';
}

export function getTemplateSummary(template: StoryboardExportTemplateEntry) {
    const parts = [
        getCaptionOptionLabel(template.value.captionMode),
        `${template.value.columns || 3} 列`,
    ];

    if (template.value.showHeader) {
        parts.push('含页眉');
    }

    return parts.join(' · ');
}

export function getCaptionByMode(item: StoryboardExportPreviewItem, captionMode: StoryboardCaptionMode) {
    switch (captionMode) {
        case 'display-name':
            return item.displayName || item.annotationTitle || item.prompt || '';
        case 'prompt':
            return item.prompt || '';
        case 'annotation-title':
            return item.annotationTitle || '';
        case 'annotation-note':
            return item.annotationNote || '';
        case 'annotation-full': {
            const parts = [item.annotationTitle, item.annotationNote].map((part) => (part || '').trim()).filter(Boolean);
            return parts.join(' · ');
        }
        case 'storyboard-meta': {
            const parts = [
                item.storyboardShotCode,
                item.storyboardSceneType,
                item.storyboardCameraMove,
                item.storyboardDuration ? `${item.storyboardDuration}` : '',
                item.storyboardNote,
            ].map((part) => (part || '').trim()).filter(Boolean);
            return parts.join(' · ');
        }
        case 'none':
        default:
            return '';
    }
}

export function getStoryboardMetaTitle(item: StoryboardExportPreviewItem) {
    return item.displayName || item.annotationTitle || item.prompt || '未命名分镜';
}

export function getStoryboardMetaNote(item: StoryboardExportPreviewItem) {
    return item.storyboardNote || item.annotationNote || '暂无备注';
}

// ── Pure ordering / mutation kernels ─────────────────────────

export function sortByStoryboardShotCode(items: StoryboardExportPreviewItem[]): StoryboardExportPreviewItem[] {
    return [...items].sort((a, b) => {
        const tupleA = getStoryboardShotSortTuple(a.storyboardShotCode, a.displayName || a.annotationTitle || a.prompt || '');
        const tupleB = getStoryboardShotSortTuple(b.storyboardShotCode, b.displayName || b.annotationTitle || b.prompt || '');
        if (tupleA[0] !== tupleB[0]) return tupleA[0] - tupleB[0];
        if (tupleA[1] !== tupleB[1]) return tupleA[1].localeCompare(tupleB[1], 'zh-CN');
        if (tupleA[2] !== tupleB[2]) return tupleA[2] - tupleB[2];
        return tupleA[3].localeCompare(tupleB[3], 'zh-CN');
    });
}

export function mergeWithSelectionOrder(
    draftItems: StoryboardExportPreviewItem[],
    selectionItems: StoryboardExportPreviewItem[],
): StoryboardExportPreviewItem[] {
    const currentMap = new Map(draftItems.map((item) => [item.id, item] as const));
    return selectionItems.map((item) => currentMap.get(item.id) || item);
}

export interface AutofillShotCodesResult {
    items: StoryboardExportPreviewItem[];
    filledCount: number;
}

export function autofillMissingShotCodes(items: StoryboardExportPreviewItem[]): AutofillShotCodesResult {
    const parsedShotCodes = items
        .map((item) => parseStoryboardShotCode(item.storyboardShotCode))
        .filter((item): item is NonNullable<ReturnType<typeof parseStoryboardShotCode>> => !!item);

    const preferredPrefix = parsedShotCodes[0]?.prefix || 'A';
    const preferredDigits = Math.max(2, ...parsedShotCodes.map((item) => item.digits));
    const usedNumbers = new Set(
        parsedShotCodes
            .filter((item) => item.prefix === preferredPrefix && !item.suffix)
            .map((item) => item.number),
    );

    let nextNumber = parsedShotCodes
        .filter((item) => item.prefix === preferredPrefix && !item.suffix)
        .reduce((max, item) => Math.max(max, item.number), 0);

    let filledCount = 0;
    const nextItems = items.map((item) => {
        if (item.storyboardShotCode?.trim()) {
            return item;
        }

        do {
            nextNumber += 1;
        } while (usedNumbers.has(nextNumber));

        usedNumbers.add(nextNumber);
        filledCount += 1;
        return {
            ...item,
            storyboardShotCode: `${preferredPrefix}${String(nextNumber).padStart(preferredDigits, '0')}`,
        };
    });

    return { items: nextItems, filledCount };
}

export interface BatchApplyResult {
    items: StoryboardExportPreviewItem[];
    affectedCount: number;
}

export function applyBatchMetadataToItems(
    items: StoryboardExportPreviewItem[],
    fields: BatchMetadataFields,
    mode: BatchApplyMode,
): BatchApplyResult {
    let affectedCount = 0;

    const nextItems = items.map((item) => {
        const nextItem = { ...item };
        let changed = false;

        (Object.entries(fields) as Array<[keyof BatchMetadataFields, string]>).forEach(([key, value]) => {
            const normalizedValue = value.trim();
            if (!normalizedValue) return;
            const currentValue = (item[key] || '').trim();
            if (mode === 'empty-only' && currentValue) return;
            if (currentValue === normalizedValue) return;
            nextItem[key] = normalizedValue;
            changed = true;
        });

        if (changed) {
            affectedCount += 1;
            return nextItem;
        }

        return item;
    });

    return { items: nextItems, affectedCount };
}

export function applyBatchShotCodesToItems(
    items: StoryboardExportPreviewItem[],
    fields: BatchShotCodeFields,
    mode: BatchApplyMode,
): BatchApplyResult {
    const prefix = (fields.prefix || 'A').trim().toUpperCase();
    const digits = Math.max(2, Math.min(6, Math.round(fields.digits || 2)));
    let nextNumber = Math.max(1, Math.round(fields.startNumber || 1));
    let affectedCount = 0;

    const nextItems = items.map((item) => {
        const currentShotCode = item.storyboardShotCode?.trim() || '';
        if (mode === 'empty-only' && currentShotCode) {
            return item;
        }

        const nextShotCode = `${prefix}${String(nextNumber).padStart(digits, '0')}`;
        nextNumber += 1;

        if (currentShotCode === nextShotCode) {
            return item;
        }

        affectedCount += 1;
        return {
            ...item,
            storyboardShotCode: nextShotCode,
        };
    });

    return { items: nextItems, affectedCount };
}

// ── Pure validation / summary computations ───────────────────

export function computeValidationById(
    items: StoryboardExportPreviewItem[],
): Map<string, StoryboardFieldValidation> {
    const next = new Map<string, StoryboardFieldValidation>();
    items.forEach((item) => {
        const validation: StoryboardFieldValidation = {};
        const shotCodeError = validateStoryboardShotCode(item.storyboardShotCode);
        const durationError = validateStoryboardDuration(item.storyboardDuration);
        if (shotCodeError) validation.shotCode = shotCodeError;
        if (durationError) validation.duration = durationError;
        if (validation.shotCode || validation.duration) {
            next.set(item.id, validation);
        }
    });
    return next;
}

export function computePreflightSummary(items: StoryboardExportPreviewItem[]): StoryboardPreflightSummary {
    return items.reduce<StoryboardPreflightSummary>((summary, item) => {
        if (!item.storyboardShotCode?.trim()) summary.missingShotCodeCount += 1;
        if (!item.storyboardSceneType?.trim()) summary.missingSceneTypeCount += 1;
        if (!item.storyboardCameraMove?.trim()) summary.missingCameraMoveCount += 1;
        if (!item.storyboardDuration?.trim()) summary.missingDurationCount += 1;
        if (!item.storyboardNote?.trim()) summary.missingNoteCount += 1;
        return summary;
    }, {
        missingShotCodeCount: 0,
        missingSceneTypeCount: 0,
        missingCameraMoveCount: 0,
        missingDurationCount: 0,
        missingNoteCount: 0,
    });
}

export function computePendingCanvasApplyCount(
    sourceItems: StoryboardExportPreviewItem[],
    orderedItems: StoryboardExportPreviewItem[],
): number {
    const sourceMap = new Map(sourceItems.map((item) => [item.id, item] as const));
    return orderedItems.reduce((count, item) => {
        const source = sourceMap.get(item.id);
        if (!source) return count;

        const changed = [
            'storyboardShotCode',
            'storyboardSceneType',
            'storyboardCameraMove',
            'storyboardDuration',
            'storyboardNote',
        ].some((key) =>
            ((source[key as keyof StoryboardExportPreviewItem] as string | undefined) || '').trim()
            !== ((item[key as keyof StoryboardExportPreviewItem] as string | undefined) || '').trim(),
        );

        return changed ? count + 1 : count;
    }, 0);
}

export function computeIssueItemIds(
    items: StoryboardExportPreviewItem[],
    validationById: Map<string, StoryboardFieldValidation>,
    requiresStructuredMeta: boolean,
): string[] {
    return items
        .filter((item) => {
            const hasInvalid = validationById.has(item.id);
            const missingRequired = requiresStructuredMeta
                ? !item.storyboardShotCode?.trim() || !item.storyboardSceneType?.trim() || !item.storyboardCameraMove?.trim() || !item.storyboardDuration?.trim()
                : false;
            return hasInvalid || missingRequired;
        })
        .map((item) => item.id);
}

// ── Preview theme resolution ─────────────────────────────────

export interface PreviewTheme {
    panelBg: string;
    cardBg: string;
    cardBorder: string;
    headerBg: string;
    headerText: string;
    headerSubtle: string;
    fieldBg: string;
    fieldBorder: string;
    fieldTitle: string;
    fieldText: string;
    noteBg: string;
    noteBorder: string;
    noteTitle: string;
}

export function resolvePreviewTheme(style: StoryboardExportStyle | undefined, backgroundColor: string): PreviewTheme {
    switch (style) {
        case 'cinema':
            return {
                panelBg: '#020617',
                cardBg: 'rgba(15,23,42,0.98)',
                cardBorder: 'rgba(148,163,184,0.18)',
                headerBg: '#020617',
                headerText: 'text-slate-50',
                headerSubtle: 'text-sky-200',
                fieldBg: 'bg-slate-900/90',
                fieldBorder: 'border-slate-700/80',
                fieldTitle: 'text-slate-400',
                fieldText: 'text-slate-100',
                noteBg: 'bg-slate-800/90',
                noteBorder: 'border-sky-900/70',
                noteTitle: 'text-sky-300',
            };
        case 'worksheet':
            return {
                panelBg: '#f8fafc',
                cardBg: '#ffffff',
                cardBorder: 'rgba(15,23,42,0.18)',
                headerBg: '#e2e8f0',
                headerText: 'text-slate-900',
                headerSubtle: 'text-slate-600',
                fieldBg: 'bg-white',
                fieldBorder: 'border-slate-300',
                fieldTitle: 'text-slate-500',
                fieldText: 'text-slate-800',
                noteBg: 'bg-white',
                noteBorder: 'border-slate-300',
                noteTitle: 'text-slate-600',
            };
        case 'classic':
        default:
            return {
                panelBg: backgroundColor,
                cardBg: 'rgba(255,255,255,0.95)',
                cardBorder: 'rgba(15,23,42,0.05)',
                headerBg: '#0f172a',
                headerText: 'text-white',
                headerSubtle: 'text-sky-200',
                fieldBg: 'bg-slate-50',
                fieldBorder: 'border-slate-200',
                fieldTitle: 'text-slate-400',
                fieldText: 'text-slate-700',
                noteBg: 'bg-amber-50/80',
                noteBorder: 'border-amber-100',
                noteTitle: 'text-amber-500',
            };
    }
}
