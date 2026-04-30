import React from 'react';
import { Eye, MousePointerClick } from 'lucide-react';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { ContextToolbar } from './ContextToolbar';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';
import type { AlignmentDirection, DistributionAxis, LayoutSelectionMode } from './canvas-alignment';
import type { CanvasElement, CanvasElementExportFormat } from './canvas-types';

type AlignmentAction = {
    direction: AlignmentDirection;
    toolbarTitle: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    dividerBefore?: boolean;
};

type DistributionAction = {
    axis: DistributionAxis;
    title: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
};

type EqualSpacingAction = {
    axis: DistributionAxis;
    title: string;
    icon: 'horizontal' | 'vertical';
};

type LayoutSelectionAction = {
    mode: LayoutSelectionMode;
    title: string;
    label: string;
};

interface CanvasAreaHudProps {
    canvasSelectMode?: 'image' | 'video' | null;
    onCancelCanvasSelect?: () => void;
    hiddenElementIds: string[];
    onToggleElementsHidden?: (ids: string[]) => void;
    selectedIds: string[];
    selectedElement: CanvasElement | undefined;
    scale: number;
    pan: { x: number; y: number };
    isDragging: boolean;
    isResizing: boolean;
    isPanning: boolean;
    isDrawing: boolean;
    isSelecting: boolean;
    storyboardAutoAdvanceEnabled: boolean;
    projectReferenceImages?: ProjectReferenceImageItem[];
    alignmentActions: AlignmentAction[];
    distributionActions: DistributionAction[];
    equalSpacingActions: EqualSpacingAction[];
    layoutSelectionActions: LayoutSelectionAction[];
    canExportStoryboardSelection: boolean;
    canGenerateStoryboardBatch: boolean;
    canGenerateStoryboardVideoBatch: boolean;
    multiStoryboardGenerateIds: string[];
    canFocusSelection: boolean;
    multiCanUngroup: boolean;
    multiCanMerge: boolean;
    multiCanSendToChat: boolean;
    multiReferenceCandidateCount: number;
    multiAllHidden: boolean;
    multiAllLocked: boolean;
    onPointerDownCapture: (event: React.PointerEvent) => void;
    onMouseDownCapture: (event: React.MouseEvent) => void;
    onClickCapture: (event: React.MouseEvent) => void;
    onElementChange: (id: string, attrs: Partial<CanvasElement>) => void;
    onStoryboardSaved?: (id: string) => void;
    onDelete: (id: string) => void;
    onCopyElement?: (element: CanvasElement) => void;
    onDownloadElement?: (element: CanvasElement, format?: CanvasElementExportFormat) => void;
    onUseProjectReferenceImage?: (id: string) => void;
    onSaveAsProjectReference?: (element: CanvasElement) => void;
    onSendSelectionToChat?: (ids: string[]) => void;
    onToggleElementsLocked?: (ids: string[]) => void;
    onAiEditElement?: (element: CanvasElement, prompt: string) => void;
    onRecoverImageEditTask?: (elementId: string, taskId: string) => Promise<void>;
    onReplaceBackground?: (element: CanvasElement, prompt: string) => void;
    onMockupElement?: (element: CanvasElement, templateId: string) => void;
    onAnnotateImage?: (element: CanvasElement) => void;
    onCropImage?: (element: CanvasElement) => void;
    onSplitStoryboard?: (element: CanvasElement) => void;
    onStoryboardPlanFromImage?: (element: CanvasElement) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onAlign: (direction: AlignmentDirection) => void;
    onDistribute: (axis: DistributionAxis) => void;
    onEqualSpacing: (axis: DistributionAxis) => void;
    onLayoutSelection: (mode: LayoutSelectionMode) => void;
    onExportStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardVideoSelection?: (ids: string[]) => void;
    onFocusSelection: () => void;
    onGroupSelection?: (ids: string[]) => void;
    onUngroupSelection?: (ids: string[]) => void;
    onMergeSelection?: (ids: string[]) => void;
    onSaveSelectionAsProjectReference?: (ids: string[]) => void;
    onDeleteSelection: (ids: string[]) => void;
}

