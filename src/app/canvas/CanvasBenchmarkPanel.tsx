import { Gauge, Trash } from 'lucide-react';
import type { CanvasRenderMetrics } from '@/components/lovart/canvas-area-domains';
import type { CanvasBenchmarkResult } from '@/lib/canvas-benchmark';
import type { HistoryTimelineEntry } from '@/lib/editor-kernel';
import type { StorageEstimateInfo } from '@/lib/workbench-settings';
import { formatBytes } from './canvas-export-utils';
import { getStorageBadgeClass } from './canvas-media-utils';
import {
    STORAGE_CRITICAL_THRESHOLD,
    STORAGE_INFO_THRESHOLD,
    STORAGE_WARN_THRESHOLD,
    type ActiveChunkSummary,
    type ChunkPreheatState,
    type ChunkResidencyState,
    type HistorySummary,
} from './canvas-runtime-types';
import type { CanvasChunkStats } from './project-storage';

interface CanvasBenchmarkPanelProps {
    rightOffset: number;
    isBenchmarkRunning: boolean;
    renderMetrics: CanvasRenderMetrics | null;
    chunkStats: CanvasChunkStats | null;
    chunkManifestLength: number;
    activeChunkSummary: ActiveChunkSummary;
    pinnedChunkCount: number;
    chunkResidency: ChunkResidencyState;
    chunkPreheat: ChunkPreheatState;
    historySummary: HistorySummary;
    historyTimeline: HistoryTimelineEntry[];
    storageEstimate: StorageEstimateInfo | null;
    benchmarkResults: CanvasBenchmarkResult[];
    onClearResults: () => void;
    onRunBenchmark: (count: number, mode: 'replace' | 'append') => void;
}

