/**
 * History Manager — 基于差分补丁的撤销/重做系统
 *
 * 核心思想：
 * - 不再对整个 elements[] 做 JSON 深拷贝（包含 base64 图片 → 每快照数 GB）
 * - 改为记录「差分补丁 (Patch)」：新增、删除、修改了哪些字段
 * - content / savedReferenceImage / savedFrameImages / flowReferenceImages 等大字段
 *   被分离到 ContentStore（引用计数），Patch 里只存引用 hash
 * - 每次 undo/redo 只需 apply/reverse 一个轻量 Patch
 *
 * 内存开销：O(变更字段数) 而非 O(元素总数 × 平均大小)
 */

// ─── Types ───────────────────────────────────────────────────

export type CanvasElementLike = {
  id: string;
};

type Snapshot = Record<string, unknown>;

function getSnapshotString(snapshot: Snapshot, key: string): string {
  const value = snapshot[key];
  return typeof value === 'string' ? value : '';
}

/** 大字段名列表 — 这些字段存入 ContentStore 而非 Patch */
const LARGE_FIELDS = new Set([
  'content',
  'flowReferenceImages',
  'savedReferenceImage',
  'savedFrameImages',
]);

/** 单个元素的字段变更 */
interface FieldChange {
  /** 旧值（对于大字段，存储 contentHash；对于小字段，存储实际值） */
  oldValue: unknown;
  /** 新值 */
  newValue: unknown;
  /** 是否为大字段（引用 ContentStore） */
  isLarge?: boolean;
}

/** 单个差分补丁条目 */
interface PatchEntry {
  type: 'add' | 'remove' | 'update';
  elementId: string;
  /** type='add' 时，存储新元素的元数据（大字段用 hash 替代） */
  elementSnapshot?: Snapshot;
  /** type='update' 时，各字段的变更 */
  changes?: Record<string, FieldChange>;
}

/** 一次操作的完整补丁 */
interface Patch {
  /** 唯一 ID */
  id: number;
  /** 时间戳 */
  timestamp: number;
  /** 包含的变更条目 */
  entries: PatchEntry[];
  /** 事务/语义元信息 */
  metadata?: PatchMetadata;
}

export interface PatchMetadata {
  label?: string;
  source?: string;
  selectionBefore?: string[];
  selectionAfter?: string[];
}

interface ActiveTransaction {
  metadata: PatchMetadata;
  changedIds: Set<string>;
}

export interface HistoryApplyResult<TElement extends CanvasElementLike = CanvasElementLike> {
  elements: TElement[];
  metadata?: PatchMetadata;
}

export interface HistoryTimelineEntry {
  id: number;
  timestamp: number;
  label: string;
  source?: string;
  active: boolean;
}

// ─── ContentStore — 大字段引用计数存储 ────────────────────────

class ContentStore {
  /** hash → { data, refCount } */
  private store = new Map<string, { data: string; refCount: number }>();

  /** 简单快速 hash（非加密，仅用于去重） */
  static hash(data: string): string {
    if (!data) return '';
    // FNV-1a 32-bit 改良版 — 对前 1024 字节 + 长度做 hash
    let h = 0x811c9dc5;
    const sample = data.length > 1024 ? data.substring(0, 512) + data.substring(data.length - 512) : data;
    for (let i = 0; i < sample.length; i++) {
      h ^= sample.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return `cs_${h.toString(36)}_${data.length}`;
  }

  /** 增加引用（如果不存在则存入） */
  addRef(data: string): string {
    if (!data) return '';
    const hash = ContentStore.hash(data);
    const existing = this.store.get(hash);
    if (existing) {
      existing.refCount++;
    } else {
      this.store.set(hash, { data, refCount: 1 });
    }
    return hash;
  }

  /** 减少引用，引用归零时释放 */
  release(hash: string): void {
    if (!hash) return;
    const entry = this.store.get(hash);
    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        this.store.delete(hash);
      }
    }
  }

  /** 获取数据 */
  get(hash: string): string | undefined {
    return this.store.get(hash)?.data;
  }

  /** 基于已有 hash 增加一次引用 */
  retain(hash: string): void {
    if (!hash) return;
    const entry = this.store.get(hash);
    if (entry) {
      entry.refCount++;
    }
  }

  /** 统计 */
  get stats() {
    let totalBytes = 0;
    for (const [, entry] of this.store) {
      totalBytes += entry.data.length * 2; // JS string = UTF-16
    }
    return {
      entries: this.store.size,
      totalMB: Math.round(totalBytes / (1024 * 1024)),
    };
  }
}

