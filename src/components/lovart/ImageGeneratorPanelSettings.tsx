import { ChevronDown, MousePointerClick, Settings2, Upload } from 'lucide-react';
import { resolveOpenAiGptImageAspectRatio } from '@/lib/image-generation-models';
import {
    describeImageSizeAspectRatio,
    IMAGE_QUALITY_LABELS,
    type GenerateCount,
    type ImageAspectRatio as AspectRatio,
    type ImageQuality,
    type ImageSize,
} from './generator-model-options';

interface ImageAddReferenceMenuProps {
    isOpen: boolean;
    canAddMoreImages: boolean;
    onUploadImage: () => void;
    onSelectFromCanvas?: () => void;
}

export function ImageAddReferenceMenu({
    isOpen,
    canAddMoreImages,
    onUploadImage,
    onSelectFromCanvas,
}: ImageAddReferenceMenuProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="absolute bottom-[48px] left-3 bg-white/96 backdrop-blur-xl rounded-[14px] shadow-lg border border-slate-200/60 py-1 z-50 min-w-[160px]" data-popover-menu>
            <button type="button" onClick={onUploadImage} disabled={!canAddMoreImages} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 ${canAddMoreImages ? 'cursor-pointer text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-300'}`}>
                <Upload size={14} className="text-slate-400" /><span>上传图片</span>
            </button>
            <button type="button" onClick={onSelectFromCanvas} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors mx-1 cursor-pointer text-slate-700 hover:bg-slate-50">
                <MousePointerClick size={14} className="text-slate-400" /><span>从画布选择</span>
            </button>
        </div>
    );
}

interface ImageGeneratorSettingsPanelProps {
    isOpen: boolean;
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
    onToggle: () => void;
    onImageSizeChange: (size: ImageSize) => void;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onQualityChange: (quality: ImageQuality) => void;
    onGenerateCountChange: (count: GenerateCount) => void;
}

const RATIO_SHAPE_CLASSES: Record<string, string> = {
    '16:9': 'w-[14px] h-2',
    '9:16': 'w-2 h-[14px]',
    '1:1': 'h-2.5 w-2.5',
    '4:3': 'w-3 h-[9px]',
    '3:4': 'w-[9px] h-3',
    '2:3': 'w-2 h-3',
    '3:2': 'w-3 h-2',
    '4:5': 'w-[9px] h-[11px]',
    '5:4': 'w-[11px] h-[9px]',
    '21:9': 'w-4 h-[7px]',
    auto: 'h-2.5 w-2.5',
};

export function ImageGeneratorSettingsPanel({
    isOpen,
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
    onToggle,
    onImageSizeChange,
    onAspectRatioChange,
    onQualityChange,
    onGenerateCountChange,
}: ImageGeneratorSettingsPanelProps) {
    return (
        <div className="relative shrink-0" data-popover-menu>
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/60 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white hover:text-slate-700 hover:border-slate-300"
            >
                <Settings2 size={12} />
                {isOpenAiGptImageModel ? (
                    <>
                        <span>{imageSize}</span>
                        <span className="text-slate-300">·</span>
                        <span>{IMAGE_QUALITY_LABELS[quality]}</span>
                        <span className="text-slate-300">·</span>
                        <span>{displayedAspectRatio}</span>
                        <span className="text-slate-300">·</span>
                        <span>×{generateCount}</span>
                    </>
                ) : (
                    <>
                        <span>{displayedAspectRatio}</span>
                        <span className="text-slate-300">·</span>
                        <span>{imageSize}</span>
                        <span className="text-slate-300">·</span>
                        <span>×{generateCount}</span>
                    </>
                )}
                <ChevronDown size={11} className="text-slate-400 ml-0.5" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 z-30 w-[280px] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <span className="text-xs font-medium text-slate-700">生成设置</span>
                        <span className="text-[10px] text-slate-400">{settingsSummary}</span>
                    </div>
                    <div className="p-4 space-y-0">
                        {isOpenAiGptImageModel ? (
                            <>
                                <div className="py-3">
                                    <div className="mb-2 text-[11px] font-medium text-slate-500">尺寸</div>
                                    <div className="max-h-60 overflow-y-auto pr-1">
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {availableImageSizes.map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    onClick={() => {
                                                        onImageSizeChange(size);
                                                        onAspectRatioChange(resolveOpenAiGptImageAspectRatio(size, aspectRatio));
                                                    }}
                                                    className={`rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${imageSize === size ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                    <div>{size}</div>
                                                    <div className={`mt-0.5 text-[10px] ${imageSize === size ? 'text-white/70' : 'text-slate-400'}`}>{describeImageSizeAspectRatio(size, aspectRatio)}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="py-3 border-t border-slate-100/80">
                                    <div className="mb-2 text-[11px] font-medium text-slate-500">质量</div>
                                    <div className="flex gap-1.5">
                                        {availableImageQualities.map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => onQualityChange(value)}
                                                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${quality === value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                            >
                                                {IMAGE_QUALITY_LABELS[value]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="py-3">
                                    <div className="mb-2 text-[11px] font-medium text-slate-500">画面比例</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {availableAspectRatios.map((ratio) => (
                                            <button key={ratio} type="button" onClick={() => onAspectRatioChange(ratio)} disabled={grokUsesReferenceAspectRatio} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${grokUsesReferenceAspectRatio ? 'cursor-not-allowed opacity-50' : ''} ${aspectRatio === ratio ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                <span className={`inline-block rounded-[2px] border ${RATIO_SHAPE_CLASSES[ratio] || 'h-2.5 w-2.5'} ${aspectRatio === ratio ? 'border-white/50' : 'border-slate-400/50'}`} />
                                                {ratio === 'auto' ? '自动' : ratio}
                                            </button>
                                        ))}
                                    </div>
                                    {grokUsesReferenceAspectRatio && (
                                        <div className="mt-1.5 text-[10px] text-amber-600">Grok 携带参考图时按参考图比例生成</div>
                                    )}
                                </div>

                                <div className="py-3 border-t border-slate-100/80">
                                    <div className="mb-2 text-[11px] font-medium text-slate-500">分辨率</div>
                                    <div className="flex gap-1.5">
                                        {availableImageSizes.map((size) => (
                                            <button key={size} type="button" onClick={() => onImageSizeChange(size)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${imageSize === size ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{size}</button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="py-3 border-t border-slate-100/80">
                            <div className="mb-2 text-[11px] font-medium text-slate-500">生成数量</div>
                            <div className="flex gap-1.5">
                                {([1, 2, 3, 4] as GenerateCount[]).map((count) => (
                                    <button key={count} type="button" onClick={() => onGenerateCountChange(count)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${generateCount === count ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{count} 张</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}