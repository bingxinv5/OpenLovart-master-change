import React from 'react';
import {
    ArrowDown,
    ArrowUp,
    ChevronsDown,
    ChevronsUp,
    Eye,
    EyeOff,
    LayoutGrid,
    Lock,
    Pencil,
    Trash2,
    Type,
    Unlock,
} from 'lucide-react';
import type { StoryboardMetaTemplateEntry } from '@/lib/storyboard-meta-presets';

interface LayerBulkOperationsProps {
    selectedIds: string[];
    selectedParentSummary: string;
    selectedHidden: boolean;
    selectedLocked: boolean;
    bulkRenameTargetsCount: number;
    bulkStoryboardTargetsCount: number;
    bulkRenameOpen: boolean;
    bulkRenameValue: string;
    bulkRenameStart: number;
    bulkStoryboardOpen: boolean;
    bulkStoryboardPrefix: string;
    bulkStoryboardStart: number;
    bulkStoryboardDigits: number;
    bulkStoryboardStep: number;
    bulkStoryboardSkipExisting: boolean;
    bulkStoryboardAvoidExistingNumbers: boolean;
    bulkStoryboardPrefixError: string | null;
    bulkStoryboardMetaOpen: boolean;
    bulkStoryboardSceneType: string;
    bulkStoryboardCameraMove: string;
    bulkStoryboardDuration: string;
    bulkStoryboardNote: string;
    bulkStoryboardDurationError: string | null;
    storyboardTemplateName: string;
    storyboardTemplateHint: string;
    storyboardTemplates: StoryboardMetaTemplateEntry[];
    onOpenBulkRenamePanel: () => void;
    onOpenBulkStoryboardNumberingPanel: () => void;
    onOpenBulkStoryboardMetaPanel: () => void;
    onCommitBulkRename: () => void;
    onCommitBulkStoryboardNumbering: () => void;
    onCommitBulkStoryboardMeta: () => void;
    onCancelBulkRename: () => void;
    onCancelBulkStoryboardNumbering: () => void;
    onCancelBulkStoryboardMeta: () => void;
    onSaveStoryboardTemplate: () => void;
    onLoadStoryboardTemplate: (template: StoryboardMetaTemplateEntry) => void;
    onDeleteStoryboardTemplate: (template: StoryboardMetaTemplateEntry) => void;
    onBulkRenameValueChange: (value: string) => void;
    onBulkRenameStartChange: (value: number) => void;
    onBulkStoryboardPrefixChange: (value: string) => void;
    onBulkStoryboardStartChange: (value: number) => void;
    onBulkStoryboardDigitsChange: (value: number) => void;
    onBulkStoryboardStepChange: (value: number) => void;
    onBulkStoryboardSkipExistingChange: (value: boolean) => void;
    onBulkStoryboardAvoidExistingNumbersChange: (value: boolean) => void;
    onBulkStoryboardSceneTypeChange: (value: string) => void;
    onBulkStoryboardCameraMoveChange: (value: string) => void;
    onBulkStoryboardDurationChange: (value: string) => void;
    onBulkStoryboardNoteChange: (value: string) => void;
    onStoryboardTemplateNameChange: (value: string) => void;
    onToggleHidden: (ids: string[]) => void;
    onToggleLocked: (ids: string[]) => void;
    onMoveLayerToParent: (ids: string[], parentId?: string) => void;
    onBringForward: (ids: string[]) => void;
    onSendBackward: (ids: string[]) => void;
    onBringToFront: (ids: string[]) => void;
    onSendToBack: (ids: string[]) => void;
    onDeleteSelection: (ids: string[]) => void;
}

