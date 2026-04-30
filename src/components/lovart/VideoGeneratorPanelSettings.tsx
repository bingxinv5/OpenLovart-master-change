import { ChevronDown, Film, MousePointerClick, Settings2, Sparkles, Upload, Volume2 } from 'lucide-react';
import type {
    DomesticGenerationMode,
    VideoAspectRatio as AspectRatio,
    VideoDurationValue as Duration,
    VideoResolution,
} from './generator-model-options';

export type VideoAddImageType = 'first_frame' | 'last_frame' | 'reference';

interface VideoAddReferenceMenuProps {
    isOpen: boolean;
    usesFrameImages: boolean;
    availableImageTypes: Array<{ value: VideoAddImageType; label: string }>;
    addImageType: VideoAddImageType;
    canAddMoreImages: boolean;
    canAddMoreVideos: boolean;
    canAddMoreAudios: boolean;
    isDomesticOmniMode: boolean;
    usesReferenceImages: boolean;
    onAddImageTypeChange: (value: VideoAddImageType) => void;
    onUploadImage: () => void;
    onUploadVideo: () => void;
    onUploadAudio: () => void;
    onSelectFromCanvas: (imageType: VideoAddImageType) => void;
}

export function VideoAddReferenceMenu({
    isOpen,
    usesFrameImages,
    availableImageTypes,
    addImageType,
    canAddMoreImages,
    canAddMoreVideos,
    canAddMoreAudios,
    isDomesticOmniMode,
    usesReferenceImages,
    onAddImageTypeChange,
    onUploadImage,
    onUploadVideo,
    onUploadAudio,
    onSelectFromCanvas,
}: VideoAddReferenceMenuProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="absolute bottom-[48px] left-3 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-50 min-w-[160px]" data-popover-menu>
            {usesFrameImages && availableImageTypes.length > 1 && (
                <>
                    <div className="px-2 py-1 text-[10px] text-slate-400 uppercase">帧类型</div>
                    <div className="flex gap-1 px-2 pb-1">
                        {availableImageTypes.map((type) => (
                            <button key={type.value} onClick={() => onAddImageTypeChange(type.value)} className={`px-2 py-0.5 text-xs rounded-md transition-colors ${addImageType === type.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{type.label}</button>
                        ))}
                    </div>
                    <div className="border-t border-slate-100 my-1" />
                </>
            )}
            <button type="button" onClick={onUploadImage} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                <Upload size={14} className="text-slate-400" /><span>上传图片</span>
            </button>
            {isDomesticOmniMode && (
                <>
                    <button type="button" onClick={onUploadVideo} disabled={!canAddMoreVideos} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreVideos ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                        <Film size={14} className="text-slate-400" /><span>上传视频</span>
                    </button>
                    <button type="button" onClick={onUploadAudio} disabled={!canAddMoreAudios} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreAudios ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                        <Volume2 size={14} className="text-slate-400" /><span>上传音频</span>
                    </button>
                </>
            )}
            <button type="button" onClick={() => onSelectFromCanvas(usesReferenceImages ? 'reference' : addImageType)} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                <MousePointerClick size={14} className="text-slate-400" /><span>从画布选择</span>
            </button>
        </div>
    );
}

interface VideoGeneratorSettingsPanelProps {
    isOpen: boolean;
    isDomesticModel: boolean;
    domesticMode: DomesticGenerationMode;
    aspectRatio: AspectRatio;
    resolution: VideoResolution;
    duration: Duration;
    generateAudio: boolean;
    enhancePrompt: boolean;
    isGenerating: boolean;
    isReferenceUploadBusy: boolean;
    aspectRatios: AspectRatio[];
    resolutionOptions: VideoResolution[];
    durations: Duration[];
    onToggle: () => void;
    onDomesticModeChange: (mode: DomesticGenerationMode) => void;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onResolutionChange: (resolution: VideoResolution) => void;
    onDurationChange: (duration: Duration) => void;
    onGenerateAudioChange: (enabled: boolean) => void;
    onEnhancePromptChange: (enabled: boolean) => void;
}

const RATIO_SHAPES: Record<string, { w: number; h: number }> = {
    '16:9': { w: 14, h: 8 },
    '9:16': { w: 8, h: 14 },
    '1:1': { w: 10, h: 10 },
    '4:3': { w: 12, h: 9 },
    '3:4': { w: 9, h: 12 },
};

export function VideoGeneratorSettingsPanel({
    isOpen,
    isDomesticModel,
    domesticMode,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    enhancePrompt,
    isGenerating,
    isReferenceUploadBusy,
    aspectRatios,
    resolutionOptions,
    durations,
    onToggle,
    onDomesticModeChange,
    onAspectRatioChange,
    onResolutionChange,
    onDurationChange,
    onGenerateAudioChange,
    onEnhancePromptChange,
}: VideoGeneratorSettingsPanelProps) {
    return (
        <div className="relative shrink-0" data-popover-menu>
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/60 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white hover:text-slate-700 hover:border-slate-300"
            >
                {isDomesticModel && <><Settings2 size={12} /><span className="font-medium">{domesticMode === 'first-last-frame' ? '首尾帧' : '全能参考'}</span><span className="text-slate-300">·</span></>}
                <span>{aspectRatio}</span>
                <span className="text-slate-300">·</span>
                {isDomesticModel && <><span>{resolution.toUpperCase()}</span><span className="text-slate-300">·</span></>}
                <span>{duration}</span>
                {isDomesticModel && <><span className="text-slate-300">·</span><Volume2 size={11} className={generateAudio ? 'text-emerald-500' : 'text-slate-300'} /></>}
                {enhancePrompt && <><span className="text-slate-300">·</span><Sparkles size={11} className="text-violet-500" /></>}
                <ChevronDown size={11} className="text-slate-400 ml-0.5" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[280px] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <span className="text-xs font-medium text-slate-700">生成设置</span>
                        <span className="text-[10px] text-slate-400">{isDomesticModel ? `${domesticMode === 'first-last-frame' ? '首尾帧' : '全能参考'} · ` : ''}{aspectRatio}{isDomesticModel ? ` · ${resolution.toUpperCase()}` : ''} · {duration}</span>
                    </div>
                    <div className="p-4 space-y-0">
                        {isDomesticModel && (
                            <div className="rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/80 p-3 mb-4">
                                <div className="mb-2 text-[11px] font-semibold text-slate-600">生成方式</div>
                                <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm">
                                    {([{ value: 'first-last-frame' as const, label: '首尾帧' }, { value: 'omni-reference' as const, label: '全能参考' }]).map((opt) => (
                                        <button key={opt.value} type="button" onClick={() => onDomesticModeChange(opt.value)} disabled={isGenerating || isReferenceUploadBusy} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${domesticMode === opt.value ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{opt.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="py-3 border-t border-slate-100/80">
                            <div className="mb-2 text-[11px] font-medium text-slate-500">画面比例</div>
                            <div className="flex flex-wrap gap-1.5">
                                {aspectRatios.map((ratio) => {
                                    const shape = RATIO_SHAPES[ratio] || { w: 10, h: 10 };
                                    return (
                                        <button key={ratio} type="button" onClick={() => onAspectRatioChange(ratio)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${aspectRatio === ratio ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                            <span className={`inline-block rounded-[2px] border ${aspectRatio === ratio ? 'border-white/50' : 'border-slate-400/50'}`} style={{ width: `${shape.w}px`, height: `${shape.h}px` }} />
                                            {ratio}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {isDomesticModel && (
                            <div className="py-3 border-t border-slate-100/80">
                                <div className="mb-2 text-[11px] font-medium text-slate-500">分辨率</div>
                                <div className="flex gap-1.5">
                                    {resolutionOptions.map((opt) => (
                                        <button key={opt} type="button" onClick={() => onResolutionChange(opt)} disabled={isGenerating || isReferenceUploadBusy} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${resolution === opt ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{opt.toUpperCase()}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="py-3 border-t border-slate-100/80">
                            <div className="mb-2 text-[11px] font-medium text-slate-500">时长</div>
                            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(durations.length, 6)}, 1fr)` }}>
                                {durations.map((item) => (
                                    <button key={item} type="button" onClick={() => onDurationChange(item)} className={`rounded-lg py-1.5 text-xs font-medium transition-colors text-center ${duration === item ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>
                                ))}
                            </div>
                        </div>

                        {isDomesticModel && (
                            <div className="flex items-center justify-between py-3 border-t border-slate-100/80">
                                <div className="flex items-center gap-1.5">
                                    <Volume2 size={13} className={generateAudio ? 'text-emerald-500' : 'text-slate-400'} />
                                    <span className="text-[11px] font-medium text-slate-600">生成音频</span>
                                </div>
                                <button type="button" onClick={() => onGenerateAudioChange(!generateAudio)} disabled={isGenerating || isReferenceUploadBusy} className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${generateAudio ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                    <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${generateAudio ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-between py-3 border-t border-slate-100/80">
                            <div className="flex items-center gap-1.5">
                                <Sparkles size={13} className={enhancePrompt ? 'text-violet-500' : 'text-slate-400'} />
                                <span className="text-[11px] font-medium text-slate-600">提示词增强</span>
                            </div>
                            <button type="button" onClick={() => onEnhancePromptChange(!enhancePrompt)} className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${enhancePrompt ? 'bg-violet-500' : 'bg-slate-200'}`}>
                                <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${enhancePrompt ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}