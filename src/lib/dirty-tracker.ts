/**
 * DirtyTracker — 增量保存变更追踪器
 *
 * 核心思想：
 * - 当前的 saveProject() 每次删除 ALL canvas_elements 然后重新 INSERT ALL
 * - 当有 10000 个元素时，每次保存要执行 10001 条 SQL（1 delete + 10000 insert）
 * - DirtyTracker 记录自上次保存以来哪些元素被新增/修改/删除
 * - 保存时只 upsert 脏元素 + delete 已删除元素
 *
 * 典型场景：用户移动了 1 个元素 → 只 upsert 1 行（而不是重写 10000 行）
 */

export interface DirtyTrackerStats {
  added: number;
  modified: number;
  removed: number;
  total: number;
}

import type { IDirtyTracker } from './editor-kernel';

export class DirtyTracker implements IDirtyTracker {
  /** 新增的元素 ID */
  private addedIds = new Set<string>();
  /** 修改过的元素 ID（不含新增） */
  private modifiedIds = new Set<string>();
  /** 已删除的元素 ID */
  private removedIds = new Set<string>();
  /** 上次保存时的 ID 集合（用于判断元素是新增还是已有） */
  private savedIds = new Set<string>();
  /** 脏状态修订号（用于避免并发保存误清空） */
  private changeRevision = 0;

  get revision(): number {
    return this.changeRevision;
  }

  /**
   * 初始化：传入从数据库加载的元素 ID 列表
   * 这些元素被认为已保存
   */
  initialize(elementIds: string[]): void {
    this.addedIds.clear();
    this.modifiedIds.clear();
    this.removedIds.clear();
    this.savedIds = new Set(elementIds);
    this.changeRevision = 0;
  }

  /**
   * 标记元素为已修改
   */
  markModified(elementId: string): void {
    // 如果是本轮新增的,不需要再标记为modified
    if (this.addedIds.has(elementId)) return;
    // 如果在已删除列表中,不应该被修改(忽略)
    if (this.removedIds.has(elementId)) return;
    if (this.modifiedIds.has(elementId)) return;
    this.modifiedIds.add(elementId);
    this.changeRevision += 1;
  }

  /**
   * 标记元素为新增
   */
  markAdded(elementId: string): void {
    // 如果之前被删除但现在又回来了(undo 场景)
    if (this.removedIds.has(elementId)) {
      this.removedIds.delete(elementId);
      // 如果原来就在数据库中, 标记为 modified (因为数据库中还有)
      if (this.savedIds.has(elementId)) {
        this.modifiedIds.add(elementId);
      } else {
        this.addedIds.add(elementId);
      }
      this.changeRevision += 1;
      return;
    }
    if (this.addedIds.has(elementId)) return;
    this.addedIds.add(elementId);
    this.changeRevision += 1;
  }

  /**
   * 标记元素为已删除
   */
  markRemoved(elementId: string): void {
    if (this.addedIds.has(elementId)) {
      // 本轮新增又删除 → 完全抵消, 数据库不需要任何操作
      this.addedIds.delete(elementId);
      this.changeRevision += 1;
      return;
    }
    if (this.removedIds.has(elementId)) return;
    this.modifiedIds.delete(elementId);
    this.removedIds.add(elementId);
    this.changeRevision += 1;
  }

  /**
   * 批量标记：比较旧元素列表和新元素列表，自动推断变更
   * 适用于 undo/redo 等批量变更场景
   */
  diffAndMark<T extends { id: string }>(
    oldElements: T[],
    newElements: T[]
  ): void {
    const oldMap = new Map<string, T>();
    for (const el of oldElements) oldMap.set(el.id, el);

    const newMap = new Map<string, T>();
    for (const el of newElements) newMap.set(el.id, el);

    // 新元素中有但旧元素没有的 → 新增
    for (const el of newElements) {
      if (!oldMap.has(el.id)) {
        this.markAdded(el.id);
      } else {
        // 都存在 → 检测是否修改过 (简单引用比较即可，因为 undo/redo 总是创建新对象)
        const oldEl = oldMap.get(el.id);
        if (oldEl !== el) {
          this.markModified(el.id);
        }
      }
    }

    // 旧元素中有但新元素没有的 → 删除
    for (const el of oldElements) {
      if (!newMap.has(el.id)) {
        this.markRemoved(el.id);
      }
    }
  }

  /**
   * 获取需要保存的变更
   */
  getChanges(): {
    addedIds: string[];
    modifiedIds: string[];
    removedIds: string[];
  } {
    return {
      addedIds: Array.from(this.addedIds),
      modifiedIds: Array.from(this.modifiedIds),
      removedIds: Array.from(this.removedIds),
    };
  }

  /**
   * 是否有待保存的变更
   */
  get isDirty(): boolean {
    return this.addedIds.size > 0 || this.modifiedIds.size > 0 || this.removedIds.size > 0;
  }

  /**
   * 统计信息
   */
  get stats(): DirtyTrackerStats {
    return {
      added: this.addedIds.size,
      modified: this.modifiedIds.size,
      removed: this.removedIds.size,
      total: this.addedIds.size + this.modifiedIds.size + this.removedIds.size,
    };
  }

  /**
   * 保存完成后调用 — 将当前脏数据清空，更新 savedIds
   */
  markSaved(currentElementIds: string[]): void {
    this.addedIds.clear();
    this.modifiedIds.clear();
    this.removedIds.clear();
    this.savedIds = new Set(currentElementIds);
    this.changeRevision = 0;
  }

  /**
   * 仅当保存期间没有新的脏变更产生时，才清空脏状态
   */
  markSavedIfUnchanged(expectedRevision: number, currentElementIds: string[]): boolean {
    if (this.changeRevision !== expectedRevision) {
      return false;
    }

    this.markSaved(currentElementIds);
    return true;
  }

  /**
   * 完全重置
   */
  reset(): void {
    this.addedIds.clear();
    this.modifiedIds.clear();
    this.removedIds.clear();
    this.savedIds.clear();
    this.changeRevision = 0;
  }
}
