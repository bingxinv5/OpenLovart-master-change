/**
 * Editor-kernel boundary interfaces.
 *
 * These narrow interface types decouple page.tsx from the concrete
 * HistoryManager / DirtyTracker / SpatialIndex / ImageStore / ElementStore
 * implementations, making the orchestration shell testable with lightweight stubs.
 *
 * Public contract:
 *   IHistoryManager  — undo/redo with diff-based patches
 *   IDirtyTracker    — incremental save change tracking
 *   ISpatialIndex    — R-Tree viewport culling & snap queries
 *   IImageStore      — blob-based image persistence with LOD
 *   IElementStore    — per-element IndexedDB persistence
 */

import type { PatchMetadata, HistoryApplyResult, CanvasElementLike, HistoryTimelineEntry } from './history-manager';
import type { DirtyTrackerStats } from './dirty-tracker';
import type { BBox } from './spatial-index';

// Re-export contract-level types so consumers can import everything from editor-kernel
export type { PatchMetadata, HistoryApplyResult, CanvasElementLike, HistoryTimelineEntry };
export type { DirtyTrackerStats };
export type { BBox };

// ── IHistoryManager ──────────────────────────────────────────

export interface IHistoryManager<TElement extends CanvasElementLike = CanvasElementLike> {
    initialize(elements: TElement[]): void;
    record(currentElements: TElement[]): boolean;
    recordIncremental(currentElements: TElement[], changedIds: Iterable<string>, metadata?: PatchMetadata): boolean;
    undo(currentElements: TElement[]): HistoryApplyResult<TElement> | null;
    redo(currentElements: TElement[]): HistoryApplyResult<TElement> | null;
    beginTransaction(metadata?: PatchMetadata): void;
    touchTransactionIds(changedIds: Iterable<string>): void;
    commitTransaction(currentElements: TElement[], metadata?: PatchMetadata): boolean;
    cancelTransaction(): void;
    readonly hasActiveTransaction: boolean;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly stats: { patchCount: number; currentIndex: number; contentStore: { entries: number; totalMB: number } };
    readonly timeline: HistoryTimelineEntry[];
}

// ── IDirtyTracker ────────────────────────────────────────────

export interface IDirtyTracker {
    initialize(elementIds: string[]): void;
    markModified(elementId: string): void;
    markAdded(elementId: string): void;
    markRemoved(elementId: string): void;
    diffAndMark<T extends { id: string }>(oldElements: T[], newElements: T[]): void;
    getChanges(): { addedIds: string[]; modifiedIds: string[]; removedIds: string[] };
    readonly isDirty: boolean;
    readonly stats: DirtyTrackerStats;
    markSaved(currentElementIds: string[]): void;
    markSavedIfUnchanged(expectedRevision: number, currentElementIds: string[]): boolean;
    reset(): void;
    readonly revision: number;
}

// ── ISpatialIndex ────────────────────────────────────────────

type ElementLike = { id: string; x: number; y: number; width?: number; height?: number };

export interface ISpatialIndex {
    load(elements: ElementLike[]): void;
    insert(el: ElementLike): void;
    remove(id: string): void;
    update(el: ElementLike): void;
    batchUpdate(elements: ElementLike[]): void;
    search(bbox: BBox): string[];
    searchNearby(bbox: BBox, margin: number): string[];
    readonly size: number;
    has(id: string): boolean;
    clear(): void;
}

// ── IImageStore ──────────────────────────────────────────────

