/**
 * SpatialIndex — R-Tree 空间索引
 *
 * 使用 rbush 库提供 O(log n) 的矩形范围查询，替代线性 O(n) 扫描。
 *
 * 用途：
 * - 视口裁剪 (viewport culling)：快速找到可见元素
 * - 拖拽吸附 (snap)：快速找到附近元素
 * - 帧检测 (frame detection)：快速找到某区域内的 frame 元素
 *
 * 内存：~100 字节/元素。10,000 元素 ≈ 1 MB。
 */

import RBush from 'rbush';

// ── Types ────────────────────────────────────────────────────

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SpatialItem extends BBox {
  id: string;
}

import type { ISpatialIndex } from './editor-kernel';

// ── SpatialIndex class ───────────────────────────────────────

export class SpatialIndex implements ISpatialIndex {
  private tree = new RBush<SpatialItem>();
  /** id → item lookup for O(1) removal/update */
  private items = new Map<string, SpatialItem>();

  /** Build index from a full set of elements */
  load(elements: Array<{ id: string; x: number; y: number; width?: number; height?: number }>): void {
    this.tree.clear();
    this.items.clear();
    const items: SpatialItem[] = elements.map(el => {
      const item: SpatialItem = {
        id: el.id,
        minX: el.x,
        minY: el.y,
        maxX: el.x + (el.width || 0),
        maxY: el.y + (el.height || 0),
      };
      this.items.set(el.id, item);
      return item;
    });
    this.tree.load(items);
  }

  /** Insert a single element */
  insert(el: { id: string; x: number; y: number; width?: number; height?: number }): void {
    // Remove existing if any
    this.remove(el.id);
    const item: SpatialItem = {
      id: el.id,
      minX: el.x,
      minY: el.y,
      maxX: el.x + (el.width || 0),
      maxY: el.y + (el.height || 0),
    };
    this.items.set(el.id, item);
    this.tree.insert(item);
  }

  /** Remove an element by ID */
  remove(id: string): void {
    const existing = this.items.get(id);
    if (existing) {
      this.tree.remove(existing);
      this.items.delete(id);
    }
  }

  /** Update an element's position/size (remove + re-insert) */
  update(el: { id: string; x: number; y: number; width?: number; height?: number }): void {
    this.insert(el); // insert already handles remove
  }

  /** Batch update multiple elements (more efficient than N individual updates for small batches) */
  batchUpdate(elements: Array<{ id: string; x: number; y: number; width?: number; height?: number }>): void {
    for (const el of elements) {
      this.remove(el.id);
    }
    const items: SpatialItem[] = [];
    for (const el of elements) {
      const item: SpatialItem = {
        id: el.id,
        minX: el.x,
        minY: el.y,
        maxX: el.x + (el.width || 0),
        maxY: el.y + (el.height || 0),
      };
      this.items.set(el.id, item);
      items.push(item);
    }
    for (const item of items) {
      this.tree.insert(item);
    }
  }

  /**
   * Search for elements that intersect a bounding box.
   * Returns element IDs.
   */
  search(bbox: BBox): string[] {
    return this.tree.search(bbox).map(item => item.id);
  }

  /**
   * Search for elements near a given bounding box, expanded by `margin` pixels.
   * Useful for snap/alignment detection.
   */
  searchNearby(bbox: BBox, margin: number): string[] {
    return this.tree.search({
      minX: bbox.minX - margin,
      minY: bbox.minY - margin,
      maxX: bbox.maxX + margin,
      maxY: bbox.maxY + margin,
    }).map(item => item.id);
  }

  /** Total number of indexed elements */
  get size(): number {
    return this.items.size;
  }

  /** Check if an element is indexed */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Clear all data */
  clear(): void {
    this.tree.clear();
    this.items.clear();
  }
}
