import React from 'react';
import { ChevronDown, Film, Loader2, Wand2 } from 'lucide-react';
import type { ImageGenerationDefaults } from '@/lib/generation-defaults';
import {
    describeOpenAiGptImageAspectRatio,
    isOpenAiGptImageModel as isKnownOpenAiGptImageModel,
    resolveOpenAiGptImageAspectRatio,
    resolveOpenAiGptImageQuality,
} from '@/lib/image-generation-models';

type AspectRatioOption = 'auto' | ImageGenerationDefaults['aspectRatio'];

interface StoryboardPlannerFooterProps {
    hasResult: boolean;
    combinedPrompt: string;
    isPlanning: boolean;
    isGeneratingBoard: boolean;
    imageDefaults: ImageGenerationDefaults;
    isOpenAiGptImageModel: boolean;
    supportsOpenAiGptExperimentalSize: boolean;
    derivedOpenAiGptAspectRatio: string;
    isOpenAiGptImageExperimentalSize: boolean;
    storyboardAspectRatio: ImageGenerationDefaults['aspectRatio'];
    userAspectRatio: AspectRatioOption;
    userImageSize: string;
    userQuality: ImageGenerationDefaults['quality'];
    userModel: ImageGenerationDefaults['model'];
    userQualityOverride: boolean;
    experimentalUserImageSizeInput: string;
    experimentalUserImageSizeError: string | null;
    showAspectRatioMenu: boolean;
    showSizeMenu: boolean;
    showQualityMenu: boolean;
    showModelMenu: boolean;
    availableAspectRatioOptions: AspectRatioOption[];
    availableImageSizeOptions: string[];
    availableImageQualityOptions: ImageGenerationDefaults['quality'][];
    modelOptions: ImageGenerationDefaults['model'][];
    onClose: () => void;
    onBuildStoryboardPrompt: () => void;
    onGenerateStoryboardBoard: () => void;
    onApplyExperimentalUserImageSize: () => void;
    setUserAspectRatio: (value: AspectRatioOption) => void;
    setUserAspectRatioOverride: (value: boolean) => void;
    setUserImageSize: (value: string) => void;
    setUserImageSizeOverride: (value: boolean) => void;
    setUserQuality: (value: ImageGenerationDefaults['quality']) => void;
    setUserQualityOverride: (value: boolean) => void;
    setUserModel: (value: ImageGenerationDefaults['model']) => void;
    setUserModelOverride: (value: boolean) => void;
    setExperimentalUserImageSizeInput: (value: string) => void;
    setExperimentalUserImageSizeError: (value: string | null) => void;
    setShowAspectRatioMenu: (value: boolean) => void;
    setShowSizeMenu: (value: boolean) => void;
    setShowQualityMenu: (value: boolean) => void;
    setShowModelMenu: (value: boolean) => void;
}