export interface IImageStore {
    /** Check if a string is an image reference (imgref://) */
    isImageRef(content: string | undefined | null): boolean;
    /** Extract the ID from an image reference */
    getRefId(ref: string): string;
    /** Create an image reference string from an ID */
    makeRef(id: string): string;
    /** Save a data URL to the store, returns imgref:// reference */
    saveImage(dataUrl: string, id?: string): Promise<string>;
    /** Save a raw Blob to the store, returns imgref:// reference */
    saveImageBlob(blob: Blob, id?: string): Promise<string>;
    /** Get a Blob URL with LOD selection based on display size */
    getImageBlobUrlWithLOD(content: string, displayPixels: number): Promise<string | null>;
    /** Get a Blob URL and the actual resolved LOD level used for that request */
    getImageBlobUrlWithLODResolution(content: string, displayPixels: number): Promise<{ url: string; resolvedLevel: number | null } | null>;
    /** Inspect which image-store LOD levels currently exist for a ref */
    inspectImageStoredLodLevels(content: string): Promise<{ hasBase: boolean; levels: number[] } | null>;
    /** Get a full-resolution Blob URL */
    getImageBlobUrl(content: string): Promise<string | null>;
    /** Get the raw Blob */
    getImageBlob(content: string): Promise<Blob | null>;
    /** Get a data URL (base64) — expensive, use sparingly */
    getImageDataUrl(content: string): Promise<string | null>;
    /** Delete an image and its LOD thumbnails */
    deleteImage(ref: string): Promise<void>;
    /** Remove unreferenced images */
    cleanupUnusedImages(usedRefs: Iterable<string>): Promise<number>;
    /** Normalize content to imgref:// form */
    ensureImageRef(content: string | undefined): Promise<string>;
    /** Batch migrate inline base64 to image store */
    migrateElementsToImageStore<T extends { id?: string; type?: string; content?: string }>(
        elements: T[],
        onProgress?: (done: number, total: number) => void,
    ): Promise<{ elements: T[]; migratedCount: number }>;
    /** Hint the LRU cache about preferred/stale display sizes */
    reprioritizeImageLodCache(content: string, preferredDisplayPixels: number, staleDisplayPixels: number): void;
}

// ── IElementStore ────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface IElementStore {
    /** Read a single element by composite key — O(1) */
    getByKey(projectId: string, elementDataId: string): Promise<Row | null>;
    /** Partial field projection — returns only specified fields */
    getPartial(projectId: string, elementDataId: string, fields: string[]): Promise<Partial<Row> | null>;
    /** Read all elements for a project */
    getAllByProject(projectId: string): Promise<Row[]>;
    /** Batch read by IDs — single transaction */
    getByKeys(projectId: string, elementIds: string[]): Promise<Row[]>;
    /** Cursor-based batch traversal */
    cursorByProject(
        projectId: string,
        batchSize: number,
        onBatch: (rows: Row[]) => boolean | void | Promise<boolean | void>,
    ): Promise<void>;
    /** Async iterator traversal */
    iterateByProject(projectId: string): AsyncGenerator<Row, void, undefined>;
    /** Count elements without loading data */
    countByProject(projectId: string): Promise<number>;
    /** Write elements (upsert) */
    put(rows: Row[]): Promise<void>;
    /** Delete a single element */
    deleteByKey(projectId: string, elementDataId: string): Promise<void>;
    /** Batch delete — single transaction */
    deleteByKeys(projectId: string, elementIds: string[]): Promise<void>;
    /** Delete all elements for a project */
    deleteByProject(projectId: string): Promise<void>;
    /** Collect all image references across all stored data */
    collectAllImageRefs(): Promise<string[]>;
}

// ── Re-export concrete implementations ──────────────────────
// Consumers needing runtime instances can import from here instead
// of reaching into individual modules.

export { HistoryManager } from './history-manager';
export { DirtyTracker } from './dirty-tracker';
export { SpatialIndex } from './spatial-index';
export { imageStore } from './image-store';
export { elementStore, localDb, type LocalDbClient } from './local-db';

// ── Re-export image-store free functions ─────────────────────
// These are the public surface that UI and orchestration code
// should use instead of importing directly from image-store.ts.

export {
  IMAGE_REF_PREFIX,
  isImageRef,
  getRefId,
  makeRef,
  saveImage,
  saveImageBlob,
  getImageBlobUrl,
  getImageBlobUrlWithLOD,
    getImageBlobUrlWithLODResolution,
    inspectImageStoredLodLevels,
  getImageBlob,
  getImageDataUrl,
  deleteImage,
  cleanupUnusedImages,
  ensureImageRef,
  migrateElementsToImageStore,
  reprioritizeImageLodCache,
} from './image-store';
