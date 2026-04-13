'use client';

/**
 * ImageWorkerBridge — 桶状重导出（Barrel re-export）
 *
 * 原 954 行单体已拆分为：
 * - worker-transport.ts — Worker 单例、消息路由、生命周期、取消、序列化
 * - image-ops-bridge.ts — 压缩、LOD、裁剪、标注（含主线程 fallback）
 * - storyboard-ops-bridge.ts — 分镜切割、分镜导出合成
 *
 * 本文件保留向后兼容，使所有现有 import 路径保持不变。
 */

// ── Worker Transport ──────────────────────────────────
export {
  isWorkerCancelledError,
  isWorkerAvailable,
  terminateWorker,
  cancelActiveWorkerJobs,
  workerDataUrlToBlob,
  workerSerialize,
  workerDeserialize,
} from './worker-transport';

// ── Image Operations ──────────────────────────────────
export {
  compressImage,
  generateLOD,
  workerCropImage,
  workerAnnotateImage,
} from './image-ops-bridge';
export type { CompressImageResult, LODResult } from './image-ops-bridge';

// ── Storyboard Operations ─────────────────────────────
export {
  workerSplitStoryboard,
  workerBuildStoryboardExport,
} from './storyboard-ops-bridge';
