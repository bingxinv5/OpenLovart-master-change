import { ChevronDown, Sparkles } from 'lucide-react';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { GeneratorRecoveryTaskCard, GeneratorSubmitButton } from './generator-panel-sections';
import {
    IMAGE_MODEL_LABELS,
    type GenerateCount,
    type ImageAspectRatio as AspectRatio,
    type ImageModel,
    type ImageQuality,
    type ImageSize,
} from './generator-model-options';
import { ImageGeneratorSettingsPanel } from './ImageGeneratorPanelSettings';
import { ImageGeneratorResourceLibrary, type ImageResourceLibraryTab } from './ImageGeneratorResourceLibrary';
import type {
    FavoriteReferenceImageItem,
    ImageGenerationHistoryItem,
    RecentReferenceImageItem,
} from './image-generation-history';

interface ImageGeneratorFooterControlsProps {
    models: ImageModel[];
    model: ImageModel;
    showModelMenu: boolean;
    showSettingsPanel: boolean;
    showResourceLibrary: boolean;
    showRecoveryPanel: boolean;
    canRecoverTask: boolean;
    recoveryTaskId: string;
    isGenerating: boolean;
    isRecovering: boolean;
    submitDisabled: boolean;
    submitLabel: string;
    isOpenAiGptImageModel: boolean;
    imageSize: ImageSize;
    quality: ImageQuality;
    displayedAspectRatio: string;
    generateCount: GenerateCount;
    aspectRatio: AspectRatio;
    settingsSummary: string;
    availableImageSizes: ImageSize[];
    availableImageQualities: ImageQuality[];
    availableAspectRatios: AspectRatio[];
    grokUsesReferenceAspectRatio: boolean;
    resourceLibraryCount: number;
    resourceLibraryTab: ImageResourceLibraryTab;
    projectReferenceImages: ProjectReferenceImageItem[];
    favoriteReferences: FavoriteReferenceImageItem[];
    recentHistory: ImageGenerationHistoryItem[];
    referenceLibrary: RecentReferenceImageItem[];
    referenceImages: Array<File | string>;
    maxReferenceImages: number;
    editingFavoriteId: string | null;
    favoriteLabelDraft: string;
    onToggleModelMenu: () => void;
    onModelChange: (model: ImageModel) => void;
    onToggleSettings: () => void;
    onImageSizeChange: (size: ImageSize) => void;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onQualityChange: (quality: ImageQuality) => void;
    onGenerateCountChange: (count: GenerateCount) => void;
    onToggleResourceLibrary: () => void;
    onResourceLibraryTabChange: (tab: ImageResourceLibraryTab) => void;
    onFavoriteLabelDraftChange: (value: string) => void;
    onApplyProjectReference: (item: ProjectReferenceImageItem) => void;
    onApplyFavoriteReference: (item: FavoriteReferenceImageItem) => void;
    onStartRenameFavorite: (item: FavoriteReferenceImageItem) => void;
    onCommitFavoriteRename: (id: string) => void;
    onDeleteFavorite: (id: string) => void;
    onApplyHistoryItem: (item: ImageGenerationHistoryItem) => void;
    onClearHistory: () => void;
    onApplyReferenceLibraryImage: (image: string) => void;
    onSaveReferenceFavorite: (value: string, seedLabel?: string) => void;
    formatHistoryTime: (timestamp: number) => string;
    onToggleRecovery: () => void;
    onTaskIdChange: (value: string) => void;
    onRecover: () => void;
    onSubmit: () => void;
}

