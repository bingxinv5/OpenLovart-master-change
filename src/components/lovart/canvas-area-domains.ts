/**
 * Canvas Area Domain Objects
 * 
 * This module defines domain ports (interfaces) that group related props
 * by their functional domain, reducing the overall prop count from 50+ to ~15.
 */

import type { CanvasElement, CanvasElementExportFormat } from './canvas-types';
import type { CanvasElementPatchAttrs } from './canvas-element-patch';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import type { SpatialIndex } from '@/lib/editor-kernel';

// Note: Importing CanvasRenderMetrics creates a circular dependency with CanvasArea.tsx
// So we define the interface here instead
export interface CanvasRenderMetrics {
    visibleCount: number;
    totalCount: number;
    culledCount: number;
    virtualizedCount: number;
    deferredCount: number;
    maxVisibleElements: number;
    viewportMargin: number;
    partitionCount: number;
    partitionTileSize: number;
}

/**
 * Selection State & Tool Management Domain
 */
export interface SelectionDomainPort {
    selectedIds: string[];
    highlightedElementIds: string[];
    onSelect: (ids: string[]) => void;
    activeTool: string;
    onToolChange: (tool: string) => void;
}

/**
 * View/Viewport Domain (pan, zoom, viewport)
 */
export interface ViewDomainPort {
    scale: number;
    pan: { x: number; y: number };
    onPanChange: (pan: { x: number; y: number }) => void;
    onScaleChange: (scale: number) => void;
}

/**
 * Element CRUD Operations Domain
 */
export interface ElementCRUDDomainPort {
    elements: CanvasElement[];
    onElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    onBatchElementChange?: (changes: { id: string; attrs: CanvasElementPatchAttrs }[]) => void;
    onDelete: (id: string) => void;
    onAddElement: (element: CanvasElement) => void;
}

/**
 * Clipboard Operations Domain
 */
export type DuplicateSelectionResult = {
    copies: CanvasElement[];
    sourceToCopyId: Record<string, string>;
};

export interface ClipboardDomainPort {
    canPaste?: boolean;
    onCopyElement?: (element: CanvasElement) => void;
    onCopySelection?: (ids: string[]) => void;
    onCutSelection?: (ids: string[]) => void;
    onPasteAt?: (position: { x: number; y: number }) => void;
    onDuplicateSelection?: (ids: string[], position?: { x: number; y: number }) => DuplicateSelectionResult | void;
}

/**
 * Layout/Composition Operations Domain
 * (grouping, layering, alignment, visibility)
 */
export interface LayoutDomainPort {
    onGroupSelection?: (ids: string[]) => void;
    onUngroupSelection?: (ids: string[]) => void;
    onMergeSelection?: (ids: string[]) => void;
    onBringForward?: (ids: string[]) => void;
    onSendBackward?: (ids: string[]) => void;
    onBringToFront?: (ids: string[]) => void;
    onSendToBack?: (ids: string[]) => void;
    onToggleElementsHidden?: (ids: string[]) => void;
    onToggleElementsLocked?: (ids: string[]) => void;
    onDeleteSelection?: (ids: string[]) => void;
}

/**
 * Generator Operations Domain
 * (image generator, video generator, storyboard planner)
 */
export interface GeneratorDomainPort {
    onOpenImageGenerator?: () => void;
    onOpenVideoGenerator?: () => void;
    onGenerateStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardVideoSelection?: (ids: string[]) => void;
    onExportStoryboardSelection?: (ids: string[]) => void;
    generatorSubmittingMap?: Record<string, boolean>;
    highlightedResultId?: string | null;
}

/**
 * Media Upload & Reference Domain
 * (adding images/videos, project references)
 */
export interface MediaDomainPort {
    projectReferenceImages?: ProjectReferenceImageItem[];
    onUseProjectReferenceImage?: (id: string) => void;
    onSaveAsProjectReference?: (element: CanvasElement) => void;
    onSaveSelectionAsProjectReference?: (ids: string[]) => void;
    onAddImage?: (files: File[], position?: { x: number; y: number }) => void;
    onAddVideo?: (file: File, position?: { x: number; y: number }) => void;
}

/**
 * Editing Tools Domain
 * (AI edit, background replacement, annotation, cropping, etc.)
 */
export interface EditingToolsDomainPort {
    onAiEditElement?: (element: CanvasElement, prompt: string) => void;
    onRecoverImageEditTask?: (elementId: string, taskId: string) => Promise<void>;
    onReplaceBackground?: (element: CanvasElement, prompt: string) => void;
    onMockupElement?: (element: CanvasElement, templateId: string) => void;
    onAnnotateImage?: (element: CanvasElement) => void;
    onCropImage?: (element: CanvasElement) => void;
    onSplitStoryboard?: (element: CanvasElement) => void;
    onStoryboardPlanFromImage?: (element: CanvasElement) => void;
}

/**
 * Export & Share Operations Domain
 */
export interface ExportDomainPort {
    onDownloadElement?: (element: CanvasElement, format?: CanvasElementExportFormat) => void;
    onSendSelectionToChat?: (ids: string[]) => void;
}

/**
 * Canvas Select Mode Domain
 * (image/video picker mode)
 */
export interface CanvasSelectModeDomainPort {
    canvasSelectMode?: 'image' | 'video' | null;
    onCanvasSelectPick?: (element: CanvasElement) => void;
    onCancelCanvasSelect?: () => void;
}

/**
 * Storyboard Domain
 */
export interface StoryboardDomainPort {
    onStoryboardSaved?: (id: string) => void;
    storyboardAutoAdvanceEnabled?: boolean;
}

/**
 * Miscellaneous / Other Domain
 * (drag events, hover, etc.)
 */
export interface MiscDomainPort {
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onCanvasMouseMove?: (canvasX: number, canvasY: number) => void;
    spatialIndex?: SpatialIndex;
    resolvedImageSrcMap?: Record<string, string>;
    minimapRightOffset?: number;
    canvasTheme?: 'light' | 'dark';
    onRenderMetricsChange?: (metrics: CanvasRenderMetrics) => void;
}

/**
 * Complete Canvas Area Domain Aggregation
 * Use this to pass all domains together
 */
export interface CanvasAreaDomains {
    selection: SelectionDomainPort;
    view: ViewDomainPort;
    elementCRUD: ElementCRUDDomainPort;
    clipboard: ClipboardDomainPort;
    layout: LayoutDomainPort;
    generator: GeneratorDomainPort;
    media: MediaDomainPort;
    editingTools: EditingToolsDomainPort;
    export: ExportDomainPort;
    canvasSelectMode: CanvasSelectModeDomainPort;
    storyboard: StoryboardDomainPort;
    misc: MiscDomainPort;
}
