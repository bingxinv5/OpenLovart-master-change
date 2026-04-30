import React, { type CSSProperties } from 'react';
import { AnnotateImagePanel } from '@/components/lovart/AnnotateImagePanel';
import { CropImagePanel } from '@/components/lovart/CropImagePanel';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { ImageGeneratorPanel } from '@/components/lovart/ImageGeneratorPanel';
import { SplitStoryboardPanel } from '@/components/lovart/SplitStoryboardPanel';
import { StoryboardPlannerPanel } from '@/components/lovart/StoryboardPlannerPanel';
import { VideoGeneratorPanel } from '@/components/lovart/VideoGeneratorPanel';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { StoryboardExportSelection } from './StoryboardExportSelection';
import { ZoomControl } from './ZoomControl';

type FloatingToolbarProps = React.ComponentProps<typeof FloatingToolbar>;
type StoryboardPlannerPanelProps = React.ComponentProps<typeof StoryboardPlannerPanel>;
type ImageGeneratorPanelProps = React.ComponentProps<typeof ImageGeneratorPanel>;
type VideoGeneratorPanelProps = React.ComponentProps<typeof VideoGeneratorPanel>;
type StoryboardExportSelectionProps = React.ComponentProps<typeof StoryboardExportSelection>;
type AnnotateImagePanelProps = React.ComponentProps<typeof AnnotateImagePanel>;
type CropImagePanelProps = React.ComponentProps<typeof CropImagePanel>;
type SplitStoryboardPanelProps = React.ComponentProps<typeof SplitStoryboardPanel>;
type ZoomControlProps = React.ComponentProps<typeof ZoomControl>;

interface CanvasFloatingToolPanelsProps {
    toolbarProps: FloatingToolbarProps;
    selectedGeneratorElement: CanvasElement | null;
    selectedGeneratorPanelStyle: CSSProperties | null | undefined;
    storyboardPlannerSourceElement: CanvasElement | null;
    storyboardPlannerPanelStyle: CSSProperties | null | undefined;
    selectedModel: StoryboardPlannerPanelProps['selectedModel'];
    projectReferenceItems: StoryboardPlannerPanelProps['projectReferenceImages'];
    generatorPanelCanvasImages: StoryboardPlannerPanelProps['canvasImages'];
    selectedCanvasImageIds: StoryboardPlannerPanelProps['selectedCanvasImageIds'];
    canvasElements: ImageGeneratorPanelProps['canvasElements'];
    generatorSubmittingMap: Record<string, boolean>;
    projectMediaItems: VideoGeneratorPanelProps['projectMediaItems'];
    onUseProjectReferenceImage: StoryboardPlannerPanelProps['onUseProjectReferenceImage'];
    onRequestCanvasSelectImage: (overrideGeneratorId?: string) => void;
    onRequestCanvasSelectVideo: VideoGeneratorPanelProps['onRequestCanvasSelect'];
    onElementChange: ImageGeneratorPanelProps['onElementChange'];
    onGeneratorSubmittingChange: ImageGeneratorPanelProps['onSubmittingChange'];
    onCreateStoryboardDraft: StoryboardPlannerPanelProps['onCreateDraft'];
    onGenerateImage: ImageGeneratorPanelProps['onGenerate'];
    onRecoverImageTask: ImageGeneratorPanelProps['onRecoverTask'];
    onAddGeneratedBatchImageElement: ImageGeneratorPanelProps['onAddElement'];
    onGenerateVideo: VideoGeneratorPanelProps['onGenerate'];
    onRecoverVideoTask: VideoGeneratorPanelProps['onRecoverTask'];
    onRecordProjectMediaItem: VideoGeneratorPanelProps['onRecordProjectMediaItem'];
    onClearSelection: () => void;
    onCloseStoryboardPlannerSource: () => void;
    storyboardExportProps: StoryboardExportSelectionProps;
    selectedAnnotateImageElement: CanvasElement | null;
    selectedAnnotateImagePanelStyle: CSSProperties | null | undefined;
    isAnnotateImageSubmitting: boolean;
    annotateImageSubmitStatus: string;
    onCloseAnnotateImage: () => void;
    onAnnotateImage: (element: CanvasElement, options: Parameters<AnnotateImagePanelProps['onSubmit']>[0]) => void | Promise<void>;
    selectedCropImageElement: CanvasElement | null;
    selectedCropImagePanelStyle: CSSProperties | null | undefined;
    isCropImageSubmitting: boolean;
    cropImageSubmitStatus: string;
    onCloseCropImage: () => void;
    onCropImage: (element: CanvasElement, options: Parameters<CropImagePanelProps['onSubmit']>[0]) => void | Promise<void>;
    selectedSplitStoryboardElement: CanvasElement | null;
    selectedSplitStoryboardPanelStyle: CSSProperties | null | undefined;
    isSplitStoryboardSubmitting: boolean;
    splitStoryboardSubmitStatus: string;
    onCloseSplitStoryboard: () => void;
    onSplitStoryboard: (element: CanvasElement, options: Parameters<SplitStoryboardPanelProps['onSubmit']>[0]) => void | Promise<void>;
    onCancelImageWorkerTask: (label: string) => void;
    zoomProps: ZoomControlProps;
}

