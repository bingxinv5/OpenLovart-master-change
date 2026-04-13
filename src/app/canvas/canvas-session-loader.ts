/**
 * canvas-session-loader.ts — 画布会话加载门面
 *
 * 组合 project-storage、viewport-persistence、generation-persistence 的加载调用，
 * 返回一个统一的 CanvasSessionSnapshot 对象。
 * page.tsx 在 loadProject 中调用此 facade 获取数据，然后将结果应用到 React 状态。
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { ViewportState } from './viewport-persistence';
import type { PendingGeneration, PendingSubmission } from './generation-persistence';
import type { CanvasChunkManifestEntry, CanvasChunkStats } from './project-storage';
import {
    loadCanvasProjectHeader,
    loadCanvasProjectBundle,
    loadCanvasProjectRowsByManifest,
    dedupeCanvasElements,
    getChunkLoadOrder,
} from './project-storage';
import { loadViewportState } from './viewport-persistence';
import { loadPendingGenerations, loadPendingSubmissions } from './generation-persistence';
import { CHUNK_PREHEAT_THRESHOLD } from './canvas-page-utils';

// ── Types ────────────────────────────────────────────────────

export interface CanvasProjectHeader {
    title: string;
    thumbnail: string | null;
    canvas_chunk_manifest?: CanvasChunkManifestEntry[];
    canvas_chunk_stats?: CanvasChunkStats;
}

export interface ChunkLoadProgress {
    chunk: CanvasChunkManifestEntry;
    loadedChunkCount: number;
    totalChunks: number;
    loadedElementCount: number;
    totalElementCount: number;
}

export interface CanvasSessionSnapshot {
    /** Project header metadata */
    header: CanvasProjectHeader;
    /** Deduplicated canvas elements */
    elements: CanvasElement[];
    /** Saved viewport state (null if none saved) */
    viewportState: ViewportState | null;
    /** Pending generation tasks from sessionStorage */
    pendingGenerations: Record<string, PendingGeneration>;
    /** Pending API submissions from sessionStorage */
    pendingSubmissions: Record<string, PendingSubmission>;
}

export interface LoadCanvasSessionOptions {
    /** Database handle from useLocalDb */
    database: ReturnType<typeof import('@/hooks/useLocalDb').useLocalDb>;
    /** Project ID to load */
    projectId: string;
    /** Optional callback for chunk loading progress (for large projects) */
    onChunkProgress?: (progress: ChunkLoadProgress) => void;
}

// ── Main Facade ──────────────────────────────────────────────

/**
 * Load a complete canvas session from local storage backends.
 *
 * Returns null when the project is not found in the database.
 *
 * Load order:
 * 1. Project header (IndexedDB)
 * 2. Elements — chunked for large projects, bundle for small (IndexedDB)
 * 3. Pending generation tasks (sessionStorage)
 * 4. Pending submissions (sessionStorage)
 * 5. Viewport state (localStorage)
 */
export async function loadCanvasSession(
    options: LoadCanvasSessionOptions,
): Promise<CanvasSessionSnapshot | null> {
    const { database, projectId, onChunkProgress } = options;

    // 1. Load project header
    const project = await loadCanvasProjectHeader(database, projectId);
    if (!project) {
        return null;
    }

    const header: CanvasProjectHeader = {
        title: project.title || '未命名',
        thumbnail: project.thumbnail ?? null,
        canvas_chunk_manifest: project.canvas_chunk_manifest,
        canvas_chunk_stats: project.canvas_chunk_stats,
    };

    // 2. Load elements
    let canvasRows: Array<{ project_id: string; element_data: CanvasElement }> = [];
    const totalChunkElements = project.canvas_chunk_manifest?.reduce(
        (sum, chunk) => sum + chunk.elementCount,
        0,
    ) || 0;

    if (
        (project.canvas_chunk_manifest?.length || 0) > 0 &&
        totalChunkElements >= CHUNK_PREHEAT_THRESHOLD
    ) {
        // Large project: chunked loading
        const orderedChunks = getChunkLoadOrder(project.canvas_chunk_manifest || []);
        canvasRows = await loadCanvasProjectRowsByManifest<CanvasElement>(
            projectId,
            orderedChunks,
            onChunkProgress,
        );
    } else {
        // Small project: bundle loading
        const bundle = await loadCanvasProjectBundle<CanvasElement>(database, projectId);
        canvasRows = bundle.canvasRows;
    }

    // 3. Deduplicate
    const elements = canvasRows.length > 0
        ? dedupeCanvasElements(canvasRows)
        : [];

    // 4. Restore pending generations and submissions from sessionStorage
    const pendingGenerations = loadPendingGenerations(projectId);
    const pendingSubmissions = loadPendingSubmissions(projectId);

    // 5. Load viewport state from localStorage
    const viewportState = loadViewportState(projectId);

    return {
        header,
        elements,
        viewportState,
        pendingGenerations,
        pendingSubmissions,
    };
}
