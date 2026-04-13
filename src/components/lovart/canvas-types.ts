export type CanvasPoint = { x: number; y: number };

export type FrameAutoLayoutMode = 'flow' | 'grid' | 'row' | 'column';
export type FrameAutoLayoutAlign = 'start' | 'center';

export type CanvasElementType =
    | 'image'
    | 'text'
    | 'shape'
    | 'path'
    | 'image-generator'
    | 'storyboard-planner'
    | 'video-generator'
    | 'video'
    | 'connector'
    | 'mark'
    | 'frame';

export interface CanvasElement {
    id: string;
    type: CanvasElementType;
    x: number;
    y: number;
    hidden?: boolean;
    locked?: boolean;
    displayName?: string;
    content?: string;
    width?: number;
    height?: number;
    color?: string;
    shapeType?: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right';
    fontSize?: number;
    fontFamily?: string;
    points?: CanvasPoint[];
    strokeWidth?: number;
    referenceImageId?: string;
    groupId?: string;
    linkedElements?: string[];
    connectorFrom?: string;
    connectorTo?: string;
    connectorStyle?: 'solid' | 'dashed';
    selectedModel?: string;
    selectedAspectRatio?: string;
    selectedImageSize?: string;
    selectedDuration?: string;
    selectedEnhancePrompt?: boolean;
    selectedDomesticMode?: string;
    selectedResolution?: string;
    selectedGenerateAudio?: boolean;
    savedPrompt?: string;
    savedPromptMentionBindings?: string;
    savedPromptMentionIds?: string;
    savedReferenceImages?: string;
    annotationTitle?: string;
    annotationNote?: string;
    storyboardShotCode?: string;
    storyboardSceneType?: string;
    storyboardCameraMove?: string;
    storyboardDuration?: string;
    storyboardNote?: string;
    generationBatchId?: string;
    generationBatchTitle?: string;
    sourceStoryboardId?: string;
    generationResultIndex?: number;
    generatingTaskId?: string;
    generatingTaskType?: 'image' | 'video';
    generatingProgress?: number;
    generatingError?: string;
    savedReferenceImage?: string;
    savedFrameImages?: string;
    savedReferenceVideos?: string;
    savedReferenceAudios?: string;
    selectedGenerateCount?: number;
    imageFit?: 'contain' | 'cover';
    imageSurface?: 'checker' | 'light' | 'dark';
    markNumber?: number;
    markText?: string;
    markTargetId?: string;
    framePreset?: string;
    frameBgColor?: string;
    frameClip?: boolean;
    parentFrameId?: string;
    frameName?: string;
    frameLocked?: boolean;
    frameAutoLayout?: boolean;
    frameAutoLayoutMode?: FrameAutoLayoutMode;
    frameAutoLayoutGap?: number;
    frameAutoLayoutAlign?: FrameAutoLayoutAlign;
    groupFrame?: boolean;
}

export type CanvasElementExportFormat = 'png' | 'jpg' | 'svg' | 'original';
