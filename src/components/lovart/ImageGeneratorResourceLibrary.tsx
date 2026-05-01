import { Check, FolderOpen, History, LibraryBig, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { WorkbenchImage } from './WorkbenchImage';
import type {
    FavoriteReferenceImageItem,
    ImageGenerationHistoryItem,
    RecentReferenceImageItem,
} from './image-generation-history';

export type ImageResourceLibraryTab = 'project' | 'favorite' | 'history' | 'library';

interface ImageGeneratorResourceLibraryProps {
    isOpen: boolean;
    resourceLibraryCount: number;
    activeTab: ImageResourceLibraryTab;
    projectReferenceImages: ProjectReferenceImageItem[];
    favoriteReferences: FavoriteReferenceImageItem[];
    recentHistory: ImageGenerationHistoryItem[];
    referenceLibrary: RecentReferenceImageItem[];
    referenceImages: Array<File | string>;
    maxReferenceImages: number;
    editingFavoriteId: string | null;
    favoriteLabelDraft: string;
    isGenerating: boolean;
    onToggle: () => void;
    onTabChange: (tab: ImageResourceLibraryTab) => void;
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
}

function hasSelectedReference(referenceImages: Array<File | string>, image: string) {
    return referenceImages.some((existing) => typeof existing === 'string' && existing === image);
}

export function ImageGeneratorResourceLibrary({
    isOpen,
    resourceLibraryCount,
    activeTab,
    projectReferenceImages,
    favoriteReferences,
    recentHistory,
    referenceLibrary,
    referenceImages,
    maxReferenceImages,
    editingFavoriteId,
    favoriteLabelDraft,
    isGenerating,
    onToggle,
    onTabChange,
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
}: ImageGeneratorResourceLibraryProps) {
    if (resourceLibraryCount <= 0) {
        return null;
    }

    const tabOptions = [
        { key: 'project' as const, label: '项目', count: projectReferenceImages.length, icon: LibraryBig },
        { key: 'favorite' as const, label: '收藏', count: favoriteReferences.length, icon: Star },
        { key: 'history' as const, label: '历史', count: recentHistory.length, icon: History },
        { key: 'library' as const, label: '图库', count: referenceLibrary.length, icon: LibraryBig },
    ].filter((tab) => tab.count > 0);

    const referenceLimitReached = referenceImages.length >= maxReferenceImages;

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
                    <div className="flex items-center border-b border-slate-100 px-1 pt-1">
                        {tabOptions.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => onTabChange(tab.key)}
                                className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                                    activeTab === tab.key
                                        ? 'border-violet-500 text-violet-700'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <tab.icon size={12} />
                                {tab.label}
                                <span className={`text-[10px] ${activeTab === tab.key ? 'text-violet-500' : 'text-slate-400'}`}>({tab.count})</span>
                            </button>
                        ))}
                    </div>

                    <div className="max-h-[280px] overflow-y-auto panel-scroll p-2">
                        {activeTab === 'project' && (
                            <div className="grid grid-cols-4 gap-1.5">
                                {projectReferenceImages.slice(0, 8).map((item) => {
                                    const alreadySelected = hasSelectedReference(referenceImages, item.image);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => onApplyProjectReference(item)}
                                            disabled={alreadySelected || referenceLimitReached}
                                            className={`overflow-hidden rounded-lg border text-left transition-all ${
                                                alreadySelected ? 'cursor-not-allowed border-violet-200 bg-violet-50/80 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm'
                                            }`}
                                            title={item.label}
                                        >
                                            <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 hover:scale-[1.03]" fit="cover" showSurface={false} />
                                            <div className="px-1.5 py-1">
                                                <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'favorite' && (
                            <div className="grid grid-cols-4 gap-1.5">
                                {favoriteReferences.slice(0, 8).map((item) => {
                                    const alreadySelected = hasSelectedReference(referenceImages, item.image);
                                    const isEditingLabel = editingFavoriteId === item.id;
                                    return (
                                        <div key={item.id} className="overflow-hidden rounded-lg border border-slate-200/60 bg-white">
                                            <button
                                                type="button"
                                                onClick={() => onApplyFavoriteReference(item)}
                                                disabled={alreadySelected || referenceLimitReached}
                                                aria-label={`加入常用参考 ${item.label}`}
                                                className={`group block w-full text-left ${alreadySelected ? 'cursor-not-allowed opacity-60' : ''}`}
                                            >
                                                <WorkbenchImage content={item.image} alt={item.label} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 group-hover:scale-[1.03]" fit="cover" showSurface={false} />
                                            </button>
                                            <div className="px-1.5 py-1">
                                                {isEditingLabel ? (
                                                    <div className="flex items-center gap-1">
                                                        <input value={favoriteLabelDraft} title="常用参考名称" aria-label="常用参考名称" onChange={(event) => onFavoriteLabelDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onCommitFavoriteRename(item.id); }} className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 outline-none focus:border-violet-400" />
                                                        <button type="button" onClick={() => onCommitFavoriteRename(item.id)} className="rounded bg-violet-500 p-0.5 text-white hover:bg-violet-600" title="保存常用参考名称" aria-label="保存常用参考名称"><Check size={10} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="truncate text-[10px] font-medium text-slate-700">{item.label}</div>
                                                )}
                                                <div className="mt-0.5 flex items-center justify-end gap-0.5">
                                                    {!isEditingLabel && <button type="button" onClick={() => onStartRenameFavorite(item)} className="rounded p-0.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="重命名常用参考" aria-label="重命名常用参考"><Pencil size={10} /></button>}
                                                    <button type="button" onClick={() => onDeleteFavorite(item.id)} className="rounded p-0.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600" title="删除常用参考" aria-label="删除常用参考"><Trash2 size={10} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div>
                                <div className="divide-y divide-slate-100">
                                    {recentHistory.slice(0, 5).map((item) => (
                                        <div key={item.id} className="flex items-center gap-2 py-2 px-1">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-medium text-slate-700">{item.prompt}</div>
                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                    <span className="text-[10px] text-slate-400">{item.aspectRatio}</span>
                                                    <span className="text-[10px] text-slate-300">·</span>
                                                    <span className="text-[10px] text-slate-400">{item.imageSize}</span>
                                                    <span className="text-[10px] text-slate-300">·</span>
                                                    <span className="text-[10px] text-slate-400">{item.generateCount}张</span>
                                                    {item.referenceImages.length > 0 && (
                                                        <>
                                                            <span className="text-[10px] text-slate-300">·</span>
                                                            <span className="text-[10px] text-amber-600">{item.referenceImages.length}张参考图</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-slate-400 flex-shrink-0">{formatHistoryTime(item.createdAt)}</span>
                                            <button
                                                type="button"
                                                onClick={() => onApplyHistoryItem(item)}
                                                disabled={isGenerating}
                                                className={`flex-shrink-0 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                                    isGenerating ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-violet-500 text-white hover:bg-violet-600'
                                                }`}
                                            >
                                                <RotateCcw size={10} />
                                                回填
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-1 flex justify-end px-1">
                                    <button
                                        type="button"
                                        onClick={onClearHistory}
                                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        清空历史
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'library' && (
                            <div className="grid grid-cols-4 gap-1.5">
                                {referenceLibrary.slice(0, 8).map((item, index) => {
                                    const alreadySelected = hasSelectedReference(referenceImages, item.image);
                                    const isFavorited = favoriteReferences.some((favorite) => favorite.image === item.image);
                                    return (
                                        <div key={`${item.historyId}-${index}`} className={`group overflow-hidden rounded-lg border text-left transition-all ${alreadySelected ? 'border-sky-200 bg-sky-50/80 opacity-60' : 'border-slate-200/60 bg-white hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm'}`}>
                                            <div className="relative">
                                                <button type="button" onClick={() => onApplyReferenceLibraryImage(item.image)} disabled={alreadySelected || referenceLimitReached} className={`block w-full text-left ${alreadySelected ? 'cursor-not-allowed' : ''}`} title={`加入参考图库 ${index + 1}`} aria-label={`加入参考图库 ${index + 1}`}>
                                                    <WorkbenchImage content={item.image} alt={`参考图库 ${index + 1}`} containerClassName="h-[56px] w-full" imageClassName="transition-transform duration-200 group-hover:scale-[1.03]" fit="cover" showSurface={false} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onSaveReferenceFavorite(item.image, item.prompt)}
                                                    className={`absolute right-1 top-1 rounded-full p-0.5 shadow-sm ${isFavorited ? 'bg-amber-500 text-white' : 'bg-white/90 text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}
                                                    title={isFavorited ? '已收藏' : '收藏'}
                                                >
                                                    <Star size={10} className={isFavorited ? 'fill-current' : ''} />
                                                </button>
                                            </div>
                                            <div className="px-1.5 py-1">
                                                <div className="truncate text-[10px] text-slate-500">{item.prompt}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {resourceLibraryCount === 0 && (
                            <div className="py-8 text-center text-xs text-slate-400">暂无资源</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}