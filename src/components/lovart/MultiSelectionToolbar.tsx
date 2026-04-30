"use client";

import React from 'react';
import { BookmarkPlus, Frame, LayoutGrid, MapPin, Minus, Send, Sparkles, Trash2, Video } from 'lucide-react';
import type { AlignmentDirection, DistributionAxis, LayoutSelectionMode } from './canvas-alignment';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

export type MultiSelectionAlignmentAction = {
    direction: AlignmentDirection;
    toolbarTitle: string;
    Icon: IconComponent;
    dividerBefore?: boolean;
};

export type MultiSelectionDistributionAction = {
    axis: DistributionAxis;
    title: string;
    Icon: IconComponent;
};

export type MultiSelectionEqualSpacingAction = {
    axis: DistributionAxis;
    title: string;
    icon: 'horizontal' | 'vertical';
};

export type MultiSelectionLayoutAction = {
    mode: LayoutSelectionMode;
    title: string;
    label: string;
};

function EqualSpacingIcon({ icon }: { icon: 'horizontal' | 'vertical' }) {
    if (icon === 'horizontal') {
        return (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="6" height="12" rx="1" />
                <rect x="16" y="6" width="6" height="12" rx="1" />
                <line x1="10" y1="12" x2="14" y2="12" />
                <line x1="12" y1="10" x2="12" y2="14" />
            </svg>
        );
    }

    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="6" rx="1" />
            <rect x="6" y="16" width="12" height="6" rx="1" />
            <line x1="12" y1="10" x2="12" y2="14" />
            <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
    );
}

export interface MultiSelectionToolbarProps {
    selectedIds: string[];
    alignmentActions: MultiSelectionAlignmentAction[];
    distributionActions: MultiSelectionDistributionAction[];
    equalSpacingActions: MultiSelectionEqualSpacingAction[];
    layoutSelectionActions: MultiSelectionLayoutAction[];
    onAlign: (direction: AlignmentDirection) => void;
    onDistribute: (axis: DistributionAxis) => void;
    onEqualSpacing: (axis: DistributionAxis) => void;
    onLayoutSelection: (mode: LayoutSelectionMode) => void;
    canExportStoryboardSelection: boolean;
    onExportStoryboardSelection?: (ids: string[]) => void;
    canGenerateStoryboardBatch: boolean;
    canGenerateStoryboardVideoBatch: boolean;
    multiStoryboardGenerateIds: string[];
    onGenerateStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardVideoSelection?: (ids: string[]) => void;
    canFocusSelection: boolean;
    onFocusSelection: () => void;
    onGroupSelection?: (ids: string[]) => void;
    multiCanUngroup: boolean;
    onUngroupSelection?: (ids: string[]) => void;
    multiCanMerge: boolean;
    onMergeSelection?: (ids: string[]) => void;
    multiCanSendToChat: boolean;
    onSendSelectionToChat?: (ids: string[]) => void;
    multiReferenceCandidateCount: number;
    onSaveSelectionAsProjectReference?: (ids: string[]) => void;
    multiAllHidden: boolean;
    onToggleElementsHidden?: (ids: string[]) => void;
    multiAllLocked: boolean;
    onToggleElementsLocked?: (ids: string[]) => void;
    onDeleteSelection: (ids: string[]) => void;
    onPointerDownCapture: (event: React.PointerEvent) => void;
    onMouseDownCapture: (event: React.MouseEvent) => void;
    onClickCapture: (event: React.MouseEvent) => void;
}

