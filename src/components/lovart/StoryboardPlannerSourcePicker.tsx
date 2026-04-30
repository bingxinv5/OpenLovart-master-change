import React from 'react';
import { Check, ChevronDown, ChevronUp, ImagePlus, MousePointerClick, Upload, X } from 'lucide-react';
import type { StoryboardPlannerSourceImage } from './storyboard-planner-storage';
import { WorkbenchImage } from './WorkbenchImage';

type PlannerCanvasImage = {
    id: string;
    content: string;
    displayName?: string;
};

function SectionLabel({ children, step }: { children: React.ReactNode; step?: number }) {
    return (
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {step && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white">{step}</span>}
            <span>{children}</span>
        </div>
    );
}

interface StoryboardPlannerSourcePickerProps {
    sourceImages: StoryboardPlannerSourceImage[];
    canvasImages: PlannerCanvasImage[];
    showCanvasPicker: boolean;
    maxSourceImages: number;
    onUploadClick: () => void;
    onToggleCanvasPicker: () => void;
    onRequestCanvasSelect?: () => void;
    onRemoveSourceImage: (content: string) => void;
    onToggleSourceImage: (content: string, label: string) => void;
}

export function StoryboardPlannerSourcePicker({
    sourceImages,
    canvasImages,
    showCanvasPicker,
    maxSourceImages,
    onUploadClick,
    onToggleCanvasPicker,
    onRequestCanvasSelect,
    onRemoveSourceImage,
    onToggleSourceImage,
}: StoryboardPlannerSourcePickerProps) {
    return (
        <section>
            <SectionLabel step={1}>选择参考图 <span className="font-normal text-slate-400">（最多 {maxSourceImages} 张）</span></SectionLabel>
            <div className="flex items-start gap-2 flex-wrap">
                {sourceImages.map((image, imageIndex) => (
                    <div key={imageIndex} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-sky-400 shadow-sm">
                        <WorkbenchImage content={image.content} alt={image.label} containerClassName="h-full w-full" imageClassName="h-full w-full" fit="cover" />
                        <button type="button" onClick={() => onRemoveSourceImage(image.content)} className="absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition-colors hover:bg-rose-600" title="移除">
                            <X size={8} strokeWidth={3} />
                        </button>
                    </div>
                ))}
                {sourceImages.length < maxSourceImages && (
                    <button type="button" onClick={onUploadClick} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 transition-colors hover:border-sky-300 hover:text-sky-400" title="添加图片">
                        <ImagePlus size={14} />
                    </button>
                )}
            </div>
            <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={onUploadClick} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50">
                    <Upload size={12} />
                    上传图片
                </button>
                {canvasImages.length > 0 && (
                    <button type="button" onClick={onToggleCanvasPicker} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50">
                        <ImagePlus size={12} />
                        从画布选取
                        {showCanvasPicker ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
                    </button>
                )}
                {onRequestCanvasSelect && (
                    <button type="button" onClick={onRequestCanvasSelect} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50">
                        <MousePointerClick size={12} />
                        从画布点选
                    </button>
                )}
            </div>
            {showCanvasPicker && canvasImages.length > 0 && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/80 p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-slate-400">画布图片 ({canvasImages.length})</span>
                        <span className="text-[10px] text-slate-400">已选 {sourceImages.filter((source) => canvasImages.some((canvasImage) => canvasImage.content === source.content)).length}/{maxSourceImages}</span>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5 max-h-[120px] overflow-y-auto">
                        {canvasImages.map((image) => {
                            const isSelected = sourceImages.some((source) => source.content === image.content);
                            return (
                                <button key={image.id} type="button" onClick={() => onToggleSourceImage(image.content, image.displayName || image.id.slice(0, 6))} className={`relative aspect-square overflow-hidden rounded-md border transition-all hover:scale-105 ${isSelected ? 'border-sky-500 ring-1 ring-sky-200' : 'border-transparent hover:border-slate-300'}`} title={image.displayName || image.id}>
                                    <WorkbenchImage content={image.content} alt={image.displayName || ''} containerClassName="h-full w-full" imageClassName="h-full w-full" fit="cover" />
                                    {isSelected && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-sky-500/20">
                                            <Check size={14} className="text-sky-600" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}