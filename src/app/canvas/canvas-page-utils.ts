/**
 * canvas-page-utils.ts — Barrel re-export
 *
 * 此文件现在仅作为旧兼容桶式导出文件，将所有画布页面工具从各个领域模块重新导出。
 * 新代码必须从实际领域模块导入，避免重新抹平画布页面边界。
 *
 * 领域模块：
 * - canvas-runtime-types.ts: 类型定义和全局常量
 * - canvas-session-prefs.ts: chunk 固定和故事板偏好持久化
 * - canvas-storyboard-utils.ts: 故事板审核、占位图、排序
 * - canvas-media-utils.ts: 图片尺寸、视口、几何、缩略图
 * - canvas-export-utils.ts: 文件下载、Blob 转换、SVG 导出、命名
 */

// ── Types & Constants ────────────────────────────────────────
export {
    MAX_CANVAS_IMAGE_SIZE,
    IMAGE_IMPORT_CONCURRENCY,
    BACKGROUND_IMAGE_FIX_CONCURRENCY,
    BACKGROUND_IMAGE_FIX_BATCH_SIZE,
    STORAGE_INFO_THRESHOLD,
    STORAGE_WARN_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
    CHUNK_PREHEAT_THRESHOLD,
    CHUNK_RELEASE_GRACE_MS,
    CHUNK_PIN_STORAGE_KEY_PREFIX,
    STORYBOARD_OVERVIEW_PREFS_KEY_PREFIX,
    type ChunkPreheatState,
    type HistorySummary,
    type ActiveChunkSummary,
    type ChunkResidencyState,
    type GenerationHealthState,
    type StoryboardNavigationScope,
    type StoryboardAuditFilter,
    type StoryboardOverviewPrefs,
    type ElementExportFormat,
} from './canvas-runtime-types';

// ── Session Prefs ────────────────────────────────────────────
export {
    buildPinnedChunkStorageKey,
    loadPinnedChunkIds,
    persistPinnedChunkIds,
    buildStoryboardOverviewPrefsStorageKey,
    loadStoryboardOverviewPrefs,
    persistStoryboardOverviewPrefs,
    mapStoryboardFilterToScope,
    resolveElementChunkId,
} from './canvas-session-prefs';

// ── Storyboard Utilities ─────────────────────────────────────
export {
    truncateStoryboardText,
    escapeXml,
    buildStoryboardPlaceholderDataUrl,
    getStoryboardAuditState,
    hasStoryboardGenerationSeed,
    sortStoryboardElements,
} from './canvas-storyboard-utils';

// ── Media / Viewport Utilities ───────────────────────────────
export {
    getCanvasDisplaySize,
    readImageDimensions,
    fitImageToBounds,
    parseAspectRatioLabel,
    fitAspectRatioLabelToBounds,
    inferImageAspectRatioLabel,
    mapWithConcurrency,
    collectImageRefsFromElements,
    getStorageBadgeClass,
    getDefaultImagePresentation,
    getViewportBounds,
    getElementViewportPriority,
    deriveProjectThumbnail,
} from './canvas-media-utils';

// ── Geometry Utilities ───────────────────────────────────────
export {
    rectsIntersect,
    getRectIntersectionArea,
    getSplitLayoutBounds,
    scoreSplitLayoutCandidate,
    chooseSplitLayoutOrigin,
} from './canvas-geometry-utils';

// ── Export / Download / Naming Utilities ──────────────────────
export {
    triggerBrowserDownload,
    saveBlobToLocalFile,
    dataUrlToBlob,
    formatBytes,
    inferExtension,
    blobToDataUrl,
    convertImageBlobToRasterBlob,
    buildSvgExportBlob,
    makeGeneratedFilename,
} from './canvas-export-utils';
export {
    cloneCanvasElement,
    sanitizeToolName,
    sanitizeFilenameStem,
    getElementBaseName,
    buildToolResultNames,
    resolveToolResultNaming,
} from './canvas-element-naming';
