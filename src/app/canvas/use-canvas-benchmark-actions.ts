import { useCallback, useEffect, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { ensureImageRef } from '@/lib/editor-kernel';
import {
    clearCanvasBenchmarkResults,
    generateBenchmarkSeeds,
    getCanvasBenchmarkResults,
    saveCanvasBenchmarkResult,
    type CanvasBenchmarkResult,
} from '@/lib/canvas-benchmark';
import { getStorageEstimateInfo, type WorkbenchSettings } from '@/lib/workbench-settings';
import type { CanvasToastType } from './canvas-feedback';
import { IMAGE_IMPORT_CONCURRENCY } from './canvas-runtime-types';
import { getDefaultImagePresentation, mapWithConcurrency } from './canvas-media-utils';
import { v4 as uuidv4 } from 'uuid';

interface UseCanvasBenchmarkActionsOptions {
    benchmarkMode: boolean;
    workbenchSettings: WorkbenchSettings;
    addElements: (elements: CanvasElement[]) => void;
    setElements: (elements: CanvasElement[]) => void;
    setSelectedIds: (ids: string[]) => void;
    refreshStorageEstimate: () => Promise<void>;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasBenchmarkActions({
    benchmarkMode,
    workbenchSettings,
    addElements,
    setElements,
    setSelectedIds,
    refreshStorageEstimate,
    showToast,
}: UseCanvasBenchmarkActionsOptions) {
    const [benchmarkResults, setBenchmarkResults] = useState<CanvasBenchmarkResult[]>([]);
    const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);

    useEffect(() => {
        if (benchmarkMode) {
            setBenchmarkResults(getCanvasBenchmarkResults());
        }
    }, [benchmarkMode]);

    const handleClearBenchmarkResults = useCallback(() => {
        clearCanvasBenchmarkResults();
        setBenchmarkResults([]);
        showToast('已清空压力测试记录', 'info');
    }, [showToast]);

    const runCanvasBenchmark = useCallback(async (count: number, mode: 'replace' | 'append' = 'replace') => {
        setIsBenchmarkRunning(true);
        showToast(`开始执行 ${count} 张图片压力测试...`, 'info');

        try {
            const start = performance.now();
            const seeds = generateBenchmarkSeeds(count);
            const refs = await mapWithConcurrency(seeds, IMAGE_IMPORT_CONCURRENCY, async (seed) => {
                const content = await ensureImageRef(seed.content);
                return content;
            });

            const generatedElements: CanvasElement[] = refs.map((content, index) => ({
                id: uuidv4(),
                type: 'image',
                x: seeds[index].x,
                y: seeds[index].y,
                width: seeds[index].width,
                height: seeds[index].height,
                content,
                ...getDefaultImagePresentation(workbenchSettings),
            }));

            if (mode === 'append') {
                addElements(generatedElements);
            } else {
                setElements(generatedElements);
                setSelectedIds([]);
            }

            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            await refreshStorageEstimate();
            const end = performance.now();
            const latestEstimate = await getStorageEstimateInfo();
            const results = saveCanvasBenchmarkResult({
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                count,
                durationMs: Math.round((end - start) * 100) / 100,
                storageUsageBytes: latestEstimate?.usageBytes ?? 0,
                quotaBytes: latestEstimate?.quotaBytes ?? 0,
                mode,
            });
            setBenchmarkResults(results);
            showToast(`压力测试完成：${count} 张 / ${Math.round(end - start)} ms`, 'success');
        } catch (error) {
            console.error('[Benchmark] Failed:', error);
            showToast('压力测试执行失败', 'error');
        } finally {
            setIsBenchmarkRunning(false);
        }
    }, [addElements, refreshStorageEstimate, setElements, setSelectedIds, showToast, workbenchSettings]);

    return {
        benchmarkResults,
        handleClearBenchmarkResults,
        isBenchmarkRunning,
        runCanvasBenchmark,
    };
}