export function StoryboardPlannerFooter({
    hasResult,
    combinedPrompt,
    isPlanning,
    isGeneratingBoard,
    imageDefaults,
    isOpenAiGptImageModel,
    supportsOpenAiGptExperimentalSize,
    derivedOpenAiGptAspectRatio,
    isOpenAiGptImageExperimentalSize,
    storyboardAspectRatio,
    userAspectRatio,
    userImageSize,
    userQuality,
    userModel,
    userQualityOverride,
    experimentalUserImageSizeInput,
    experimentalUserImageSizeError,
    showAspectRatioMenu,
    showSizeMenu,
    showQualityMenu,
    showModelMenu,
    availableAspectRatioOptions,
    availableImageSizeOptions,
    availableImageQualityOptions,
    modelOptions,
    onClose,
    onBuildStoryboardPrompt,
    onGenerateStoryboardBoard,
    onApplyExperimentalUserImageSize,
    setUserAspectRatio,
    setUserAspectRatioOverride,
    setUserImageSize,
    setUserImageSizeOverride,
    setUserQuality,
    setUserQualityOverride,
    setUserModel,
    setUserModelOverride,
    setExperimentalUserImageSizeInput,
    setExperimentalUserImageSizeError,
    setShowAspectRatioMenu,
    setShowSizeMenu,
    setShowQualityMenu,
    setShowModelMenu,
}: StoryboardPlannerFooterProps) {
    return (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
            {!hasResult && (
                <div className="mb-2 flex items-center justify-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-800 text-[8px] font-bold text-white">1</span> 生成提示词</span>
                    <span className="text-slate-300">→</span>
                    <span className="flex items-center gap-1"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-500">2</span> 生成宫格图</span>
                </div>
            )}

            <div className="mb-2 flex flex-wrap items-center gap-1">
                {isOpenAiGptImageModel ? (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 pl-2 pr-1.5 py-1 rounded-md border border-slate-200/60 bg-slate-50/80">
                        <span className="text-slate-400">比例</span>
                        <span className="text-slate-700 font-medium">{derivedOpenAiGptAspectRatio}</span>
                    </div>
                ) : (
                    <div className="relative">
                        <button type="button" onClick={() => { setShowAspectRatioMenu(!showAspectRatioMenu); setShowModelMenu(false); setShowSizeMenu(false); setShowQualityMenu(false); }} className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:bg-slate-100/80 pl-2 pr-1.5 py-1 rounded-md transition-all border border-slate-200/60">
                            <span className="text-slate-400">比例</span>
                            <span className="text-slate-700 font-medium">{userAspectRatio === 'auto' ? `自动(${storyboardAspectRatio})` : userAspectRatio}</span>
                            <ChevronDown size={10} className="text-slate-400" />
                        </button>
                        {showAspectRatioMenu && (
                            <div className="absolute bottom-full mb-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg z-10 min-w-[70px] max-h-[200px] overflow-y-auto">
                                {availableAspectRatioOptions.map((ratio) => (
                                    <div key={ratio} onClick={() => { setUserAspectRatio(ratio); setUserAspectRatioOverride(ratio !== imageDefaults.aspectRatio); setShowAspectRatioMenu(false); }} className={`px-2.5 py-1 text-[11px] cursor-pointer hover:bg-slate-50 rounded mx-0.5 transition-colors ${userAspectRatio === ratio ? 'text-sky-600 font-semibold bg-sky-50/60' : 'text-slate-700'}`}>
                                        {ratio === 'auto' ? `自动(${storyboardAspectRatio})` : ratio}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="relative">
                    <button type="button" onClick={() => { setShowSizeMenu(!showSizeMenu); setShowModelMenu(false); setShowAspectRatioMenu(false); setShowQualityMenu(false); }} className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:bg-slate-100/80 pl-2 pr-1.5 py-1 rounded-md transition-all border border-slate-200/60">
                        <span className="text-slate-400">尺寸</span>
                        <span className="text-slate-700 font-medium">{userImageSize}</span>
                        <ChevronDown size={10} className="text-slate-400" />
                    </button>
                    {showSizeMenu && (
                        <div className={`absolute bottom-full mb-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg z-10 ${isOpenAiGptImageModel ? 'min-w-[220px]' : 'min-w-[50px]'}`}>
                            {supportsOpenAiGptExperimentalSize && (
                                <div className="border-b border-slate-100 px-2.5 py-2">
                                    <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-slate-500">
                                        <span>尺寸</span>
                                        {isOpenAiGptImageExperimentalSize && <span className="text-amber-600">当前为自定义尺寸</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-400">支持 auto、官方推荐 preset，也支持输入任意满足约束的尺寸</div>
                                </div>
                            )}
                            <div className={isOpenAiGptImageModel ? 'max-h-[180px] overflow-y-auto' : undefined}>
                                {availableImageSizeOptions.map((size) => (
                                    <div key={size} onClick={() => {
                                        setUserImageSize(size);
                                        setUserImageSizeOverride(size !== imageDefaults.imageSize);
                                        if (isOpenAiGptImageModel) {
                                            setUserAspectRatio(resolveOpenAiGptImageAspectRatio(size, userAspectRatio));
                                            setUserAspectRatioOverride(false);
                                        }
                                        if (supportsOpenAiGptExperimentalSize) {
                                            setExperimentalUserImageSizeError(null);
                                        }
                                        setShowSizeMenu(false);
                                    }} className={`px-2.5 py-1 text-[11px] cursor-pointer hover:bg-slate-50 rounded mx-0.5 transition-colors ${userImageSize === size ? 'text-sky-600 font-semibold bg-sky-50/60' : 'text-slate-700'}`}>
                                        <div>{size}</div>
                                        {isOpenAiGptImageModel && <div className="text-[10px] text-slate-400">{describeOpenAiGptImageAspectRatio(size, userAspectRatio)}</div>}
                                    </div>
                                ))}
                            </div>
                            {supportsOpenAiGptExperimentalSize && (
                                <div className="border-t border-slate-100 px-2.5 py-2">
                                    <div className="mb-1 text-[10px] font-medium text-slate-500">自定义尺寸</div>
                                    <div className="flex gap-1.5">
                                        <input
                                            type="text"
                                            value={experimentalUserImageSizeInput}
                                            onChange={(event) => {
                                                setExperimentalUserImageSizeInput(event.target.value);
                                                if (experimentalUserImageSizeError) setExperimentalUserImageSizeError(null);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    onApplyExperimentalUserImageSize();
                                                }
                                            }}
                                            placeholder="2048x1152"
                                            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                                        />
                                        <button type="button" onClick={onApplyExperimentalUserImageSize} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-slate-700">
                                            应用
                                        </button>
                                    </div>
                                    <div className="mt-1 text-[10px] leading-4 text-slate-400">约束：最长边不超过 3840，宽高均为 16 的倍数，长短边比不超过 3:1，总像素在 655,360 到 8,294,400 之间</div>
                                    {experimentalUserImageSizeError && <div className="mt-1 text-[10px] text-red-600">{experimentalUserImageSizeError}</div>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isOpenAiGptImageModel && (
                    <div className="relative">
                        <button type="button" onClick={() => { setShowQualityMenu(!showQualityMenu); setShowModelMenu(false); setShowAspectRatioMenu(false); setShowSizeMenu(false); }} className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:bg-slate-100/80 pl-2 pr-1.5 py-1 rounded-md transition-all border border-slate-200/60">
                            <span className="text-slate-400">质量</span>
                            <span className="text-slate-700 font-medium">{userQuality}</span>
                            <ChevronDown size={10} className="text-slate-400" />
                        </button>
                        {showQualityMenu && (
                            <div className="absolute bottom-full mb-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg z-10 min-w-[72px]">
                                {availableImageQualityOptions.map((value) => (
                                    <div
                                        key={value}
                                        onClick={() => {
                                            setUserQuality(value);
                                            setUserQualityOverride(value !== resolveOpenAiGptImageQuality(imageDefaults.quality));
                                            setShowQualityMenu(false);
                                        }}
                                        className={`px-2.5 py-1 text-[11px] cursor-pointer hover:bg-slate-50 rounded mx-0.5 transition-colors ${userQuality === value ? 'text-sky-600 font-semibold bg-sky-50/60' : 'text-slate-700'}`}
                                    >
                                        {value}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="relative">
                    <button type="button" onClick={() => { setShowModelMenu(!showModelMenu); setShowAspectRatioMenu(false); setShowSizeMenu(false); setShowQualityMenu(false); }} className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer hover:bg-slate-100/80 pl-2 pr-1.5 py-1 rounded-md transition-all border border-slate-200/60">
                        <span className="text-slate-400">模型</span>
                        <span className="text-slate-700 font-medium truncate max-w-[120px]">{userModel}</span>
                        <ChevronDown size={10} className="text-slate-400" />
                    </button>
                    {showModelMenu && (
                        <div className="absolute bottom-full mb-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg z-10 min-w-[140px]">
                            {modelOptions.map((model) => (
                                <div key={model} onClick={() => {
                                    setUserModel(model);
                                    setUserModelOverride(model !== imageDefaults.model);
                                    if (isKnownOpenAiGptImageModel(model)) {
                                        if (!userQualityOverride) setUserQuality(resolveOpenAiGptImageQuality(imageDefaults.quality));
                                    } else {
                                        setUserQuality('auto');
                                        setUserQualityOverride(false);
                                    }
                                    setShowModelMenu(false);
                                }} className={`px-2.5 py-1 text-[11px] cursor-pointer hover:bg-slate-50 rounded mx-0.5 transition-colors ${userModel === model ? 'text-sky-600 font-semibold bg-sky-50/60' : 'text-slate-700'}`}>
                                    {model}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-md border border-slate-200/60 px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
                    关闭
                </button>
                <button type="button" onClick={onBuildStoryboardPrompt} disabled={isPlanning || isGeneratingBoard} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {isPlanning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    <span>{isPlanning ? '生成中...' : '生成提示词'}</span>
                </button>
                <button type="button" onClick={onGenerateStoryboardBoard} disabled={isPlanning || isGeneratingBoard || !hasResult || !combinedPrompt.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-slate-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40">
                    {isGeneratingBoard ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
                    <span>{isGeneratingBoard ? '生成中...' : '生成宫格图'}</span>
                </button>
            </div>
        </div>
    );
}