import type { CanvasElement } from './canvas-types';
import { buildImageMetaChips, type StoryboardBadgeMeta, type StoryboardStatus } from './canvas-element-display-utils';

interface ImageElementOverlaysProps {
    el: CanvasElement;
    isSelected: boolean;
    canGenerateFromImage: boolean;
    storyboardStatus: StoryboardStatus;
    storyboardChips: string[];
    storyboardBadgeMeta: StoryboardBadgeMeta;
    shouldShowStoryboardBadge: boolean;
}

export function ImageElementOverlays({
    el,
    isSelected,
    canGenerateFromImage,
    storyboardStatus,
    storyboardChips,
    storyboardBadgeMeta,
    shouldShowStoryboardBadge,
}: ImageElementOverlaysProps) {
    return (
        <>
            {shouldShowStoryboardBadge && (
                <div className="pointer-events-none absolute right-2 top-2 z-20">
                    <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur-sm ${storyboardBadgeMeta.className}`}>
                        {storyboardBadgeMeta.label}
                    </div>
                </div>
            )}
            {isSelected && (el.savedPrompt?.trim() || el.selectedModel?.trim() || canGenerateFromImage || storyboardStatus.hasAny) && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
                    <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
                    <div className="relative flex items-start px-3 pt-2.5">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                                <span className="rounded bg-white/20 px-1.5 py-px text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">AI</span>
                                {buildImageMetaChips(el).map((chip, i) => (
                                    <span key={`${el.id}-${chip}`} className="text-[10px] text-white/75">
                                        {i > 0 ? '' : ''}{chip}
                                    </span>
                                ))}
                            </div>
                            {storyboardStatus.hasAny && (
                                <div className="flex items-center gap-1">
                                    <span className="rounded bg-amber-400/30 px-1.5 py-px text-[10px] font-bold text-amber-200 backdrop-blur-sm">分镜</span>
                                    {storyboardChips.slice(0, 3).map((chip) => (
                                        <span key={`${el.id}-sb-${chip}`} className="text-[10px] text-white/65">{chip}</span>
                                    ))}
                                    {storyboardStatus.hasValidationError ? (
                                        <span className="rounded bg-rose-500/50 px-1 py-px text-[9px] font-semibold text-white backdrop-blur-sm">待修正</span>
                                    ) : storyboardStatus.missingRequired.length > 0 ? (
                                        <span className="text-[10px] text-amber-300/70">缺{storyboardStatus.missingRequired.join('/')}</span>
                                    ) : (
                                        <span className="text-[10px] text-emerald-300">✓</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {isSelected && el.savedPrompt?.trim() && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
                    <div className="bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-8">
                        <div className="line-clamp-2 text-[11px] leading-[1.6] text-white/85 drop-shadow-sm">{el.savedPrompt}</div>
                    </div>
                </div>
            )}
        </>
    );
}