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
    selectedImageQuality?: string;
    selectedDuration?: string;
    selectedEnhancePrompt?: boolean;
    selectedDomesticMode?: string;
    selectedResolution?: string;
    selectedGenerateAudio?: boolean;
    savedPrompt?: string;
    savedPromptMentionBindings?: string;
    savedPromptMentionIds?: string;
    savedReferenceImages?: string;
    flowReferenceImages?: string;
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
    sourceGenerationTaskId?: string;
    sourceGenerationTaskType?: 'image' | 'video';
    legacyMigrationVersion?: number;
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

export const CANVAS_LEGACY_MIGRATION_VERSION = 1;

export function hasCurrentCanvasLegacyMigration(element: Pick<CanvasElement, 'legacyMigrationVersion'>) {
    return (element.legacyMigrationVersion ?? 0) >= CANVAS_LEGACY_MIGRATION_VERSION;
}

export function markCanvasLegacyMigrationApplied<TElement extends CanvasElement>(element: TElement): TElement {
    if (hasCurrentCanvasLegacyMigration(element)) {
        return element;
    }

    return {
        ...element,
        legacyMigrationVersion: CANVAS_LEGACY_MIGRATION_VERSION,
    } as TElement;
}

export type BaseCanvasElementProps = Pick<CanvasElement,
    | 'id'
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'hidden'
    | 'locked'
    | 'displayName'
    | 'groupId'
    | 'linkedElements'
    | 'parentFrameId'
>;

export type CanvasGenerationStateProps = Pick<CanvasElement,
    | 'generatingTaskId'
    | 'generatingTaskType'
    | 'generatingProgress'
    | 'generatingError'
    | 'sourceGenerationTaskId'
    | 'sourceGenerationTaskType'
    | 'generationBatchId'
    | 'generationBatchTitle'
    | 'sourceStoryboardId'
    | 'generationResultIndex'
>;

export type CanvasPromptElementProps = Pick<CanvasElement,
    | 'savedPrompt'
    | 'savedPromptMentionBindings'
    | 'savedPromptMentionIds'
    | 'selectedModel'
    | 'selectedAspectRatio'
    | 'selectedEnhancePrompt'
    | 'selectedDomesticMode'
    | 'selectedResolution'
    | 'selectedGenerateAudio'
>;

export type CanvasReferenceElementProps = Pick<CanvasElement,
    | 'referenceImageId'
    | 'savedReferenceImage'
    | 'savedReferenceImages'
    | 'flowReferenceImages'
    | 'savedFrameImages'
    | 'savedReferenceVideos'
    | 'savedReferenceAudios'
>;

export type CanvasStoryboardElementProps = Pick<CanvasElement,
    | 'storyboardShotCode'
    | 'storyboardSceneType'
    | 'storyboardCameraMove'
    | 'storyboardDuration'
    | 'storyboardNote'
>;

export type CanvasImageElementProps = Pick<CanvasElement,
    | 'content'
    | 'imageFit'
    | 'imageSurface'
    | 'selectedImageSize'
    | 'selectedImageQuality'
    | 'selectedGenerateCount'
    | 'annotationTitle'
    | 'annotationNote'
> & CanvasPromptElementProps & CanvasReferenceElementProps & CanvasGenerationStateProps & CanvasStoryboardElementProps;

export type CanvasVideoElementProps = Pick<CanvasElement,
    | 'content'
    | 'selectedDuration'
> & CanvasPromptElementProps & CanvasReferenceElementProps & CanvasGenerationStateProps & CanvasStoryboardElementProps;

export type CanvasFrameElementProps = Pick<CanvasElement,
    | 'framePreset'
    | 'frameBgColor'
    | 'frameClip'
    | 'frameName'
    | 'frameLocked'
    | 'frameAutoLayout'
    | 'frameAutoLayoutMode'
    | 'frameAutoLayoutGap'
    | 'frameAutoLayoutAlign'
    | 'groupFrame'
>;

export type CanvasTextElementProps = Pick<CanvasElement,
    | 'content'
    | 'color'
    | 'fontSize'
    | 'fontFamily'
>;

export type CanvasShapeElementProps = Pick<CanvasElement,
    | 'color'
    | 'shapeType'
>;

export type CanvasPathElementProps = Pick<CanvasElement,
    | 'color'
    | 'points'
    | 'strokeWidth'
>;

export type CanvasConnectorElementProps = Pick<CanvasElement,
    | 'connectorFrom'
    | 'connectorTo'
    | 'connectorStyle'
    | 'color'
    | 'strokeWidth'
>;

export type CanvasMarkElementProps = Pick<CanvasElement,
    | 'markNumber'
    | 'markText'
    | 'markTargetId'
>;

export type CanvasImageGeneratorElementProps = Pick<CanvasElement,
    | 'selectedImageSize'
    | 'selectedImageQuality'
    | 'selectedGenerateCount'
> & CanvasPromptElementProps & CanvasReferenceElementProps & CanvasGenerationStateProps & CanvasStoryboardElementProps;

