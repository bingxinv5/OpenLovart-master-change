'use client';

/**
 * Worker Transport — Worker 单例生命周期管理、消息路由与取消机制
 *
 * 所有图片操作（compress、LOD、crop、annotate、split、export）
 * 通过本模块与 Web Worker 通信。
 */

// ── Worker 单例管理 ───────────────────────────────────

let _worker: Worker | null = null;
let _workerSupported = true;
const _pendingCallbacks = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();
let _messageIdCounter = 0;

function createWorkerCancelledError() {
  return new Error('Worker cancelled');
}

function rejectAllPending(reason: Error) {
  for (const [, cb] of _pendingCallbacks) {
    cb.reject(reason);
  }
  _pendingCallbacks.clear();
}

export function isWorkerCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Worker cancelled';
}

function getWorkerDebugDelayMs(): number {
  const value = (globalThis as { __OPENLOVART_IMAGE_WORKER_DEBUG_DELAY_MS__?: number }).__OPENLOVART_IMAGE_WORKER_DEBUG_DELAY_MS__;
  return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0;
}

function isWorkerForcedOff(): boolean {
  return Boolean((globalThis as { __OPENLOVART_DISABLE_IMAGE_WORKER__?: boolean }).__OPENLOVART_DISABLE_IMAGE_WORKER__);
}

export function setLastWorkerMode(operation: 'crop' | 'split' | 'export' | 'annotate', mode: 'worker' | 'fallback') {
  const target = globalThis as {
    __OPENLOVART_LAST_IMAGE_WORKER_MODE__?: Partial<Record<'crop' | 'split' | 'export' | 'annotate', 'worker' | 'fallback'>>;
  };

  target.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {
    ...(target.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ || {}),
    [operation]: mode,
  };
}

export function setLastWorkerError(operation: 'crop' | 'split' | 'export' | 'annotate', error: unknown) {
  const target = globalThis as {
    __OPENLOVART_LAST_IMAGE_WORKER_ERROR__?: Partial<Record<'crop' | 'split' | 'export' | 'annotate', string>>;
  };

  target.__OPENLOVART_LAST_IMAGE_WORKER_ERROR__ = {
    ...(target.__OPENLOVART_LAST_IMAGE_WORKER_ERROR__ || {}),
    [operation]: error instanceof Error ? error.message : String(error),
  };
}

function getWorker(): Worker | null {
  if (!_workerSupported) return null;
  if (isWorkerForcedOff()) return null;
  if (_worker) return _worker;

  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    _workerSupported = false;
    return null;
  }

  try {
    _worker = new Worker(
      new URL('./image-worker.ts', import.meta.url),
      { type: 'module' },
    );

    _worker.onmessage = (event: MessageEvent) => {
      const { id, type, error, ...rest } = event.data;
      const finish = () => {
        const pending = _pendingCallbacks.get(id);
        if (!pending) return;
        _pendingCallbacks.delete(id);

        if (type === 'error') {
          pending.reject(new Error(error));
        } else {
          pending.resolve(rest);
        }
      };

      const delayMs = getWorkerDebugDelayMs();
      if (delayMs > 0 && type !== 'error') {
        window.setTimeout(finish, delayMs);
        return;
      }

      finish();
    };

    _worker.onerror = (event) => {
      console.warn('[ImageWorkerBridge] Worker error:', event.message);
      rejectAllPending(new Error('Worker crashed'));
      _worker = null;
    };

    return _worker;
  } catch (err) {
    console.warn('[ImageWorkerBridge] Worker creation failed, falling back to main thread:', err);
    _workerSupported = false;
    return null;
  }
}

function nextId(): string {
  return `iw_${++_messageIdCounter}`;
}

export function postToWorker<T>(
  msg: Record<string, unknown>,
  transfers?: Transferable[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('Worker not available'));
      return;
    }

    const id = nextId();
    _pendingCallbacks.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });

    const fullMsg = { ...msg, id };
    if (transfers && transfers.length > 0) {
      worker.postMessage(fullMsg, transfers);
    } else {
      worker.postMessage(fullMsg);
    }
  });
}

// ── Worker 可用性 ──────────────────────────────────────

export { _workerSupported };
export { isWorkerForcedOff };

/**
 * 检查 Worker 是否可用
 */
export function isWorkerAvailable(): boolean {
  return _workerSupported && !isWorkerForcedOff() && typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

// ── 生命周期控制 ───────────────────────────────────────

/**
 * 终止 Worker（用于清理）
 */
export function terminateWorker(): void {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
  rejectAllPending(new Error('Worker terminated'));
}

export function cancelActiveWorkerJobs(): void {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
  rejectAllPending(createWorkerCancelledError());
}

// ── 序列化工具 ─────────────────────────────────────────

import { decodeDataUrlArrayBuffer } from './data-url';

/**
 * data URL → Blob 转换（在 Worker 中执行 atob 解码，避免主线程大量字符串操作）
 */
export async function workerDataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (_workerSupported && typeof window !== 'undefined') {
    try {
      const result = await postToWorker<{ buffer: ArrayBuffer; mime: string }>({
        type: 'dataurl-to-blob',
        dataUrl,
      });
      return new Blob([result.buffer], { type: result.mime });
    } catch {
      // fall through
    }
  }

  const { buffer, mime } = decodeDataUrlArrayBuffer(dataUrl);
  return new Blob([buffer], { type: mime });
}

/**
 * 序列化大数据 — 在 Worker 线程执行 JSON.stringify
 */
export async function workerSerialize(data: unknown): Promise<string> {
  if (_workerSupported && typeof window !== 'undefined') {
    try {
      const result = await postToWorker<{ json: string }>({
        type: 'serialize',
        data,
      });
      return result.json;
    } catch {
      // fall through
    }
  }
  return JSON.stringify(data);
}

/**
 * 反序列化大数据 — 在 Worker 线程执行 JSON.parse
 */
export async function workerDeserialize<T = unknown>(json: string): Promise<T> {
  if (_workerSupported && typeof window !== 'undefined') {
    try {
      const result = await postToWorker<{ data: T }>({
        type: 'deserialize',
        json,
      });
      return result.data;
    } catch {
      // fall through
    }
  }
  return JSON.parse(json);
}
