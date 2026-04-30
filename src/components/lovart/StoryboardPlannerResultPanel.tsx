import React from 'react';
import { Check, CheckCircle2, Clapperboard, ClipboardCopy, Loader2 } from 'lucide-react';
import type { StoryboardPlanResponse } from '@/lib/ai-client';
import { WorkbenchImage } from './WorkbenchImage';

type FinalGenerationState = {
    status: 'idle' | 'rendering' | 'done' | 'error';
    progress: number;
    imageUrl: string | null;
    error: string | null;
};

function getStoryboardGridColumns(shotCount: number) {
    if (shotCount <= 2) return shotCount;
    if (shotCount === 3 || shotCount === 4) return 2;
    if (shotCount <= 6) return 3;
    return 4;
}

interface StoryboardPlannerResultPanelProps {
    result: StoryboardPlanResponse;
    generationState: FinalGenerationState;
    combinedPrompt: string;
    copyFeedback: boolean;
    onCombinedPromptChange: (value: string) => void;
    onCopyPrompt: () => void;
    onImportStoryboardBoardToCanvas: () => void;
}

export function StoryboardPlannerResultPanel({
    result,
    generationState,
    combinedPrompt,
    copyFeedback,
    onCombinedPromptChange,
    onCopyPrompt,
    onImportStoryboardBoardToCanvas,
}: StoryboardPlannerResultPanelProps) {
    return (
        <section className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>{result.title}</span>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{result.shots.length} 格 · {getStoryboardGridColumns(result.shotCount)}×{Math.ceil(result.shotCount / getStoryboardGridColumns(result.shotCount))}</span>
            </div>

            {(generationState.imageUrl || generationState.status === 'rendering') && (
                <div className="overflow-hidden rounded-md border border-slate-200">
                    {generationState.imageUrl ? (
                        <WorkbenchImage content={generationState.imageUrl} alt="分镜宫格图" containerClassName="w-full" imageClassName="w-full" fit="contain" />
                    ) : (
                        <div className="flex h-28 items-center justify-center bg-slate-800 text-[11px] text-white/70">
                            <div className="flex flex-col items-center gap-1.5">
                                <Loader2 size={16} className="animate-spin text-sky-400" />
                                <span>生成宫格图 {Math.max(generationState.progress, 5)}%</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {generationState.imageUrl && (
                <div className="mt-2 flex justify-end">
                    <button type="button" onClick={onImportStoryboardBoardToCanvas} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50">
                        <Clapperboard size={13} />
                        <span>导入到画布</span>
                    </button>
                </div>
            )}

            <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-slate-600">总提示词 <span className="font-normal text-slate-400">（中文，可编辑）</span></div>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={onCopyPrompt} className={`rounded border p-1 transition-colors ${copyFeedback ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`} title="复制提示词">
                            {copyFeedback ? <Check size={11} /> : <ClipboardCopy size={11} />}
                        </button>
                    </div>
                </div>
                <textarea value={combinedPrompt} onChange={(event) => onCombinedPromptChange(event.target.value)} placeholder="生成提示词后，系统会自动汇总到这里，你也可以手动修改。" className="h-32 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] leading-[18px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-1 focus:ring-sky-100 transition-all" />
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
                {result.shots.map((shot, index) => (
                    <span key={`${shot.shotCode}-${shot.index}`} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600" title={shot.note}>
                        <span className="font-bold text-sky-700">{index + 1}</span>
                        <span className="text-slate-400">{shot.shotCode}</span>
                    </span>
                ))}
            </div>
        </section>
    );
}