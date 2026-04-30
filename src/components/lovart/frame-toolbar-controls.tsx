import { Frame } from 'lucide-react';
import { DragNumberInput } from './canvas-ui-utils';
import type { CanvasElement, FrameAutoLayoutAlign, FrameAutoLayoutMode } from './canvas-types';
import type { ElementHandlers } from './CanvasElementRenderer';

export const FRAME_LAYOUT_MODE_LABELS: Record<FrameAutoLayoutMode, string> = {
    flow: '流式',
    row: '横排',
    column: '竖排',
    grid: '网格',
};

export const FRAME_LAYOUT_ALIGN_LABELS: Record<FrameAutoLayoutAlign, string> = {
    start: '左上',
    center: '居中',
};

export function FramePresetButton({
    el,
    showFramePresetMenu,
    handlersRef,
}: {
    el: CanvasElement;
    showFramePresetMenu: boolean;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;

    return (
        <button
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
            onClick={() => h.setShowFramePresetMenu(showFramePresetMenu ? null : el.id)}
        >
            <Frame size={16} />
            {el.framePreset || 'Custom'}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-gray-400 ml-0.5"><path d="M1 3l3 3 3-3H1z"/></svg>
        </button>
    );
}

export function FramePresetMenu({
    el,
    handlersRef,
}: {
    el: CanvasElement;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;

    return (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 min-w-[200px] z-50 animate-in fade-in zoom-in-95 duration-150">
            {[
                { label: '1:1', w: 1024, h: 1024, icon: '◻' },
                { label: '2:3', w: 1024, h: 1536, icon: '▯' },
                { label: '9:16', w: 1080, h: 1920, icon: '▯' },
                { label: '3:2', w: 1536, h: 1024, icon: '▭' },
                { label: '16:9', w: 1920, h: 1080, icon: '▭' },
                { label: 'A4', w: 1024, h: 1754, icon: 'A4' },
                { label: 'Website', w: 1366, h: 768, icon: 'Web' },
            ].map(preset => (
                <button
                    key={preset.label}
                    className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm transition-colors ${el.framePreset === preset.label ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                    onClick={() => {
                        h.onElementChange(el.id, { width: preset.w, height: preset.h, framePreset: preset.label });
                        h.setShowFramePresetMenu(null);
                        if (el.frameAutoLayout) h.scheduleAutoLayout(el.id);
                    }}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-4 text-center text-[10px]">{preset.icon}</span>
                        <span>{preset.label}</span>
                    </div>
                    <span className="text-xs text-gray-400">{preset.w}*{preset.h}</span>
                </button>
            ))}
        </div>
    );
}

export function FrameAutoLayoutControls({
    el,
    handlersRef,
}: {
    el: CanvasElement;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;
    const activeLayoutMode: FrameAutoLayoutMode = el.frameAutoLayoutMode || 'flow';
    const activeLayoutAlign: FrameAutoLayoutAlign = el.frameAutoLayoutAlign || 'center';

    return (
        <>
            <button
                data-testid={`frame-autolayout-toggle-${el.id}`}
                className={`p-2 rounded-lg transition-colors flex items-center gap-0.5 ${el.frameAutoLayout ? 'bg-green-50 text-green-600' : 'text-gray-400 hover:bg-gray-50'}`}
                onClick={() => {
                    const newVal = !el.frameAutoLayout;
                    h.onElementChange(el.id, {
                        frameAutoLayout: newVal,
                        frameAutoLayoutMode: el.frameAutoLayoutMode || 'flow',
                        frameAutoLayoutGap: el.frameAutoLayoutGap ?? 14,
                        frameAutoLayoutAlign: el.frameAutoLayoutAlign || 'center',
                    });
                    if (newVal) h.scheduleAutoLayout(el.id);
                }}
                title={el.frameAutoLayout ? '自动排版已开启（点击关闭）' : '自动排版已关闭（点击开启，图片拖入后自动排列）'}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            {el.frameAutoLayout && (
                <div className="flex items-center gap-1 rounded-lg bg-emerald-50/70 px-1 py-1">
                    {([
                        ['flow', '流'],
                        ['row', '横'],
                        ['column', '竖'],
                        ['grid', '格'],
                    ] as Array<[FrameAutoLayoutMode, string]>).map(([mode, label]) => {
                        const isActive = activeLayoutMode === mode;
                        return (
                            <button key={mode} data-testid={`frame-autolayout-mode-${mode}-${el.id}`} className={`min-w-[30px] rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${isActive ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-emerald-600 hover:bg-white/80'}`} onClick={() => { h.onElementChange(el.id, { frameAutoLayoutMode: mode, frameAutoLayout: true }); h.scheduleAutoLayout(el.id); }} title={`切换为${FRAME_LAYOUT_MODE_LABELS[mode]}布局`}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
            {el.frameAutoLayout && (
                <>
                    <div className="w-px h-7 bg-gray-200" />
                    <div data-testid={`frame-autolayout-gap-${el.id}`}>
                        <DragNumberInput label="Gap" value={el.frameAutoLayoutGap ?? 14} min={0} step={1} onChange={(value) => { h.onElementChange(el.id, { frameAutoLayoutGap: value, frameAutoLayout: true }); h.scheduleAutoLayout(el.id); }} />
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-1 py-1" data-testid={`frame-autolayout-align-${el.id}`}>
                        {([
                            ['start', '起'],
                            ['center', '中'],
                        ] as Array<[FrameAutoLayoutAlign, string]>).map(([align, label]) => {
                            const isActive = activeLayoutAlign === align;
                            return (
                                <button key={align} data-testid={`frame-autolayout-align-${align}-${el.id}`} className={`min-w-[30px] rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${isActive ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/80'}`} onClick={() => { h.onElementChange(el.id, { frameAutoLayoutAlign: align, frameAutoLayout: true }); h.scheduleAutoLayout(el.id); }} title={`切换为${FRAME_LAYOUT_ALIGN_LABELS[align]}对齐`}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </>
    );
}