export function ImageGeneratorFooterControls({
    models,
    model,
    showModelMenu,
    showSettingsPanel,
    showResourceLibrary,
    showRecoveryPanel,
    canRecoverTask,
    recoveryTaskId,
    isGenerating,
    isRecovering,
    submitDisabled,
    submitLabel,
    isOpenAiGptImageModel,
    imageSize,
    quality,
    displayedAspectRatio,
    generateCount,
    aspectRatio,
    settingsSummary,
    availableImageSizes,
    availableImageQualities,
    availableAspectRatios,
    grokUsesReferenceAspectRatio,
    resourceLibraryCount,
    resourceLibraryTab,
    projectReferenceImages,
    favoriteReferences,
    recentHistory,
    referenceLibrary,
    referenceImages,
    maxReferenceImages,
    editingFavoriteId,
    favoriteLabelDraft,
    onToggleModelMenu,
    onModelChange,
    onToggleSettings,
    onImageSizeChange,
    onAspectRatioChange,
    onQualityChange,
    onGenerateCountChange,
    onToggleResourceLibrary,
    onResourceLibraryTabChange,
    onFavoriteLabelDraftChange,
    onApplyProjectReference,
    onApplyFavoriteReference,
    onStartRenameFavorite,
    onCommitFavoriteRename,
    onDeleteFavorite,
    onApplyHistoryItem,
    onClearHistory,
    onApplyReferenceLibraryImage,
    onSaveReferenceFavorite,
    formatHistoryTime,
    onToggleRecovery,
    onTaskIdChange,
    onRecover,
    onSubmit,
}: ImageGeneratorFooterControlsProps) {
    return (
        <div className="relative z-10 rounded-b-[20px] border-t border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
                <div className="relative" data-popover-menu>
                    <button
                        onClick={onToggleModelMenu}
                        className="flex items-center gap-1.5 px-2 py-1 hover:bg-white rounded-lg transition-colors text-xs font-medium text-slate-700 whitespace-nowrap"
                    >
                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center flex-shrink-0">
                            <Sparkles size={8} className="text-white" />
                        </div>
                        <span className="max-w-[140px] truncate whitespace-nowrap">{IMAGE_MODEL_LABELS[model]}</span>
                        <ChevronDown size={11} className="text-slate-400" />
                    </button>
                    {showModelMenu && (
                        <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-30 min-w-[200px]">
                            {models.map((item) => (
                                <div key={item} onClick={() => onModelChange(item)} className={`px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg mx-1 transition-colors ${model === item ? 'bg-slate-50' : ''}`}>
                                    <div className={`text-xs font-medium ${model === item ? 'text-violet-600' : 'text-slate-700'}`}>{IMAGE_MODEL_LABELS[item]}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <ImageGeneratorSettingsPanel
                    isOpen={showSettingsPanel}
                    isOpenAiGptImageModel={isOpenAiGptImageModel}
                    imageSize={imageSize}
                    quality={quality}
                    displayedAspectRatio={displayedAspectRatio}
                    generateCount={generateCount}
                    aspectRatio={aspectRatio}
                    settingsSummary={settingsSummary}
                    availableImageSizes={availableImageSizes}
                    availableImageQualities={availableImageQualities}
                    availableAspectRatios={availableAspectRatios}
                    grokUsesReferenceAspectRatio={grokUsesReferenceAspectRatio}
                    onToggle={onToggleSettings}
                    onImageSizeChange={onImageSizeChange}
                    onAspectRatioChange={onAspectRatioChange}
                    onQualityChange={onQualityChange}
                    onGenerateCountChange={onGenerateCountChange}
                />

                <ImageGeneratorResourceLibrary
                    isOpen={showResourceLibrary}
                    resourceLibraryCount={resourceLibraryCount}
                    activeTab={resourceLibraryTab}
                    projectReferenceImages={projectReferenceImages}
                    favoriteReferences={favoriteReferences}
                    recentHistory={recentHistory}
                    referenceLibrary={referenceLibrary}
                    referenceImages={referenceImages}
                    maxReferenceImages={maxReferenceImages}
                    editingFavoriteId={editingFavoriteId}
                    favoriteLabelDraft={favoriteLabelDraft}
                    isGenerating={isGenerating}
                    onToggle={onToggleResourceLibrary}
                    onTabChange={onResourceLibraryTabChange}
                    onFavoriteLabelDraftChange={onFavoriteLabelDraftChange}
                    onApplyProjectReference={onApplyProjectReference}
                    onApplyFavoriteReference={onApplyFavoriteReference}
                    onStartRenameFavorite={onStartRenameFavorite}
                    onCommitFavoriteRename={onCommitFavoriteRename}
                    onDeleteFavorite={onDeleteFavorite}
                    onApplyHistoryItem={onApplyHistoryItem}
                    onClearHistory={onClearHistory}
                    onApplyReferenceLibraryImage={onApplyReferenceLibraryImage}
                    onSaveReferenceFavorite={onSaveReferenceFavorite}
                    formatHistoryTime={formatHistoryTime}
                />

                {canRecoverTask && (
                    <GeneratorRecoveryTaskCard
                        isOpen={showRecoveryPanel}
                        taskId={recoveryTaskId}
                        isGenerating={isGenerating}
                        isRecovering={isRecovering}
                        onToggle={onToggleRecovery}
                        onTaskIdChange={onTaskIdChange}
                        onRecover={onRecover}
                    />
                )}

                <div className="flex-1" />

                <GeneratorSubmitButton
                    disabled={submitDisabled}
                    busy={isGenerating}
                    label={submitLabel}
                    onClick={onSubmit}
                />
            </div>
        </div>
    );
}