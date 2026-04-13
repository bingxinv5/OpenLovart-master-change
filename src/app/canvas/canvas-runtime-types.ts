/**
 * canvas-runtime-types.ts — 画布运行时类型和常量
 *
 * 从 canvas-page-utils.ts 提取的类型定义和运行时常量。
 * 所有画布页面共享的类型和阈值集中在此文件中。
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';

// ── Constants ────────────────────────────────────────────────

export const MAX_CANVAS_IMAGE_SIZE = 600;
export const IMAGE_IMPORT_CONCURRENCY = 3;
export const BACKGROUND_IMAGE_FIX_CONCURRENCY = 2;
export const BACKGROUND_IMAGE_FIX_BATCH_SIZE = 6;
export const STORAGE_INFO_THRESHOLD = 0.6;
export const STORAGE_WARN_THRESHOLD = 0.75;
export const STORAGE_CRITICAL_THRESHOLD = 0.85;
export const CHUNK_PREHEAT_THRESHOLD = 1200;
export const CHUNK_RELEASE_GRACE_MS = 220;
export const CHUNK_PIN_STORAGE_KEY_PREFIX = 'lovart_pinned_chunks:';
export const STORYBOARD_OVERVIEW_PREFS_KEY_PREFIX = 'lovart_storyboard_overview:';

// ── Types ────────────────────────────────────────────────────

export type StoryboardNavigationScope = 'issues' | 'invalid' | 'partial' | 'untracked';
export type StoryboardAuditFilter = 'all' | 'ready' | 'partial' | 'invalid' | 'untracked';

export type StoryboardOverviewPrefs = {
    collapsed: boolean;
    autoAdvanceEnabled: boolean;
    autoAdvanceScope: StoryboardNavigationScope;
    auditFilter: StoryboardAuditFilter;
};

export type ChunkPreheatState = {
    active: boolean;
    phase: 'idle' | 'loading' | 'preheating';
    loadedChunks: number;
    totalChunks: number;
    loadedElements: number;
    totalElements: number;
    currentChunkLabel?: string;
};

export type HistorySummary = {
    lastAction: string;
    patchCount: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
};

export type ActiveChunkSummary = {
    activeChunkIds: string[];
    releasedChunkIds: string[];
    activeElements: CanvasElement[];
};

export type ChunkResidencyState = {
    phase: 'idle' | 'hydrating' | 'releasing';
    residentChunkIds: string[];
    unloadedChunkIds: string[];
    residentElementCount: number;
    unloadedElementCount: number;
    lastActivatedChunkLabel?: string;
    lastReleasedChunkLabel?: string;
};

export type GenerationHealthState = {
    startedAt: number;
    lastProgressAt: number;
    lastProgress: number;
    consecutiveErrors: number;
};

export type ElementExportFormat = 'png' | 'jpg' | 'svg' | 'original';

// ── File Picker Types ────────────────────────────────────────

export interface FilePickerWritable {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
}

export interface FilePickerHandle {
    createWritable(): Promise<FilePickerWritable>;
}

export type SaveFilePicker = (options?: {
    suggestedName?: string;
    types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
    }>;
}) => Promise<FilePickerHandle>;
