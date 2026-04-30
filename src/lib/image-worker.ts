/**
 * Image Worker — 离屏图片处理线程
 *
 * 在 Web Worker 中执行 CPU 密集的图片操作，不阻塞主线程渲染和交互：
 * - 图片压缩（大图缩放 + JPEG 编码）
 * - LOD 多级缩略图生成（64 / 256 / 1024 px）
 * - data URL → Blob 转换
 * - 数据序列化（JSON stringify 大型元素数组）
 */

import { decodeDataUrlArrayBuffer } from './data-url';
import { annotateImageInWorker, type AnnotateImageOperationInput } from './image-worker-annotate-operation';
import { cropImageInWorker, type CropImageOperationInput } from './image-worker-crop-operation';
import { decodeWorkerImage } from './image-worker-image-decode';
import { encodeLodBlob, resolveLodQuality } from './image-worker-lod-operation';
import { splitStoryboardInWorker, type SplitStoryboardOperationInput } from './image-worker-split-operation';
import { buildStoryboardExportInWorker, type StoryboardExportOptions, type StoryboardExportWorkerItemInput } from './image-worker-storyboard-export-operation';

// ── 类型定义 ──────────────────────────────────────────

interface CompressImageMsg {
  type: 'compress-image';
  id: string;
  /** ArrayBuffer of the original image */
  buffer: ArrayBuffer;
  mime: string;
  maxResolution: number;
  quality: number;
}

interface GenerateLODMsg {
  type: 'generate-lod';
  id: string;
  imageId: string;
  /** ArrayBuffer of the original image */
  buffer: ArrayBuffer;
  mime: string;
  levels: number[];
  /** 各级别对应的 JPEG 质量（可选，默认 0.7） */
  qualities?: Record<number, number>;
}

interface DataUrlToBlobMsg {
  type: 'dataurl-to-blob';
  id: string;
  dataUrl: string;
}

interface CropImageMsg extends CropImageOperationInput {
  type: 'crop-image';
  id: string;
}

interface SplitStoryboardMsg extends SplitStoryboardOperationInput {
  type: 'split-storyboard';
  id: string;
}

type StoryboardExportWorkerItemMsg = StoryboardExportWorkerItemInput;

interface BuildStoryboardExportMsg {
  type: 'build-storyboard-export';
  id: string;
  items: StoryboardExportWorkerItemMsg[];
  options: StoryboardExportOptions;
}

interface AnnotateImageMsg extends AnnotateImageOperationInput {
  type: 'annotate-image';
  id: string;
}

interface SerializeMsg {
  type: 'serialize';
  id: string;
  data: unknown;
}

interface DeserializeMsg {
  type: 'deserialize';
  id: string;
  json: string;
}

interface WorkerContext {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

type WorkerMessage =
  | CompressImageMsg
  | GenerateLODMsg
  | DataUrlToBlobMsg
  | CropImageMsg
  | SplitStoryboardMsg
  | BuildStoryboardExportMsg
  | AnnotateImageMsg
  | SerializeMsg
  | DeserializeMsg;

// ── 消息处理 ──────────────────────────────────────────

const ctx = self as unknown as WorkerContext;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'compress-image': {
        await handleCompressImage(msg);
        break;
      }
      case 'generate-lod': {
        await handleGenerateLOD(msg);
        break;
      }
      case 'dataurl-to-blob': {
        handleDataUrlToBlob(msg);
        break;
      }
      case 'crop-image': {
        await handleCropImage(msg);
        break;
      }
      case 'split-storyboard': {
        await handleSplitStoryboard(msg);
        break;
      }
      case 'build-storyboard-export': {
        await handleBuildStoryboardExport(msg);
        break;
      }
      case 'annotate-image': {
        await handleAnnotateImage(msg);
        break;
      }
      case 'serialize': {
        handleSerialize(msg);
        break;
      }
      case 'deserialize': {
        handleDeserialize(msg);
        break;
      }
      default: {
        const unexpectedMsg = msg as { id: string; type: string };
        ctx.postMessage({
          type: 'error',
          id: unexpectedMsg.id,
          error: `Unknown message type: ${unexpectedMsg.type}`,
        });
      }
    }
  } catch (err: unknown) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// ── 图片压缩 ──────────────────────────────────────────