export function MultiSelectionToolbar({
    selectedIds,
    alignmentActions,
    distributionActions,
    equalSpacingActions,
    layoutSelectionActions,
    onAlign,
    onDistribute,
    onEqualSpacing,
    onLayoutSelection,
    canExportStoryboardSelection,
    onExportStoryboardSelection,
    canGenerateStoryboardBatch,
    canGenerateStoryboardVideoBatch,
    multiStoryboardGenerateIds,
    onGenerateStoryboardSelection,
    onGenerateStoryboardVideoSelection,
    canFocusSelection,
    onFocusSelection,
    onGroupSelection,
    multiCanUngroup,
    onUngroupSelection,
    multiCanMerge,
    onMergeSelection,
    multiCanSendToChat,
    onSendSelectionToChat,
    multiReferenceCandidateCount,
    onSaveSelectionAsProjectReference,
    multiAllHidden,
    onToggleElementsHidden,
    multiAllLocked,
    onToggleElementsLocked,
    onDeleteSelection,
    onPointerDownCapture,
    onMouseDownCapture,
    onClickCapture,
}: MultiSelectionToolbarProps) {
    return (
        <div
            className="absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
            onPointerDownCapture={onPointerDownCapture}
            onMouseDownCapture={onMouseDownCapture}
            onClickCapture={onClickCapture}
        >
            <span className="text-xs font-medium text-gray-500 px-2 whitespace-nowrap">已选 {selectedIds.length} 个</span>
            <div className="w-px h-6 bg-gray-200" />

            <div className="pointer-events-auto flex items-center gap-0.5 px-0.5" title="对齐">
                {alignmentActions.map(({ direction, toolbarTitle, Icon, dividerBefore }) => (
                    <React.Fragment key={direction}>
                        {dividerBefore ? <div className="w-px h-4 bg-gray-100 mx-0.5" /> : null}
                        <button
                            onClick={() => onAlign(direction)}
                            className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-gray-500 transition-colors"
                            title={toolbarTitle}
                        >
                            <Icon size={15} />
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {selectedIds.length >= 3 && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <div className="pointer-events-auto flex items-center gap-0.5 px-0.5" title="分布">
                        {distributionActions.map(({ axis, title, Icon }) => (
                            <button
                                key={axis}
                                onClick={() => onDistribute(axis)}
                                className="p-1.5 hover:bg-purple-50 hover:text-purple-600 rounded-lg text-gray-500 transition-colors"
                                title={title}
                            >
                                <Icon size={15} />
                            </button>
                        ))}
                    </div>
                </>
            )}

            {selectedIds.length >= 2 && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <div className="pointer-events-auto flex items-center gap-0.5 px-0.5" title="等间距">
                        {equalSpacingActions.map(({ axis, title, icon }) => (
                            <button
                                key={axis}
                                onClick={() => onEqualSpacing(axis)}
                                className="p-1.5 hover:bg-green-50 hover:text-green-600 rounded-lg text-gray-500 transition-colors"
                                title={title}
                            >
                                <EqualSpacingIcon icon={icon} />
                            </button>
                        ))}
                    </div>
                </>
            )}

            {selectedIds.length >= 2 && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <div className="pointer-events-auto flex items-center gap-1 px-0.5" title="自动布局">
                        {layoutSelectionActions.map(({ mode, title, label }) => (
                            <button
                                key={mode}
                                onClick={() => onLayoutSelection(mode)}
                                className="px-2 py-1.5 hover:bg-sky-50 hover:text-sky-600 rounded-lg text-gray-500 transition-colors text-xs font-medium"
                                title={title}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {canExportStoryboardSelection && onExportStoryboardSelection && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                        onClick={() => onExportStoryboardSelection(selectedIds)}
                        className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-600 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                        title="导出分镜表"
                    >
                        <LayoutGrid size={15} />
                        <span className="text-xs font-medium">分镜表</span>
                    </button>
                </>
            )}

            {canGenerateStoryboardBatch && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                        onClick={() => onGenerateStoryboardSelection?.(multiStoryboardGenerateIds)}
                        className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        title="将所选分镜卡片批量转为图片生成任务"
                    >
                        <Sparkles size={15} />
                        <span className="text-xs font-medium">批量出图</span>
                    </button>
                </>
            )}

            {canGenerateStoryboardVideoBatch && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                        onClick={() => onGenerateStoryboardVideoSelection?.(multiStoryboardGenerateIds)}
                        className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        title="将所选分镜卡片批量转为视频生成任务"
                    >
                        <Video size={15} />
                        <span className="text-xs font-medium">批量出视频</span>
                    </button>
                </>
            )}

            {canFocusSelection && (
                <>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                        onClick={onFocusSelection}
                        className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-100 transition-colors text-sm"
                        title="聚焦到当前多选区域"
                    >
                        <MapPin size={14} />
                        <span className="text-xs font-medium">聚焦</span>
                    </button>
                </>
            )}

            <div className="w-px h-6 bg-gray-200" />
            <button
                onClick={() => onGroupSelection?.(selectedIds)}
                className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                title="将选中元素组合到画板中"
            >
                <Frame size={14} />
                <span className="text-xs font-medium">组合</span>
            </button>

            {multiCanUngroup && (
                <button
                    onClick={() => onUngroupSelection?.(selectedIds)}
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors text-sm"
                    title="解除编组"
                >
                    <Frame size={14} />
                    <span className="text-xs font-medium">解组</span>
                </button>
            )}

            {multiCanMerge && (
                <button
                    onClick={() => onMergeSelection?.(selectedIds)}
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                    title="合并图层"
                >
                    <Minus size={14} />
                    <span className="text-xs font-medium">合并</span>
                </button>
            )}

            {multiCanSendToChat && (
                <button
                    onClick={() => onSendSelectionToChat?.(selectedIds)}
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors text-sm"
                    title="发送至对话"
                >
                    <Send size={14} />
                    <span className="text-xs font-medium">发送</span>
                </button>
            )}

            {multiReferenceCandidateCount > 0 && onSaveSelectionAsProjectReference && (
                <button
                    data-testid="canvas-multi-save-reference"
                    onClick={() => onSaveSelectionAsProjectReference(selectedIds)}
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors text-sm"
                    title={`将所选 ${multiReferenceCandidateCount} 张图片加入项目参考库`}
                >
                    <BookmarkPlus size={14} />
                    <span className="text-xs font-medium">入参考库</span>
                </button>
            )}

            <button
                onClick={() => onToggleElementsHidden?.(selectedIds)}
                className={`pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-sm ${multiAllHidden ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                title={multiAllHidden ? '显示所选元素' : '隐藏所选元素'}
            >
                <span className="text-xs font-medium">{multiAllHidden ? '显示' : '隐藏'}</span>
            </button>

            <button
                onClick={() => onToggleElementsLocked?.(selectedIds)}
                className={`pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-sm ${multiAllLocked ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                title={multiAllLocked ? '解锁所选元素' : '锁定所选元素'}
            >
                <span className="text-xs font-medium">{multiAllLocked ? '解锁' : '锁定'}</span>
            </button>

            <div className="w-px h-6 bg-gray-200" />
            <button onClick={() => onDeleteSelection(selectedIds)} className="pointer-events-auto p-1.5 hover:bg-red-50 text-red-500 rounded-md text-sm" title="全部删除">
                <Trash2 size={15} />
            </button>
        </div>
    );
}