export function CanvasAreaHud({
    canvasSelectMode,
    onCancelCanvasSelect,
    hiddenElementIds,
    selectedIds,
    selectedElement,
    scale,
    pan,
    isDragging,
    isResizing,
    isPanning,
    isDrawing,
    isSelecting,
    storyboardAutoAdvanceEnabled,
    projectReferenceImages,
    alignmentActions,
    distributionActions,
    equalSpacingActions,
    layoutSelectionActions,
    canExportStoryboardSelection,
    canGenerateStoryboardBatch,
    canGenerateStoryboardVideoBatch,
    multiStoryboardGenerateIds,
    canFocusSelection,
    multiCanUngroup,
    multiCanMerge,
    multiCanSendToChat,
    multiReferenceCandidateCount,
    multiAllHidden,
    multiAllLocked,
    onPointerDownCapture,
    onMouseDownCapture,
    onClickCapture,
    onElementChange,
    onStoryboardSaved,
    onDelete,
    onCopyElement,
    onDownloadElement,
    onUseProjectReferenceImage,
    onSaveAsProjectReference,
    onSendSelectionToChat,
    onToggleElementsHidden: onToggleHidden,
    onToggleElementsLocked,
    onAiEditElement,
    onRecoverImageEditTask,
    onReplaceBackground,
    onMockupElement,
    onAnnotateImage,
    onCropImage,
    onSplitStoryboard,
    onStoryboardPlanFromImage,
    onConnectFlow,
    onAlign,
    onDistribute,
    onEqualSpacing,
    onLayoutSelection,
    onExportStoryboardSelection,
    onGenerateStoryboardSelection,
    onGenerateStoryboardVideoSelection,
    onFocusSelection,
    onGroupSelection,
    onUngroupSelection,
    onMergeSelection,
    onSaveSelectionAsProjectReference,
    onDeleteSelection,
}: CanvasAreaHudProps) {
    const canShowContextToolbar = selectedIds.length === 1
        && selectedElement
        && !selectedElement.hidden
        && !isDragging
        && !isResizing
        && !isPanning
        && !isDrawing
        && !isSelecting
        && !canvasSelectMode
        && selectedElement.type !== 'connector'
        && selectedElement.type !== 'frame'
        && selectedElement.type !== 'image-generator'
        && selectedElement.type !== 'video-generator';

    return (
        <>
            {canvasSelectMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[200] bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-200" onMouseDown={(event) => event.stopPropagation()}>
                    <MousePointerClick size={18} />
                    <span className="text-sm font-medium">
                        请点击画布中的{canvasSelectMode === 'image' ? '图片' : '图片/视频'}作为参考
                    </span>
                    <button
                        onClick={() => onCancelCanvasSelect?.()}
                        className="ml-2 bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded-lg text-xs font-medium transition-colors"
                    >
                        取消
                    </button>
                </div>
            )}

            {hiddenElementIds.length > 0 && !canvasSelectMode && (
                <div className="absolute top-4 right-4 z-[200]" onMouseDown={(event) => event.stopPropagation()}>
                    <button
                        onClick={() => onToggleHidden?.(hiddenElementIds)}
                        className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white/95 px-3 py-2 text-sm font-medium text-blue-600 shadow-lg backdrop-blur hover:bg-blue-50 transition-colors"
                        title="恢复所有隐藏元素"
                    >
                        <Eye size={16} />
                        显示隐藏元素
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{hiddenElementIds.length}</span>
                    </button>
                </div>
            )}

            {canShowContextToolbar && selectedElement && (
                <div
                    onPointerDownCapture={onPointerDownCapture}
                    onMouseDownCapture={onMouseDownCapture}
                    onClickCapture={onClickCapture}
                    style={{
                        position: 'absolute',
                        left: (selectedElement.x + (selectedElement.width || 0) / 2) * scale + pan.x,
                        top: Math.max(8, selectedElement.y * scale + pan.y - 48),
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        width: 'max-content',
                    }}
                >
                    <ContextToolbar
                        element={selectedElement}
                        scale={scale}
                        onUpdate={onElementChange}
                        onStoryboardSaved={onStoryboardSaved}
                        storyboardAutoAdvanceEnabled={storyboardAutoAdvanceEnabled}
                        onDelete={onDelete}
                        onCopy={onCopyElement}
                        onDownload={onDownloadElement}
                        projectReferenceImages={projectReferenceImages}
                        onUseProjectReferenceImage={onUseProjectReferenceImage}
                        onSaveAsProjectReference={onSaveAsProjectReference}
                        onSendToChat={onSendSelectionToChat ? (element) => onSendSelectionToChat([element.id]) : undefined}
                        onToggleHidden={onToggleHidden ? (element) => onToggleHidden([element.id]) : undefined}
                        onToggleLocked={onToggleElementsLocked ? (element) => onToggleElementsLocked([element.id]) : undefined}
                        onAiEdit={onAiEditElement}
                        onRecoverTask={onRecoverImageEditTask}
                        onReplaceBackground={onReplaceBackground}
                        onMockup={onMockupElement}
                        onAnnotateImage={onAnnotateImage}
                        onCropImage={onCropImage}
                        onSplitStoryboard={onSplitStoryboard}
                        onStoryboardPlanFromImage={onStoryboardPlanFromImage}
                        onConnectFlow={onConnectFlow}
                    />
                </div>
            )}

            {selectedIds.length > 1 && !isDragging && !isSelecting && (
                <MultiSelectionToolbar
                    selectedIds={selectedIds}
                    alignmentActions={alignmentActions}
                    distributionActions={distributionActions}
                    equalSpacingActions={equalSpacingActions}
                    layoutSelectionActions={layoutSelectionActions}
                    onAlign={onAlign}
                    onDistribute={onDistribute}
                    onEqualSpacing={onEqualSpacing}
                    onLayoutSelection={onLayoutSelection}
                    canExportStoryboardSelection={canExportStoryboardSelection}
                    onExportStoryboardSelection={onExportStoryboardSelection}
                    canGenerateStoryboardBatch={canGenerateStoryboardBatch}
                    canGenerateStoryboardVideoBatch={canGenerateStoryboardVideoBatch}
                    multiStoryboardGenerateIds={multiStoryboardGenerateIds}
                    onGenerateStoryboardSelection={onGenerateStoryboardSelection}
                    onGenerateStoryboardVideoSelection={onGenerateStoryboardVideoSelection}
                    canFocusSelection={canFocusSelection}
                    onFocusSelection={onFocusSelection}
                    onGroupSelection={onGroupSelection}
                    multiCanUngroup={multiCanUngroup}
                    onUngroupSelection={onUngroupSelection}
                    multiCanMerge={multiCanMerge}
                    onMergeSelection={onMergeSelection}
                    multiCanSendToChat={multiCanSendToChat}
                    onSendSelectionToChat={onSendSelectionToChat}
                    multiReferenceCandidateCount={multiReferenceCandidateCount}
                    onSaveSelectionAsProjectReference={onSaveSelectionAsProjectReference}
                    multiAllHidden={multiAllHidden}
                    onToggleElementsHidden={onToggleHidden}
                    multiAllLocked={multiAllLocked}
                    onToggleElementsLocked={onToggleElementsLocked}
                    onDeleteSelection={onDeleteSelection}
                    onPointerDownCapture={onPointerDownCapture}
                    onMouseDownCapture={onMouseDownCapture}
                    onClickCapture={onClickCapture}
                />
            )}
        </>
    );
}