async function handleCompressImage(msg: CompressImageMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);
  const natW = decoded.width;
  const natH = decoded.height;
  const maxRes = msg.maxResolution;

  let sw = natW;
  let sh = natH;
  if (sw > maxRes || sh > maxRes) {
    if (sw >= sh) {
      sh = Math.round(sh * (maxRes / sw));
      sw = maxRes;
    } else {
      sw = Math.round(sw * (maxRes / sh));
      sh = maxRes;
    }
  }

  const oc = new OffscreenCanvas(sw, sh);
  const ocCtx = oc.getContext('2d')!;
  ocCtx.drawImage(decoded.source, 0, 0, sw, sh);
  decoded.release();

  const resultBlob = await oc.convertToBlob({
    type: 'image/jpeg',
    quality: msg.quality,
  });
  const resultBuffer = await resultBlob.arrayBuffer();

  ctx.postMessage(
    {
      type: 'compress-image-result',
      id: msg.id,
      buffer: resultBuffer,
      mime: 'image/jpeg',
      width: sw,
      height: sh,
    },
    [resultBuffer], // transfer ownership for zero-copy
  );
}

// ── LOD 缩略图生成 ───────────────────────────────────

async function handleGenerateLOD(msg: GenerateLODMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);
  const natW = decoded.width;
  const natH = decoded.height;

  const lodResults: Array<{
    level: number;
    buffer: ArrayBuffer;
    mime: string;
  }> = [];
  const transfers: ArrayBuffer[] = [];

  for (const maxPx of msg.levels) {
    // 如果原图比缩略图还小，跳过
    if (natW <= maxPx && natH <= maxPx) continue;

    let sw: number;
    let sh: number;
    if (natW >= natH) {
      sw = maxPx;
      sh = Math.round(natH * (maxPx / natW));
    } else {
      sh = maxPx;
      sw = Math.round(natW * (maxPx / natH));
    }

    const oc = new OffscreenCanvas(sw, sh);
    const ocCtx = oc.getContext('2d')!;
    ocCtx.drawImage(decoded.source, 0, 0, sw, sh);

    const quality = resolveLodQuality(msg.mime, maxPx, msg.qualities);
    const thumbBlob = await encodeLodBlob(oc, msg.mime, quality);
    const thumbBuffer = await thumbBlob.arrayBuffer();

    lodResults.push({ level: maxPx, buffer: thumbBuffer, mime: thumbBlob.type || 'image/jpeg' });
    transfers.push(thumbBuffer);
  }

  decoded.release();

  ctx.postMessage(
    {
      type: 'generate-lod-result',
      id: msg.id,
      imageId: msg.imageId,
      results: lodResults,
    },
    transfers, // zero-copy transfer
  );
}

// ── data URL → Blob ──────────────────────────────────

function handleDataUrlToBlob(msg: DataUrlToBlobMsg) {
  const { buffer, mime } = decodeDataUrlArrayBuffer(msg.dataUrl);

  ctx.postMessage(
    {
      type: 'dataurl-to-blob-result',
      id: msg.id,
      buffer,
      mime,
    },
    [buffer], // transfer ownership
  );
}

async function handleCropImage(msg: CropImageMsg) {
  const result = await cropImageInWorker(msg);
  ctx.postMessage(
    {
      type: 'crop-image-result',
      id: msg.id,
      buffer: result.buffer,
      mime: result.mime,
      width: result.width,
      height: result.height,
    },
    [result.buffer],
  );
}

async function handleSplitStoryboard(msg: SplitStoryboardMsg) {
  const result = await splitStoryboardInWorker(msg);
  ctx.postMessage(
    {
      type: 'split-storyboard-result',
      id: msg.id,
      results: result.results,
    },
    result.transfers,
  );
}

async function handleBuildStoryboardExport(msg: BuildStoryboardExportMsg) {
  const result = await buildStoryboardExportInWorker(msg);
  ctx.postMessage(
    {
      type: 'build-storyboard-export-result',
      id: msg.id,
      buffer: result.buffer,
      mime: result.mime,
    },
    [result.buffer],
  );
}

async function handleAnnotateImage(msg: AnnotateImageMsg) {
  const result = await annotateImageInWorker(msg);
  ctx.postMessage(
    {
      type: 'annotate-image-result',
      id: msg.id,
      buffer: result.buffer,
      mime: result.mime,
    },
    [result.buffer],
  );
}

// ── 数据序列化 / 反序列化 ────────────────────────────

function handleSerialize(msg: SerializeMsg) {
  const json = JSON.stringify(msg.data);
  ctx.postMessage({
    type: 'serialize-result',
    id: msg.id,
    json,
    byteLength: json.length * 2, // approximate UTF-16 size
  });
}

function handleDeserialize(msg: DeserializeMsg) {
  const data = JSON.parse(msg.json);
  ctx.postMessage({
    type: 'deserialize-result',
    id: msg.id,
    data,
  });
}

// Prevent TypeScript from treating this as a module without exports
export {};
