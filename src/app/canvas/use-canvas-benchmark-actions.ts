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

    const runCanvasMixedBenchmark = useCallback(async () => {
        const count = 300;
        setIsBenchmarkRunning(true);
        showToast('开始执行 300 个混合元素拖动压力测试...', 'info');

        try {
            const start = performance.now();
            const imageSeeds = generateBenchmarkSeeds(120);
            const gridPosition = (index: number) => ({
                x: (index % 12) * 220,
                y: Math.floor(index / 12) * 188,
            });

            const generatedElements: CanvasElement[] = imageSeeds.map((seed, index) => ({
                id: uuidv4(),
                type: 'image',
                ...gridPosition(45 + index),
                width: 216,
                height: 176,
                content: seed.content,
                ...getDefaultImagePresentation(workbenchSettings),
            }));

            for (let index = 0; index < 45; index += 1) {
                generatedElements.push({
                    id: uuidv4(),
                    type: 'frame',
                    ...gridPosition(index),
                    width: 236,
                    height: 196,
                    frameName: `Bench Frame ${index + 1}`,
                });
            }
            for (let index = 0; index < 30; index += 1) {
                generatedElements.push({
                    id: uuidv4(),
                    type: 'shape',
                    ...gridPosition(165 + index),
                    width: 176,
                    height: 132,
                    shapeType: index % 3 === 0 ? 'circle' : 'square',
                    color: index % 2 === 0 ? '#34d399' : '#60a5fa',
                });
            }
            for (let index = 0; index < 25; index += 1) {
                generatedElements.push({
                    id: uuidv4(),
                    type: 'text',
                    ...gridPosition(195 + index),
                    width: 196,
                    height: 72,
                    content: `Benchmark text ${index + 1}`,
                });
            }

            const generatorElements: CanvasElement[] = Array.from({ length: 40 }, (_, index) => ({
                id: uuidv4(),
                type: index % 2 === 0 ? 'image-generator' : 'video-generator',
                ...gridPosition(220 + index),
                width: 220,
                height: 168,
                savedPrompt: `Benchmark generator ${index + 1}`,
            }));
            generatedElements.push(...generatorElements);

            for (let index = 0; index < 40; index += 1) {
                generatedElements.push({
                    id: uuidv4(),
                    type: 'connector',
                    x: 0,
                    y: 0,
                    connectorFrom: generatorElements[index].id,
                    connectorTo: generatorElements[(index + 1) % generatorElements.length].id,
                    connectorFromPort: 'generator-flow-output',
                    connectorToPort: 'generator-reference-input',
                });
            }

            setElements(generatedElements);
            setSelectedIds([]);
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
                mode: 'replace',
            });
            setBenchmarkResults(results);
            showToast(`混合压力测试完成：${count} 个元素 / ${Math.round(end - start)} ms`, 'success');
        } catch (error) {
            console.error('[Benchmark] Mixed canvas failed:', error);
            showToast('混合元素压力测试执行失败', 'error');
        } finally {
            setIsBenchmarkRunning(false);
        }
    }, [refreshStorageEstimate, setElements, setSelectedIds, showToast, workbenchSettings]);

    return {
        benchmarkResults,
        handleClearBenchmarkResults,
        isBenchmarkRunning,
        runCanvasBenchmark,
        runCanvasMixedBenchmark,
    };
}