export function CanvasFloatingToolPanels({
    toolbarProps,
    selectedGeneratorElement,
    selectedGeneratorPanelStyle,
    storyboardPlannerSourceElement,
    storyboardPlannerPanelStyle,
    selectedModel,
    projectReferenceItems,
    generatorPanelCanvasImages,
    selectedCanvasImageIds,
    canvasElements,
    generatorSubmittingMap,
    projectMediaItems,
    onUseProjectReferenceImage,
    onRequestCanvasSelectImage,
    onRequestCanvasSelectVideo,
    onElementChange,
    onGeneratorSubmittingChange,
    onCreateStoryboardDraft,
    onGenerateImage,
    onRecoverImageTask,
    onAddGeneratedBatchImageElement,
    onGenerateVideo,
    onRecoverVideoTask,
    onRecordProjectMediaItem,
    onClearSelection,
    onCloseStoryboardPlannerSource,
    storyboardExportProps,
    selectedAnnotateImageElement,
    selectedAnnotateImagePanelStyle,
    isAnnotateImageSubmitting,
    annotateImageSubmitStatus,
    onCloseAnnotateImage,
    onAnnotateImage,
    selectedCropImageElement,
    selectedCropImagePanelStyle,
    isCropImageSubmitting,
    cropImageSubmitStatus,
    onCloseCropImage,
    onCropImage,
    selectedSplitStoryboardElement,
    selectedSplitStoryboardPanelStyle,
    isSplitStoryboardSubmitting,
    splitStoryboardSubmitStatus,
    onCloseSplitStoryboard,
    onSplitStoryboard,
    onCancelImageWorkerTask,
    zoomProps,
}: CanvasFloatingToolPanelsProps) {
    return (
        <>
            <FloatingToolbar {...toolbarProps} />

            {selectedGeneratorElement?.type === 'storyboard-planner' && selectedGeneratorPanelStyle && (
                <StoryboardPlannerPanel
                    key={selectedGeneratorElement.id}
                    elementId={selectedGeneratorElement.id}
                    style={selectedGeneratorPanelStyle}
                    selectedModel={selectedModel}
                    projectReferenceImages={projectReferenceItems}
                    onUseProjectReferenceImage={onUseProjectReferenceImage}
                    canvasImages={generatorPanelCanvasImages}
                    selectedCanvasImageIds={selectedCanvasImageIds}
                    onRequestCanvasSelect={onRequestCanvasSelectImage}
                    onElementChange={onElementChange}
                    onSubmittingChange={onGeneratorSubmittingChange}
                    onClose={onClearSelection}
                    onCreateDraft={onCreateStoryboardDraft}
                />
            )}

            {storyboardPlannerSourceElement && storyboardPlannerPanelStyle && (
                <StoryboardPlannerPanel
                    key={`image-storyboard-${storyboardPlannerSourceElement.id}`}
                    elementId={storyboardPlannerSourceElement.id}
                    style={storyboardPlannerPanelStyle}
                    selectedModel={selectedModel}
                    projectReferenceImages={projectReferenceItems}
                    onUseProjectReferenceImage={onUseProjectReferenceImage}
                    canvasImages={generatorPanelCanvasImages}
                    selectedCanvasImageIds={[storyboardPlannerSourceElement.id]}
                    onRequestCanvasSelect={() => onRequestCanvasSelectImage(storyboardPlannerSourceElement.id)}
                    onClose={onCloseStoryboardPlannerSource}
                    onCreateDraft={onCreateStoryboardDraft}
                />
            )}

            {selectedGeneratorElement?.type === 'image-generator' && selectedGeneratorPanelStyle && (
                <ImageGeneratorPanel
                    key={selectedGeneratorElement.id}
                    elementId={selectedGeneratorElement.id}
                    onGenerate={onGenerateImage}
                    onRecoverTask={onRecoverImageTask}
                    isGenerating={!!generatorSubmittingMap[selectedGeneratorElement.id]}
                    projectReferenceImages={projectReferenceItems}
                    onUseProjectReferenceImage={onUseProjectReferenceImage}
                    canvasElements={canvasElements}
                    onElementChange={onElementChange}
                    onSubmittingChange={onGeneratorSubmittingChange}
                    onAddElement={onAddGeneratedBatchImageElement}
                    onRequestCanvasSelect={onRequestCanvasSelectImage}
                    style={selectedGeneratorPanelStyle}
                />
            )}

            {selectedGeneratorElement?.type === 'video-generator' && selectedGeneratorPanelStyle && (
                <VideoGeneratorPanel
                    key={selectedGeneratorElement.id}
                    elementId={selectedGeneratorElement.id}
                    onGenerate={onGenerateVideo}
                    onRecoverTask={onRecoverVideoTask}
                    isGenerating={!!generatorSubmittingMap[selectedGeneratorElement.id]}
                    projectReferenceImages={projectReferenceItems}
                    onUseProjectReferenceImage={onUseProjectReferenceImage}
                    projectMediaItems={projectMediaItems}
                    onRecordProjectMediaItem={onRecordProjectMediaItem}
                    canvasElements={canvasElements}
                    onElementChange={onElementChange}
                    onSubmittingChange={onGeneratorSubmittingChange}
                    onRequestCanvasSelect={onRequestCanvasSelectVideo}
                    style={selectedGeneratorPanelStyle}
                />
            )}

            <StoryboardExportSelection {...storyboardExportProps} />

            {selectedAnnotateImageElement && selectedAnnotateImagePanelStyle && (
                <AnnotateImagePanel
                    key={selectedAnnotateImageElement.id}
                    element={selectedAnnotateImageElement}
                    style={selectedAnnotateImagePanelStyle}
                    isSubmitting={isAnnotateImageSubmitting}
                    submitStatusText={annotateImageSubmitStatus}
                    onCancelSubmit={() => onCancelImageWorkerTask('标注任务')}
                    onClose={onCloseAnnotateImage}
                    onSubmit={(options) => void onAnnotateImage(selectedAnnotateImageElement, options)}
                />
            )}

            {selectedCropImageElement && selectedCropImagePanelStyle && (
                <CropImagePanel
                    key={selectedCropImageElement.id}
                    element={selectedCropImageElement}
                    style={selectedCropImagePanelStyle}
                    isSubmitting={isCropImageSubmitting}
                    submitStatusText={cropImageSubmitStatus}
                    onCancelSubmit={() => onCancelImageWorkerTask('裁剪任务')}
                    onClose={onCloseCropImage}
                    onSubmit={(options) => void onCropImage(selectedCropImageElement, options)}
                />
            )}

            {selectedSplitStoryboardElement && selectedSplitStoryboardPanelStyle && (
                <SplitStoryboardPanel
                    key={selectedSplitStoryboardElement.id}
                    element={selectedSplitStoryboardElement}
                    style={selectedSplitStoryboardPanelStyle}
                    isSubmitting={isSplitStoryboardSubmitting}
                    submitStatusText={splitStoryboardSubmitStatus}
                    onCancelSubmit={() => onCancelImageWorkerTask('分镜切割任务')}
                    onClose={onCloseSplitStoryboard}
                    onSubmit={(options) => void onSplitStoryboard(selectedSplitStoryboardElement, options)}
                />
            )}

            <ZoomControl {...zoomProps} />
        </>
    );
}