export function LayerBulkOperations({
    selectedIds,
    selectedParentSummary,
    selectedHidden,
    selectedLocked,
    bulkRenameTargetsCount,
    bulkStoryboardTargetsCount,
    bulkRenameOpen,
    bulkRenameValue,
    bulkRenameStart,
    bulkStoryboardOpen,
    bulkStoryboardPrefix,
    bulkStoryboardStart,
    bulkStoryboardDigits,
    bulkStoryboardStep,
    bulkStoryboardSkipExisting,
    bulkStoryboardAvoidExistingNumbers,
    bulkStoryboardPrefixError,
    bulkStoryboardMetaOpen,
    bulkStoryboardSceneType,
    bulkStoryboardCameraMove,
    bulkStoryboardDuration,
    bulkStoryboardNote,
    bulkStoryboardDurationError,
    storyboardTemplateName,
    storyboardTemplateHint,
    storyboardTemplates,
    onOpenBulkRenamePanel,
    onOpenBulkStoryboardNumberingPanel,
    onOpenBulkStoryboardMetaPanel,
    onCommitBulkRename,
    onCommitBulkStoryboardNumbering,
    onCommitBulkStoryboardMeta,
    onCancelBulkRename,
    onCancelBulkStoryboardNumbering,
    onCancelBulkStoryboardMeta,
    onSaveStoryboardTemplate,
    onLoadStoryboardTemplate,
    onDeleteStoryboardTemplate,
    onBulkRenameValueChange,
    onBulkRenameStartChange,
    onBulkStoryboardPrefixChange,
    onBulkStoryboardStartChange,
    onBulkStoryboardDigitsChange,
    onBulkStoryboardStepChange,
    onBulkStoryboardSkipExistingChange,
    onBulkStoryboardAvoidExistingNumbersChange,
    onBulkStoryboardSceneTypeChange,
    onBulkStoryboardCameraMoveChange,
    onBulkStoryboardDurationChange,
    onBulkStoryboardNoteChange,
    onStoryboardTemplateNameChange,
    onToggleHidden,
    onToggleLocked,
    onMoveLayerToParent,
    onBringForward,
    onSendBackward,
    onBringToFront,
    onSendToBack,
    onDeleteSelection,
}: LayerBulkOperationsProps) {
    return (
        <>
            <div className="mb-2 flex items-center justify-between text-[12px] text-slate-600">
                <span>已选 {selectedIds.length} 个图层</span>
                <span className="font-medium">批量操作</span>
            </div>
            <div className="mb-2 text-[12px] text-slate-500">{selectedParentSummary}</div>

            <div className="mb-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-violet-50 to-white p-2.5 shadow-sm">
                {bulkRenameOpen ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-medium text-blue-700">
                            <span>批量重命名</span>
                            <span>{bulkRenameTargetsCount} 项</span>
                        </div>
                        <input
                            type="text"
                            value={bulkRenameValue}
                            autoFocus
                            onChange={(event) => onBulkRenameValueChange(event.target.value)}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === 'Enter') onCommitBulkRename();
                                if (event.key === 'Escape') onCancelBulkRename();
                            }}
                            placeholder="输入前缀，如：镜头A"
                            className="h-9 w-full rounded-md border border-blue-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none ring-2 ring-blue-100 placeholder:text-blue-300"
                        />
                        <div className="grid grid-cols-[1fr_92px] gap-2">
                            <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                                编号将按当前图层顺序依次递增。
                            </div>
                            <label className="rounded-md border border-blue-200 bg-white px-2.5 py-2">
                                <div className="text-[10px] font-medium text-violet-500">起始编号</div>
                                <input
                                    type="number"
                                    min={1}
                                    max={9999}
                                    value={bulkRenameStart}
                                    onChange={(event) => onBulkRenameStartChange(Math.max(1, Number(event.target.value) || 1))}
                                    className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                                />
                            </label>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>示例：{(bulkRenameValue.trim() || '镜头A')} {String(Math.max(1, bulkRenameStart || 1)).padStart(2, '0')}</span>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={onCancelBulkRename} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50">取消</button>
                                <button type="button" onClick={onCommitBulkRename} disabled={!bulkRenameValue.trim()} className="rounded-lg bg-violet-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">应用</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button type="button" onClick={onOpenBulkRenamePanel} className="flex w-full items-center justify-between rounded-md border border-blue-200 bg-white px-3 py-2 text-left text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50">
                        <span className="inline-flex items-center gap-2"><Pencil size={14} />批量重命名</span>
                        <span className="text-[11px] text-violet-500">按顺序编号</span>
                    </button>
                )}
            </div>

            {bulkStoryboardTargetsCount > 1 && (
                <div className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-2.5 shadow-sm">
                    {bulkStoryboardOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-medium text-amber-700">
                                <span>批量镜头编号</span>
                                <span>{bulkStoryboardTargetsCount} 张图片</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${bulkStoryboardPrefixError ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200'}`}>
                                    <div className="text-[10px] font-medium text-amber-500">前缀</div>
                                    <input type="text" value={bulkStoryboardPrefix} autoFocus onChange={(event) => onBulkStoryboardPrefixChange(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') onCommitBulkStoryboardNumbering(); if (event.key === 'Escape') onCancelBulkStoryboardNumbering(); }} placeholder="A" className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-amber-300" />
                                    {bulkStoryboardPrefixError && <div className="mt-1 text-[10px] leading-4 text-rose-600">{bulkStoryboardPrefixError}</div>}
                                </label>
                                <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                    <div className="text-[10px] font-medium text-amber-500">起始号</div>
                                    <input type="number" min={1} max={9999} value={bulkStoryboardStart} onChange={(event) => onBulkStoryboardStartChange(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none" />
                                </label>
                                <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                    <div className="text-[10px] font-medium text-amber-500">位数</div>
                                    <input type="number" min={1} max={6} value={bulkStoryboardDigits} onChange={(event) => onBulkStoryboardDigitsChange(Math.max(1, Math.min(6, Number(event.target.value) || 2)))} className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none" />
                                </label>
                                <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                    <div className="text-[10px] font-medium text-amber-500">步长</div>
                                    <input type="number" min={1} max={999} value={bulkStoryboardStep} onChange={(event) => onBulkStoryboardStepChange(Math.max(1, Math.min(999, Number(event.target.value) || 1)))} className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none" />
                                </label>
                            </div>
                            <label className="flex items-center gap-2 rounded-md border border-amber-100 bg-white/80 px-3 py-2 text-[11px] text-amber-700">
                                <input type="checkbox" checked={bulkStoryboardSkipExisting} onChange={(event) => onBulkStoryboardSkipExistingChange(event.target.checked)} className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                                <span>跳过已有镜头号的图片，仅补齐空缺项</span>
                            </label>
                            <label className="flex items-center gap-2 rounded-md border border-amber-100 bg-white/80 px-3 py-2 text-[11px] text-amber-700">
                                <input type="checkbox" checked={bulkStoryboardAvoidExistingNumbers} onChange={(event) => onBulkStoryboardAvoidExistingNumbersChange(event.target.checked)} className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                                <span>自动避让当前已存在的相同前缀编号</span>
                            </label>
                            <div className={`rounded-md border px-3 py-2 text-[11px] ${bulkStoryboardPrefixError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50/60 text-amber-700'}`}>
                                将按当前图层顺序生成镜头号，示例：{(bulkStoryboardPrefix.trim().toUpperCase() || 'A')}{String(Math.max(1, bulkStoryboardStart || 1)).padStart(Math.max(1, bulkStoryboardDigits || 2), '0')}
                                {bulkStoryboardStep > 1 ? `，下一项会递增 ${bulkStoryboardStep}` : ''}
                                {bulkStoryboardSkipExisting ? '，并跳过已存在编号的图片。' : ''}
                                {bulkStoryboardAvoidExistingNumbers ? ' 如遇到相同前缀且已占用的编号，会自动顺延避开。' : ''}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span>适合连续镜头快速编号，也可用于隔号排布。</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={onCancelBulkStoryboardNumbering} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50">取消</button>
                                    <button type="button" onClick={onCommitBulkStoryboardNumbering} disabled={!!bulkStoryboardPrefixError} className="rounded-lg bg-amber-500 px-2.5 py-1 font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">应用</button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={onOpenBulkStoryboardNumberingPanel} className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50">
                            <span className="inline-flex items-center gap-2"><Type size={14} />批量镜头编号</span>
                            <span className="text-[11px] text-amber-500">A01 / A02 / A03</span>
                        </button>
                    )}
                </div>
            )}

            {bulkStoryboardTargetsCount > 1 && (
                <div className="mb-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm">
                    {bulkStoryboardMetaOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-medium text-sky-700"><span>批量套用分镜字段</span><span>{bulkStoryboardTargetsCount} 张图片</span></div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm"><div className="text-[10px] font-medium text-sky-500">景别</div><input type="text" value={bulkStoryboardSceneType} autoFocus onChange={(event) => onBulkStoryboardSceneTypeChange(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') onCommitBulkStoryboardMeta(); if (event.key === 'Escape') onCancelBulkStoryboardMeta(); }} placeholder="如：中景" className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300" /></label>
                                <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm"><div className="text-[10px] font-medium text-sky-500">运镜</div><input type="text" value={bulkStoryboardCameraMove} onChange={(event) => onBulkStoryboardCameraMoveChange(event.target.value)} placeholder="如：推镜" className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300" /></label>
                                <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${bulkStoryboardDurationError ? 'border-rose-200 bg-rose-50/50' : 'border-sky-200'}`}><div className="text-[10px] font-medium text-sky-500">时长</div><input type="text" value={bulkStoryboardDuration} onChange={(event) => onBulkStoryboardDurationChange(event.target.value)} placeholder="如：3s" className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300" />{bulkStoryboardDurationError && <div className="mt-1 text-[10px] leading-4 text-rose-600">{bulkStoryboardDurationError}</div>}</label>
                                <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm"><div className="text-[10px] font-medium text-sky-500">备注模板</div><input type="text" value={bulkStoryboardNote} onChange={(event) => onBulkStoryboardNoteChange(event.target.value)} placeholder="如：角色转头看向镜头" className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300" /></label>
                            </div>
                            <div className={`rounded-md border px-3 py-2 text-[11px] ${bulkStoryboardDurationError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-100 bg-sky-50/70 text-sky-700'}`}>仅会覆盖当前填写过的字段；留空项不会修改原值。{bulkStoryboardDurationError ? ' 请先修正时长格式。' : ''}</div>
                            <div className="rounded-2xl border border-sky-100 bg-white/85 p-2.5 shadow-sm">
                                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-sky-700"><span>分镜模板预设</span><span className="text-sky-500">保存常用字段组合</span></div>
                                <div className="flex items-center gap-2">
                                    <input type="text" value={storyboardTemplateName} onChange={(event) => onStoryboardTemplateNameChange(event.target.value)} placeholder="例如：对话中景模板" className="h-9 flex-1 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none placeholder:text-sky-300" />
                                    <button type="button" onClick={onSaveStoryboardTemplate} disabled={(!bulkStoryboardSceneType.trim() && !bulkStoryboardCameraMove.trim() && !bulkStoryboardDuration.trim() && !bulkStoryboardNote.trim()) || !!bulkStoryboardDurationError} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-[11px] font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">保存模板</button>
                                </div>
                                {storyboardTemplateHint && <div className="mt-2 text-[11px] text-sky-600">{storyboardTemplateHint}</div>}
                                {storyboardTemplates.length > 0 && (
                                    <div className="mt-3 space-y-1.5 rounded-md border border-sky-100 bg-sky-50/60 p-2">
                                        {storyboardTemplates.map((template) => (
                                            <div key={template.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/90 px-2.5 py-2">
                                                <button type="button" onClick={() => onLoadStoryboardTemplate(template)} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-sky-800 hover:text-sky-900">{template.name}</button>
                                                <button type="button" onClick={() => onDeleteStoryboardTemplate(template)} className="text-[11px] text-sky-500 hover:text-red-500">删除</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span>适合快速统一镜头参数。</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={onCancelBulkStoryboardMeta} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50">取消</button>
                                    <button type="button" onClick={onCommitBulkStoryboardMeta} disabled={(!bulkStoryboardSceneType.trim() && !bulkStoryboardCameraMove.trim() && !bulkStoryboardDuration.trim() && !bulkStoryboardNote.trim()) || !!bulkStoryboardDurationError} className="rounded-lg bg-sky-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">应用</button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={onOpenBulkStoryboardMetaPanel} className="flex w-full items-center justify-between rounded-md border border-sky-200 bg-white px-3 py-2 text-left text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50"><span className="inline-flex items-center gap-2"><LayoutGrid size={14} />批量套用分镜字段</span><span className="text-[11px] text-sky-500">景别 / 运镜 / 时长</span></button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-3 gap-2">
                <button type="button" title={selectedHidden ? '显示所选图层' : '隐藏所选图层'} onClick={() => onToggleHidden(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100">{selectedHidden ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button type="button" title={selectedLocked ? '解锁所选图层' : '锁定所选图层'} onClick={() => onToggleLocked(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100">{selectedLocked ? <Unlock size={14} /> : <Lock size={14} />}</button>
                <button type="button" title="移到根层级" onClick={() => onMoveLayerToParent(selectedIds, undefined)} className="rounded-md border border-emerald-200 bg-white px-2 py-2 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50">根层级</button>
                <button type="button" title="上移一层" onClick={() => onBringForward(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"><ArrowUp size={14} /></button>
                <button type="button" title="下移一层" onClick={() => onSendBackward(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"><ArrowDown size={14} /></button>
                <button type="button" title="置于顶层" onClick={() => onBringToFront(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"><ChevronsUp size={14} /></button>
                <button type="button" title="置于底层" onClick={() => onSendToBack(selectedIds)} className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"><ChevronsDown size={14} /></button>
                <button type="button" title="批量删除" onClick={() => onDeleteSelection(selectedIds)} className="flex items-center justify-center rounded-md border border-red-200 bg-white px-2 py-2 text-red-500 transition-colors hover:bg-red-50"><Trash2 size={14} /></button>
            </div>
        </>
    );
}