// ─── HistoryManager ──────────────────────────────────────────

export interface HistoryManagerOptions {
  /** 最大补丁数（默认 100） */
  maxPatches?: number;
}

import type { IHistoryManager } from './editor-kernel';

export class HistoryManager implements IHistoryManager {
  private patches: Patch[] = [];
  private currentIndex = -1; // 指向最后已应用的 patch
  private patchIdCounter = 0;
  private contentStore = new ContentStore();
  private maxPatches: number;

  /** 上一次快照缓存（用于计算 diff） */
  private lastSnapshot = new Map<string, Snapshot>();
  private activeTransaction: ActiveTransaction | null = null;

  constructor(options?: HistoryManagerOptions) {
    this.maxPatches = options?.maxPatches ?? 100;
  }

  /** 初始化基准快照（一般在初始加载后调用一次） */
  initialize(elements: CanvasElementLike[]): void {
    this.patches = [];
    this.currentIndex = -1;
    this.activeTransaction = null;
    this.lastSnapshot.clear();
    for (const el of elements) {
      this.lastSnapshot.set(el.id, this.snapshotElement(el));
    }
  }

  /** 将元素转为快照，大字段替换为 hash 并 addRef */
  private snapshotElement(el: CanvasElementLike): Snapshot {
    const snap: Snapshot = {};
    const source = el as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (LARGE_FIELDS.has(key) && typeof value === 'string' && value) {
        snap[key] = this.contentStore.addRef(value);
        snap[`__large_${key}`] = true;
      } else {
        snap[key] = value;
      }
    }
    return snap;
  }

  /** 为补丁复制快照，并为其中的大字段单独持有引用 */
  private cloneSnapshotForPatch(snapshot: Snapshot): Snapshot {
    const cloned = { ...snapshot };
    for (const key of Object.keys(snapshot)) {
      if (snapshot[`__large_${key}`]) {
        const hash = getSnapshotString(snapshot, key);
        if (hash) {
          this.contentStore.retain(hash);
        }
      }
    }
    return cloned;
  }

  /** 释放快照中大字段的引用 */
  private releaseSnapshot(snap: Snapshot): void {
    for (const key of Object.keys(snap)) {
      if (snap[`__large_${key}`]) {
        const hash = getSnapshotString(snap, key);
        if (hash) {
          this.contentStore.release(hash);
        }
      }
    }
  }

  private releasePatchEntry(entry: PatchEntry): void {
    if (entry.elementSnapshot) {
      this.releaseSnapshot(entry.elementSnapshot);
    }

    if (!entry.changes) return;

    for (const [, change] of Object.entries(entry.changes)) {
      if (!change.isLarge) continue;
      if (typeof change.oldValue === 'string' && change.oldValue) this.contentStore.release(change.oldValue);
      if (typeof change.newValue === 'string' && change.newValue) this.contentStore.release(change.newValue);
    }
  }

  private buildUpdateEntry(
    el: CanvasElementLike,
    oldSnap: Snapshot,
  ): PatchEntry | null {
    const changes: Record<string, FieldChange> = {};
    let hasChange = false;

    for (const key of Object.keys(el)) {
      if (key === 'id') continue;
      const source = el as Record<string, unknown>;
      const value = source[key];
      const isLarge = LARGE_FIELDS.has(key) && typeof value === 'string' && !!value;
      if (isLarge) {
        const oldHash = getSnapshotString(oldSnap, key);
        const newHash = ContentStore.hash(value);
        if (newHash !== oldHash) {
          if (oldHash) this.contentStore.retain(oldHash);
          changes[key] = {
            oldValue: oldHash,
            newValue: this.contentStore.addRef(value),
            isLarge: true,
          };
          hasChange = true;
        }
      } else {
        const oldVal = oldSnap[`__large_${key}`] ? undefined : oldSnap[key];
        if (!shallowEqual(oldVal, value)) {
          changes[key] = { oldValue: oldVal, newValue: value };
          hasChange = true;
        }
      }
    }

    for (const key of Object.keys(oldSnap)) {
      if (key.startsWith('__large_') || key === 'id') continue;
      if (!(key in el)) {
        const isLarge = Boolean(oldSnap[`__large_${key}`]);
        const oldHash = getSnapshotString(oldSnap, key);
        if (isLarge && oldHash) {
          this.contentStore.retain(oldHash);
        }
        changes[key] = {
          oldValue: oldSnap[key],
          newValue: undefined,
          isLarge,
        };
        hasChange = true;
      }
    }

    if (!hasChange) return null;
    return { type: 'update', elementId: el.id, changes };
  }

  private finalizeRecord(entries: PatchEntry[], metadata?: PatchMetadata): boolean {
    if (entries.length === 0) return false;

    if (this.currentIndex < this.patches.length - 1) {
      const removed = this.patches.splice(this.currentIndex + 1);
      for (const patch of removed) {
        for (const entry of patch.entries) {
          this.releasePatchEntry(entry);
        }
      }
    }

    const patch: Patch = {
      id: this.patchIdCounter++,
      timestamp: Date.now(),
      entries,
      metadata,
    };

    this.patches.push(patch);
    this.currentIndex = this.patches.length - 1;

    while (this.patches.length > this.maxPatches) {
      const oldest = this.patches.shift()!;
      this.currentIndex--;
      for (const entry of oldest.entries) {
        this.releasePatchEntry(entry);
      }
    }

    return true;
  }

  private applySnapshotChanges(
    currentMap: Map<string, CanvasElementLike>,
    changedIds: Iterable<string>,
  ): void {
    for (const id of changedIds) {
      const oldSnap = this.lastSnapshot.get(id);
      if (oldSnap) {
        this.releaseSnapshot(oldSnap);
        this.lastSnapshot.delete(id);
      }

      const current = currentMap.get(id);
      if (current) {
        this.lastSnapshot.set(id, this.snapshotElement(current));
      }
    }
  }

  /** 记录一组新的变更。传入当前最新的 elements 数组。 */
  record(currentElements: CanvasElementLike[]): boolean {
    const allIds = new Set<string>();
    for (const el of currentElements) allIds.add(el.id);
    for (const id of this.lastSnapshot.keys()) allIds.add(id);
    return this.recordIncremental(currentElements, allIds);
  }

  /** 按变更 ID 增量记录历史，避免每次都遍历全部元素字段。 */
  recordIncremental(
    currentElements: Iterable<CanvasElementLike> | Map<string, CanvasElementLike>,
    changedIds: Iterable<string>,
    metadata?: PatchMetadata,
  ): boolean {
    const currentMap = currentElements instanceof Map
      ? currentElements
      : new Map(Array.from(currentElements, (el) => [el.id, el]));

    const uniqueChangedIds = Array.from(new Set(changedIds));
    if (uniqueChangedIds.length === 0) return false;

    const entries: PatchEntry[] = [];

    for (const id of uniqueChangedIds) {
      const current = currentMap.get(id);
      const oldSnap = this.lastSnapshot.get(id);

      if (current && !oldSnap) {
        entries.push({
          type: 'add',
          elementId: id,
          elementSnapshot: this.snapshotElement(current),
        });
        continue;
      }

      if (!current && oldSnap) {
        entries.push({
          type: 'remove',
          elementId: id,
          elementSnapshot: this.cloneSnapshotForPatch(oldSnap),
        });
        continue;
      }

      if (current && oldSnap) {
        const entry = this.buildUpdateEntry(current, oldSnap);
        if (entry) entries.push(entry);
      }
    }

    const recorded = this.finalizeRecord(entries, metadata);
    if (!recorded) return false;

    this.applySnapshotChanges(currentMap, uniqueChangedIds);
    return true;
  }

  /** 重建快照缓存 */
  private rebuildSnapshot(elements: CanvasElementLike[]): void {
    // 释放旧快照
    for (const [, snap] of this.lastSnapshot) {
      this.releaseSnapshot(snap);
    }
    this.lastSnapshot.clear();
    for (const el of elements) {
      this.lastSnapshot.set(el.id, this.snapshotElement(el));
    }
  }

  /** 撤销：返回需要还原到的 elements 数组 */
  undo(currentElements: CanvasElementLike[]): HistoryApplyResult | null {
    if (this.currentIndex < 0) return null;

    const patch = this.patches[this.currentIndex];
    this.currentIndex--;

    const resultMap = new Map<string, CanvasElementLike>();
    for (const el of currentElements) resultMap.set(el.id, { ...el });

    // 反向应用补丁
    for (const entry of patch.entries) {
      switch (entry.type) {
        case 'add':
          // 撤销新增 = 移除
          resultMap.delete(entry.elementId);
          break;

        case 'remove':
          // 撤销删除 = 恢复
          if (entry.elementSnapshot) {
            const restored = this.restoreElement(entry.elementSnapshot);
            resultMap.set(entry.elementId, restored);
          }
          break;

        case 'update':
          // 撤销修改 = 还原字段
          if (entry.changes) {
            const el = resultMap.get(entry.elementId);
            if (el) {
              for (const [fieldName, change] of Object.entries(entry.changes)) {
                if (change.isLarge) {
                  const data = typeof change.oldValue === 'string'
                    ? this.contentStore.get(change.oldValue)
                    : undefined;
                  if (data !== undefined) {
                    (el as Record<string, unknown>)[fieldName] = data;
                  } else if (change.oldValue === '' || change.oldValue === undefined) {
                    delete (el as Record<string, unknown>)[fieldName];
                  }
                } else {
                  if (change.oldValue === undefined) {
                    delete (el as Record<string, unknown>)[fieldName];
                  } else {
                    (el as Record<string, unknown>)[fieldName] = change.oldValue;
                  }
                }
              }
              resultMap.set(entry.elementId, el);
            }
          }
          break;
      }
    }

    const result = Array.from(resultMap.values());
    this.rebuildSnapshot(result);
    return {
      elements: result,
      metadata: patch.metadata,
    };
  }

  /** 重做：返回需要前进到的 elements 数组 */
  redo(currentElements: CanvasElementLike[]): HistoryApplyResult | null {
    if (this.currentIndex >= this.patches.length - 1) return null;

    this.currentIndex++;
    const patch = this.patches[this.currentIndex];

    const resultMap = new Map<string, CanvasElementLike>();
    for (const el of currentElements) resultMap.set(el.id, { ...el });

    // 正向应用补丁
    for (const entry of patch.entries) {
      switch (entry.type) {
        case 'add':
          if (entry.elementSnapshot) {
            const restored = this.restoreElement(entry.elementSnapshot);
            resultMap.set(entry.elementId, restored);
          }
          break;

        case 'remove':
          resultMap.delete(entry.elementId);
          break;

        case 'update':
          if (entry.changes) {
            const el = resultMap.get(entry.elementId);
            if (el) {
              for (const [fieldName, change] of Object.entries(entry.changes)) {
                if (change.isLarge) {
                  const data = typeof change.newValue === 'string'
                    ? this.contentStore.get(change.newValue)
                    : undefined;
                  if (data !== undefined) {
                    (el as Record<string, unknown>)[fieldName] = data;
                  } else if (change.newValue === '' || change.newValue === undefined) {
                    delete (el as Record<string, unknown>)[fieldName];
                  }
                } else {
                  if (change.newValue === undefined) {
                    delete (el as Record<string, unknown>)[fieldName];
                  } else {
                    (el as Record<string, unknown>)[fieldName] = change.newValue;
                  }
                }
              }
              resultMap.set(entry.elementId, el);
            }
          }
          break;
      }
    }

    const result = Array.from(resultMap.values());
    this.rebuildSnapshot(result);
    return {
      elements: result,
      metadata: patch.metadata,
    };
  }

  beginTransaction(metadata?: PatchMetadata): void {
    this.activeTransaction = {
      metadata: {
        ...metadata,
        selectionBefore: metadata?.selectionBefore ? [...metadata.selectionBefore] : undefined,
        selectionAfter: metadata?.selectionAfter ? [...metadata.selectionAfter] : undefined,
      },
      changedIds: new Set<string>(),
    };
  }

  touchTransactionIds(changedIds: Iterable<string>): void {
    if (!this.activeTransaction) return;
    for (const id of changedIds) {
      if (id) {
        this.activeTransaction.changedIds.add(id);
      }
    }
  }

  commitTransaction(
    currentElements: Iterable<CanvasElementLike> | Map<string, CanvasElementLike>,
    metadata?: PatchMetadata,
  ): boolean {
    if (!this.activeTransaction) {
      return this.recordIncremental(currentElements, [], metadata);
    }

    const changedIds = Array.from(this.activeTransaction.changedIds);
    const mergedMetadata: PatchMetadata = {
      ...this.activeTransaction.metadata,
      ...metadata,
      selectionBefore: metadata?.selectionBefore ?? this.activeTransaction.metadata.selectionBefore,
      selectionAfter: metadata?.selectionAfter ?? this.activeTransaction.metadata.selectionAfter,
    };

    this.activeTransaction = null;

    if (changedIds.length === 0) {
      return false;
    }

    return this.recordIncremental(currentElements, changedIds, mergedMetadata);
  }

  cancelTransaction(): void {
    this.activeTransaction = null;
  }

  get hasActiveTransaction(): boolean {
    return !!this.activeTransaction;
  }

  /** 从快照恢复元素对象（大字段从 ContentStore 取回） */
  private restoreElement(snapshot: Snapshot): CanvasElementLike {
    const el: Record<string, unknown> = {};
    for (const key of Object.keys(snapshot)) {
      if (key.startsWith('__large_')) continue;
      if (snapshot[`__large_${key}`]) {
        const data = this.contentStore.get(getSnapshotString(snapshot, key));
        if (data !== undefined) el[key] = data;
      } else {
        el[key] = snapshot[key];
      }
    }
    return el as CanvasElementLike;
  }

  /** 能否撤销 */
  get canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /** 能否重做 */
  get canRedo(): boolean {
    return this.currentIndex < this.patches.length - 1;
  }

  /** 统计信息 */
  get stats() {
    return {
      patchCount: this.patches.length,
      currentIndex: this.currentIndex,
      contentStore: this.contentStore.stats,
    };
  }

  get timeline(): HistoryTimelineEntry[] {
    return this.patches.map((patch, index) => ({
      id: patch.id,
      timestamp: patch.timestamp,
      label: patch.metadata?.label || patch.metadata?.source || `操作 ${patch.id + 1}`,
      source: patch.metadata?.source,
      active: index <= this.currentIndex,
    }));
  }
}

// ─── Utilities ───────────────────────────────────────────────

/** 浅比较两个值 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  // 数组浅比较
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 对象浅比较（只比较第一层 — points 数组等需要特殊处理）
  if (typeof a === 'object' && typeof b === 'object') {
    const objectA = a as Record<string, unknown>;
    const objectB = b as Record<string, unknown>;
    const keysA = Object.keys(objectA);
    const keysB = Object.keys(objectB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (objectA[key] !== objectB[key]) return false;
    }
    return true;
  }

  return false;
}