export function CanvasBenchmarkPanel({
    rightOffset,
    isBenchmarkRunning,
    renderMetrics,
    chunkStats,
    chunkManifestLength,
    activeChunkSummary,
    pinnedChunkCount,
    chunkResidency,
    chunkPreheat,
    historySummary,
    historyTimeline,
    storageEstimate,
    benchmarkResults,
    onClearResults,
    onRunBenchmark,
}: CanvasBenchmarkPanelProps) {
    const preheatProgressPercent = chunkPreheat.totalElements > 0
        ? (chunkPreheat.loadedElements / chunkPreheat.totalElements) * 100
        : 0;
    const benchmarkPanelStyleSheet = `
.canvas-benchmark-panel-position { right: ${rightOffset}px; }
.canvas-benchmark-preheat-progress { width: ${preheatProgressPercent}%; }
`;

    return (
        <>
        <style>{benchmarkPanelStyleSheet}</style>
        <div className="canvas-benchmark-panel-position absolute top-20 z-50 w-[360px] rounded-2xl border border-gray-200 bg-white/96 p-4 shadow-2xl backdrop-blur pointer-events-auto" data-testid="benchmark-panel">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Gauge size={16} className="text-violet-500" />
                        画布压力测试
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                        使用合成 4K SVG 图片模拟导入、存储和首屏渲染耗时。
                    </p>
                </div>
                <button
                    onClick={onClearResults}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="清空测试记录"
                >
                    <Trash size={14} />
                </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
                {[100, 500, 1000, 2000].map((count) => (
                    <button
                        key={count}
                        type="button"
                        data-testid={`benchmark-run-${count}`}
                        disabled={isBenchmarkRunning}
                        onClick={() => onRunBenchmark(count, 'replace')}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {count} 张
                    </button>
                ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
                {[250, 500].map((count) => (
                    <button
                        key={`append-${count}`}
                        type="button"
                        data-testid={`benchmark-run-append-${count}`}
                        disabled={isBenchmarkRunning}
                        onClick={() => onRunBenchmark(count, 'append')}
                        className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        追加 {count} 张
                    </button>
                ))}
            </div>

            {renderMetrics && (
                <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-live-metrics">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-violet-700">
                        <span>实时渲染指标</span>
                        <span>{renderMetrics.visibleCount} / {renderMetrics.totalCount}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">裁剪数量</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-culled">{renderMetrics.culledCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">延后渲染</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-deferred">{renderMetrics.deferredCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">分区数量</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-partitions">{renderMetrics.partitionCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">分区尺寸</div>
                            <div className="mt-1 font-semibold text-slate-700">{Math.round(renderMetrics.partitionTileSize)} px</div>
                        </div>
                    </div>
                </div>
            )}

            {chunkStats && (
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-chunk-metrics">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-emerald-700">
                        <span>逻辑分块持久化</span>
                        <span>{chunkStats.chunkCount} 块</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">最大块</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-largest">{chunkStats.largestChunkSize}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">根层级</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-root">{chunkStats.rootElementCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">已建索引</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-manifest">{chunkManifestLength}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">激活块</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-active">{activeChunkSummary.activeChunkIds.length}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">释放块</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-released">{activeChunkSummary.releasedChunkIds.length}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">激活元素</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-active-elements">{activeChunkSummary.activeElements.length}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">固定块</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-pinned">{pinnedChunkCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-2.5 py-2">
                            <div className="text-[10px] text-slate-400">运行态卸载</div>
                            <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-unloaded">{chunkResidency.unloadedChunkIds.length}</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-chunk-preheat">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-sky-700">
                    <span>分块预热</span>
                    <span>{chunkPreheat.loadedChunks}/{chunkPreheat.totalChunks}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/80">
                    <div
                        className="canvas-benchmark-preheat-progress h-full rounded-full bg-sky-500 transition-all"
                    />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{chunkPreheat.currentChunkLabel || '待机'}</span>
                    <span>{chunkPreheat.loadedElements}/{chunkPreheat.totalElements}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>运行态</span>
                    <span data-testid="benchmark-chunk-residency-phase">{chunkResidency.phase === 'hydrating' ? '回填中' : chunkResidency.phase === 'releasing' ? '释放中' : '稳定'}</span>
                </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-history-panel">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                    <span>历史面板</span>
                    <span>{historySummary.patchCount} 步</span>
                </div>
                <div className="truncate font-medium text-slate-800">{historySummary.lastAction}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 ${historySummary.canUndo ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>撤销</span>
                    <span className={`rounded-full px-2 py-0.5 ${historySummary.canRedo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>重做</span>
                </div>
                <div className="mt-3 space-y-2" data-testid="benchmark-history-timeline">
                    {historyTimeline.length === 0 ? (
                        <div className="rounded-xl bg-white/80 px-2.5 py-2 text-[10px] text-slate-400">暂无历史时间线</div>
                    ) : historyTimeline.slice(0, 6).map((entry) => (
                        <div key={entry.id} className={`rounded-xl border px-2.5 py-2 ${entry.active ? 'border-violet-200 bg-violet-50/70' : 'border-slate-200 bg-white/80 opacity-70'}`}>
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                                <span className="truncate font-medium text-slate-700">{entry.label}</span>
                                <span className="text-slate-400">{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                    <span>缓存阈值</span>
                    <span>{Math.round(STORAGE_INFO_THRESHOLD * 100)} / {Math.round(STORAGE_WARN_THRESHOLD * 100)} / {Math.round(STORAGE_CRITICAL_THRESHOLD * 100)}%</span>
                </div>
                {storageEstimate && (
                    <div className="mt-2 flex items-center justify-between">
                        <span>当前占用</span>
                        <span className={`rounded-full px-2 py-0.5 ${getStorageBadgeClass(storageEstimate.usageRatio)}`} data-testid="benchmark-storage-usage">
                            {formatBytes(storageEstimate.usageBytes)} / {formatBytes(storageEstimate.quotaBytes)}
                        </span>
                    </div>
                )}
            </div>

            <div className="mt-3 space-y-2" data-testid="benchmark-results">
                {benchmarkResults.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                        暂无压力测试记录
                    </div>
                ) : benchmarkResults.slice(0, 4).map((result) => (
                    <div key={result.id} className="rounded-xl border border-gray-100 px-3 py-2">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-700">
                            <span>{result.count} 张 · {result.mode === 'append' ? '追加' : '替换'}</span>
                            <span>{new Date(result.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                            <span>耗时 {result.durationMs.toFixed(0)} ms</span>
                            <span>{formatBytes(result.storageUsageBytes)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        </>
    );
}