export type CanvasVideoGeneratorElementProps = Pick<CanvasElement,
    | 'selectedDuration'
> & CanvasPromptElementProps & CanvasReferenceElementProps & CanvasGenerationStateProps & CanvasStoryboardElementProps;

export type CanvasStoryboardPlannerElementProps = Pick<CanvasElement,
    | 'selectedImageSize'
    | 'selectedImageQuality'
    | 'selectedGenerateCount'
> & CanvasPromptElementProps & CanvasReferenceElementProps & CanvasGenerationStateProps & CanvasStoryboardElementProps;

type CanvasTypedElement<TType extends CanvasElementType, TProps = object> = BaseCanvasElementProps & { type: TType } & TProps;

export type CanvasElementUnion =
    | CanvasTypedElement<'image', CanvasImageElementProps>
    | CanvasTypedElement<'text', CanvasTextElementProps>
    | CanvasTypedElement<'shape', CanvasShapeElementProps>
    | CanvasTypedElement<'path', CanvasPathElementProps>
    | CanvasTypedElement<'image-generator', CanvasImageGeneratorElementProps>
    | CanvasTypedElement<'storyboard-planner', CanvasStoryboardPlannerElementProps>
    | CanvasTypedElement<'video-generator', CanvasVideoGeneratorElementProps>
    | CanvasTypedElement<'video', CanvasVideoElementProps>
    | CanvasTypedElement<'connector', CanvasConnectorElementProps>
    | CanvasTypedElement<'mark', CanvasMarkElementProps>
    | CanvasTypedElement<'frame', CanvasFrameElementProps>;

export type CanvasElementOfType<TType extends CanvasElementType> = Extract<CanvasElementUnion, { type: TType }>;

export type CanvasImageElement = CanvasElementOfType<'image'>;
export type CanvasVideoElement = CanvasElementOfType<'video'>;
export type CanvasFrameElement = CanvasElementOfType<'frame'>;
export type CanvasTextElement = CanvasElementOfType<'text'>;
export type CanvasShapeElement = CanvasElementOfType<'shape'>;
export type CanvasPathElement = CanvasElementOfType<'path'>;
export type CanvasConnectorElement = CanvasElementOfType<'connector'>;
export type CanvasMarkElement = CanvasElementOfType<'mark'>;
export type CanvasImageGeneratorElement = CanvasElementOfType<'image-generator'>;
export type CanvasVideoGeneratorElement = CanvasElementOfType<'video-generator'>;
export type CanvasStoryboardPlannerElement = CanvasElementOfType<'storyboard-planner'>;

export type CanvasGeneratorElement = CanvasImageGeneratorElement | CanvasVideoGeneratorElement | CanvasStoryboardPlannerElement;
export type CanvasMediaElement = CanvasImageElement | CanvasVideoElement;
export type CanvasDrawableElement = CanvasImageElement | CanvasTextElement | CanvasShapeElement | CanvasPathElement;

export const CANVAS_ELEMENT_TYPES = [
    'image',
    'text',
    'shape',
    'path',
    'image-generator',
    'storyboard-planner',
    'video-generator',
    'video',
    'connector',
    'mark',
    'frame',
] as const satisfies readonly CanvasElementType[];

export const CANVAS_GENERATOR_ELEMENT_TYPES = [
    'image-generator',
    'video-generator',
    'storyboard-planner',
] as const satisfies readonly CanvasElementType[];

export const CANVAS_MEDIA_ELEMENT_TYPES = [
    'image',
    'video',
] as const satisfies readonly CanvasElementType[];

export const CANVAS_DRAWABLE_ELEMENT_TYPES = [
    'image',
    'text',
    'shape',
    'path',
] as const satisfies readonly CanvasElementType[];

export function isCanvasElementType(value: unknown): value is CanvasElementType {
    return typeof value === 'string' && CANVAS_ELEMENT_TYPES.includes(value as CanvasElementType);
}

export function isCanvasElementOfType<TType extends CanvasElementType>(
    element: CanvasElement | null | undefined,
    type: TType,
): element is CanvasElementOfType<TType> {
    return element?.type === type;
}

export function isCanvasGeneratorElement(element: CanvasElement | null | undefined): element is CanvasGeneratorElement {
    return !!element && (CANVAS_GENERATOR_ELEMENT_TYPES as readonly CanvasElementType[]).includes(element.type);
}

export function isCanvasMediaElement(element: CanvasElement | null | undefined): element is CanvasMediaElement {
    return !!element && (CANVAS_MEDIA_ELEMENT_TYPES as readonly CanvasElementType[]).includes(element.type);
}

export function isCanvasDrawableElement(element: CanvasElement | null | undefined): element is CanvasDrawableElement {
    return !!element && (CANVAS_DRAWABLE_ELEMENT_TYPES as readonly CanvasElementType[]).includes(element.type);
}

export type CanvasElementExportFormat = 'png' | 'jpg' | 'svg' | 'original';
