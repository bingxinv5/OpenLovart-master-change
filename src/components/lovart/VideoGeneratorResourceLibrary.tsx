import { Film, FolderOpen, LibraryBig, Volume2 } from 'lucide-react';
import type { ProjectMediaHistoryItem } from '@/lib/project-media-history';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { WorkbenchImage } from './WorkbenchImage';
import type { ResourceLibraryTab } from './generator-reference-view-model';
import type { VideoAddImageType } from './VideoGeneratorPanelSettings';

interface VideoGeneratorResourceLibraryProps {
    isOpen: boolean;
    resourceLibraryCount: number;
    isDomesticModel: boolean;
    isDomesticOmniMode: boolean;
    activeResourceTab: ResourceLibraryTab;
    usesFrameImages: boolean;
    usesReferenceImages: boolean;
    availableImageTypes: Array<{ value: VideoAddImageType; label: string }>;
    addImageType: VideoAddImageType;
    projectReferenceImages: ProjectReferenceImageItem[];
    projectVideoLibrary: ProjectMediaHistoryItem[];
    projectAudioLibrary: ProjectMediaHistoryItem[];
    canAddMoreImages: boolean;
    canAddMoreVideos: boolean;
    canAddMoreAudios: boolean;
    onToggle: () => void;
    onTabChange: (tab: ResourceLibraryTab) => void;
    onAddImageTypeChange: (value: VideoAddImageType) => void;
    onApplyProjectReference: (item: ProjectReferenceImageItem) => void;
    onApplyProjectMediaReference: (item: ProjectMediaHistoryItem) => void;
}

export function VideoGeneratorResourceLibrary({
    isOpen,
    resourceLibraryCount,
    isDomesticModel,
    isDomesticOmniMode,
    activeResourceTab,
    usesFrameImages,
    usesReferenceImages,
    availableImageTypes,
    addImageType,
    projectReferenceImages,
    projectVideoLibrary,
    projectAudioLibrary,
    canAddMoreImages,
    canAddMoreVideos,
    canAddMoreAudios,
    onToggle,
    onTabChange,
    onAddImageTypeChange,
    onApplyProjectReference,
    onApplyProjectMediaReference,
}: VideoGeneratorResourceLibraryProps) {
    if (resourceLibraryCount <= 0) {
        return null;
    }

    return (
        <div className="relative" data-popover-menu>
            <button
                onClick={onToggle}
                className={`relative flex items-center justify-center rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${isOpen ? 'bg-violet-50 text-violet-600' : 'text-slate-500 hover:bg-white'}`}
                title="资源库"
            >
                <FolderOpen size={13} />
                <span className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${isOpen ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{resourceLibraryCount}</span>
            </button>

            {isOpen && (
                <div className="absolute bottom-full right-0 mb-1 bg-white/96 backdrop-blur-xl rounded-[16px] shadow-lg border border-slate-200/60 z-30 w-[400px] overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <LibraryBig size={12} className="text-violet-600" />
                        <span className="text-xs font-medium text-slate-700">项目素材库</span>
                        <span className="text-[10px] text-slate-400">({resourceLibraryCount})</span>
                    </div>

                    {isDomesticModel && (
                        <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
                            {([
                                { id: 'image' as const, label: '图片', count: projectReferenceImages.length },
                                ...(isDomesticOmniMode
                                    ? [
                                        { id: 'video' as const, label: '视频', count: projectVideoLibrary.length },
                                        { id: 'audio' as const, label: '音频', count: projectAudioLibrary.length },
                                    ]
                                    : []),
                            ]).map((tab) => (
                                <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${activeResourceTab === tab.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tab.label} {tab.count}</button>
                            ))}
                        </div>
                    )}

                    {activeResourceTab === 'image' && usesFrameImages && availableImageTypes.length > 0 && (
                        <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">帧类型:</span>
                            {availableImageTypes.map((typeOption) => (
                                <button key={typeOption.value} type="button" onClick={() => onAddImageTypeChange(typeOption.value)} className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${addImageType === typeOption.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{typeOption.label}</button>
                            ))}
                        </div>
                    )}

                    <div className="max-h-[240px] overflow-y-auto panel-scroll p-2">
                        {activeResourceTab === 'image' && (
                            projectReferenceImages.length > 0 ? (
                                <div className="grid grid-cols-4 gap-1.5">
                                    {projectReferenceImages.slice(0, 8).map((item) => {
                                        const isDisabled = !canAddMoreImages;
                                        return (
                                            <button key={item.id} type="button" onClick={() => onApplyProjectReference(item)} disabled={isDisabled} className={`overflow-hidden rounded-lg border text-left transition-all ${isDisabled ? 'cursor-not-allowed border-violet-200 bg-violet-50/70 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm'}`} title={item.label}>
                                                <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                <div className="px-1.5 py-1">
                                                    <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                                    <div className="text-[9px] text-violet-600">{isDisabled ? '已达上限' : usesReferenceImages ? '加入参考' : `加入${addImageType === 'last_frame' ? '尾帧' : '首帧'}`}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">项目里还没有可用的参考图片</div>
                            )
                        )}

                        {activeResourceTab === 'video' && (
                            projectVideoLibrary.length > 0 ? (
                                <div className="space-y-1.5">
                                    {projectVideoLibrary.slice(0, 8).map((item) => {
                                        const isDisabled = !canAddMoreVideos;
                                        return (
                                            <button key={item.id} type="button" onClick={() => onApplyProjectMediaReference(item)} disabled={isDisabled} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isDisabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'}`}>
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><Film size={15} /></div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-[11px] font-medium text-slate-700">{item.prompt || '项目视频素材'}</div>
                                                    <div className="text-[10px] text-slate-400">{isDisabled ? '视频参考已达上限' : '加入参考视频'}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">当前项目还没有可复用的视频素材</div>
                            )
                        )}

                        {activeResourceTab === 'audio' && (
                            projectAudioLibrary.length > 0 ? (
                                <div className="space-y-1.5">
                                    {projectAudioLibrary.slice(0, 8).map((item) => {
                                        const isDisabled = !canAddMoreAudios;
                                        return (
                                            <button key={item.id} type="button" onClick={() => onApplyProjectMediaReference(item)} disabled={isDisabled} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isDisabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'}`}>
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Volume2 size={15} /></div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-[11px] font-medium text-slate-700">{item.prompt || '项目音频素材'}</div>
                                                    <div className="text-[10px] text-slate-400">{isDisabled ? '音频参考已达上限' : '加入参考音频'}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400">当前项目还没有可复用的音频素材</div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}