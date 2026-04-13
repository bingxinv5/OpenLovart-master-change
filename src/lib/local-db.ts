'use client';

import { v4 as uuidv4 } from 'uuid';

/**
 * IndexedDB based database that mimics Supabase's query API.
 * Uses IndexedDB for persistence (supports hundreds of MB, unlike localStorage's ~5MB).
 * Supports: from().select().insert().update().delete().eq().order().single()
 */

type Row = Record<string, unknown>;
type StoredRow = Row & { _key?: string };
type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };
type ChainableQuery = QueryBuilder & Promise<QueryResult>;
const IMAGE_REF_PREFIX = 'imgref://';

const DB_NAME = 'lovart_local_db';
const DB_VERSION = 2;

// ── IndexedDB helpers ──────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;
let dbReady: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbReady) return dbReady;

  dbReady = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      // v0 → v1: Single object store keyed by table name
      if (oldVersion < 1) {
        db.createObjectStore('tables');
      }
      // v1 → v2: Per-element storage for canvas_elements (O(1) read/write)
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('elements')) {
          const elemStore = db.createObjectStore('elements', { keyPath: '_key' });
          elemStore.createIndex('by_project', 'project_id', { unique: false });
        }
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      // Handle unexpected close (e.g. browser clearing data)
      dbInstance.onclose = () => { dbInstance = null; dbReady = null; };
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
  return dbReady;
}

async function getStore(table: string): Promise<Row[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('tables', 'readonly');
      const store = tx.objectStore('tables');
      const req = store.get(table);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function setStore(table: string, rows: Row[]): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tables', 'readwrite');
    const store = tx.objectStore('tables');
    const req = store.put(rows, table);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Per-element storage helpers (canvas_elements) ────────────────

function makeElementKey(projectId: string, elementDataId: string): string {
  return `${projectId}::${elementDataId}`;
}

function stripStoredRow(row: StoredRow): Row {
  const nextRow = { ...row };
  delete nextRow._key;
  return nextRow;
}

function getRowStringValue(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' ? value : undefined;
}

function getRowElementData(row: Row): Record<string, unknown> | undefined {
  const value = row.element_data;
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function getRowElementId(row: Row): string | undefined {
  const elementData = getRowElementData(row);
  const elementDataId = elementData?.id;
  if (typeof elementDataId === 'string' && elementDataId.length > 0) {
    return elementDataId;
  }
  return getRowStringValue(row, 'id');
}

function isComparableValue(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

async function getElementsByProject(projectId: string): Promise<Row[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readonly');
      const store = tx.objectStore('elements');
      const index = store.index('by_project');
      const req = index.getAll(projectId);
      req.onsuccess = () => {
        // Strip internal _key field before returning
        const rows = ((req.result ?? []) as StoredRow[]).map(stripStoredRow);
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

function collectImageRefsFromRow(row: Row, refs: Set<string>): void {
  const content = getRowElementData(row)?.content;
  if (typeof content === 'string' && content.startsWith(IMAGE_REF_PREFIX)) {
    refs.add(content);
  }
}

async function collectAllImageRefs(): Promise<string[]> {
  if (typeof window === 'undefined') return [];

  const refs = new Set<string>();

  try {
    const db = await openDB();

    // Collect refs from per-element storage (canvas_elements v2)
    if (db.objectStoreNames.contains('elements')) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction('elements', 'readonly');
        const store = tx.objectStore('elements');
        const req = store.openCursor();

        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          collectImageRefsFromRow(cursor.value as Row, refs);
          cursor.continue();
        };

        req.onerror = () => resolve();
        tx.onerror = () => resolve();
      });
    }

    // Collect refs from legacy canvas_elements storage
    const legacyRows = await new Promise<Row[]>((resolve) => {
      const tx = db.transaction('tables', 'readonly');
      const store = tx.objectStore('tables');
      const req = store.get('canvas_elements');
      req.onsuccess = () => resolve((req.result as Row[]) ?? []);
      req.onerror = () => resolve([]);
    });

    for (const row of legacyRows) {
      collectImageRefsFromRow(row, refs);
    }

    // Collect refs from project thumbnails (custom covers)
    const projectRows = await new Promise<Row[]>((resolve) => {
      const tx = db.transaction('tables', 'readonly');
      const store = tx.objectStore('tables');
      const req = store.get('projects');
      req.onsuccess = () => resolve((req.result as Row[]) ?? []);
      req.onerror = () => resolve([]);
    });

    for (const row of projectRows) {
      if (typeof row.thumbnail === 'string' && row.thumbnail.startsWith(IMAGE_REF_PREFIX)) {
        refs.add(row.thumbnail);
      }
    }
  } catch {
    return [];
  }

  return Array.from(refs);
}

/**
 * 按复合键读取单个元素 — O(1) 直接 key 查找
 */
async function getElementByKey(projectId: string, elementDataId: string): Promise<Row | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readonly');
      const store = tx.objectStore('elements');
      const req = store.get(makeElementKey(projectId, elementDataId));
      req.onsuccess = () => {
        const row = req.result;
        if (!row) { resolve(null); return; }
        resolve(stripStoredRow(row as StoredRow));
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 部分字段投影 — 只返回指定字段，减少上层处理开销
 * @param fields — 需要的字段列表。特殊值 'element_data.*field*' 支持嵌套 element_data 字段
 */
async function getElementPartial(
  projectId: string,
  elementDataId: string,
  fields: string[],
): Promise<Partial<Row> | null> {
  const row = await getElementByKey(projectId, elementDataId);
  if (!row) return null;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const elementData = getRowElementData(row);
    if (field.startsWith('element_data.') && elementData) {
      const subField = field.slice('element_data.'.length);
      const projectedElementData = (result.element_data ?? {}) as Record<string, unknown>;
      projectedElementData[subField] = elementData[subField];
      result.element_data = projectedElementData;
    } else {
      result[field] = row[field];
    }
  }
  return result;
}

/**
 * 游标遍历 — 按页批量读取，不一次性加载全部数据到内存
 * @param batchSize — 每批返回的元素数量（默认 100）
 * @param onBatch — 每批回调，返回 false 可提前终止遍历
 */
async function getElementsByProjectCursor(
  projectId: string,
  batchSize: number = 100,
  onBatch: (rows: Row[]) => boolean | void | Promise<boolean | void>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readonly');
      const store = tx.objectStore('elements');
      const index = store.index('by_project');
      const cursorReq = index.openCursor(IDBKeyRange.only(projectId));
      let batch: Row[] = [];
      let stopped = false;

      cursorReq.onsuccess = async () => {
        if (stopped) return;
        const cursor = cursorReq.result;
        if (cursor) {
          batch.push(stripStoredRow(cursor.value as StoredRow));
          if (batch.length >= batchSize) {
            const shouldContinue = await onBatch(batch);
            batch = [];
            if (shouldContinue === false) {
              stopped = true;
              resolve();
              return;
            }
          }
          cursor.continue();
        } else {
          // No more records — flush remaining batch
          if (batch.length > 0) {
            await onBatch(batch);
          }
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

/**
 * 异步生成器 — 逐条遍历元素，内存友好
 * 用法：for await (const row of elementCursorIterator(projectId)) { ... }
 */
async function* elementCursorIterator(projectId: string): AsyncGenerator<Row, void, undefined> {
  if (typeof window === 'undefined') return;
  const db = await openDB();
  const tx = db.transaction('elements', 'readonly');
  const store = tx.objectStore('elements');
  const index = store.index('by_project');

  // 使用一个 Promise 队列来桥接 IDB 事件 → async generator
  let resolveCurrent: ((value: IteratorResult<Row, void>) => void) | null = null;
  let done = false;
  const pendingRows: Row[] = [];

  const cursorReq = index.openCursor(IDBKeyRange.only(projectId));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      const rest = stripStoredRow(cursor.value as StoredRow);
      if (resolveCurrent) {
        const resolve = resolveCurrent;
        resolveCurrent = null;
        resolve({ value: rest, done: false });
      } else {
        pendingRows.push(rest);
      }
      cursor.continue();
    } else {
      done = true;
      if (resolveCurrent) {
        const resolve = resolveCurrent;
        resolveCurrent = null;
        resolve({ value: undefined, done: true });
      }
    }
  };
  cursorReq.onerror = () => {
    done = true;
    if (resolveCurrent) {
      const resolve = resolveCurrent;
      resolveCurrent = null;
      resolve({ value: undefined, done: true });
    }
  };

  while (true) {
    if (pendingRows.length > 0) {
      yield pendingRows.shift()!;
    } else if (done) {
      return;
    } else {
      const row = await new Promise<IteratorResult<Row, void>>((resolve) => {
        resolveCurrent = resolve;
      });
      if (row.done) return;
      yield row.value;
    }
  }
}

/**
 * 统计项目元素数量 — 不加载数据，仅计数
 */
async function countElementsByProject(projectId: string): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readonly');
      const store = tx.objectStore('elements');
      const index = store.index('by_project');
      const req = index.count(IDBKeyRange.only(projectId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * 批量读取指定 ID 的元素 — 单事务多 get，比逐个调用更高效
 */
async function getElementsByKeys(
  projectId: string,
  elementIds: string[],
): Promise<Row[]> {
  if (typeof window === 'undefined' || elementIds.length === 0) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readonly');
      const store = tx.objectStore('elements');
      const results: Row[] = [];
      let pending = elementIds.length;

      for (const eid of elementIds) {
        const req = store.get(makeElementKey(projectId, eid));
        req.onsuccess = () => {
          if (req.result) {
            results.push(stripStoredRow(req.result as StoredRow));
          }
          if (--pending === 0) resolve(results);
        };
        req.onerror = () => {
          if (--pending === 0) resolve(results);
        };
      }
    });
  } catch {
    return [];
  }
}

async function putElements(rows: Row[]): Promise<void> {
  if (typeof window === 'undefined' || rows.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('elements', 'readwrite');
    const store = tx.objectStore('elements');
    for (const row of rows) {
      const projectId = getRowStringValue(row, 'project_id');
      const elementId = getRowElementId(row);
      if (!projectId || !elementId) continue;
      const key = makeElementKey(projectId, elementId);
      store.put({ ...row, _key: key, project_id: projectId });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteElementByKey(projectId: string, elementDataId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readwrite');
      const store = tx.objectStore('elements');
      store.delete(makeElementKey(projectId, elementDataId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

/**
 * 批量删除多个元素 — 单事务，比逐个 deleteElementByKey 更高效
 */
async function deleteElementsByKeys(projectId: string, elementIds: string[]): Promise<void> {
  if (typeof window === 'undefined' || elementIds.length === 0) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readwrite');
      const store = tx.objectStore('elements');
      for (const eid of elementIds) {
        store.delete(makeElementKey(projectId, eid));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

async function deleteElementsByProject(projectId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('elements', 'readwrite');
      const store = tx.objectStore('elements');
      const index = store.index('by_project');
      const cursorReq = index.openCursor(IDBKeyRange.only(projectId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Migrate existing localStorage data to IndexedDB (one-time) ────

async function migrateFromLocalStorage() {
  if (typeof window === 'undefined') return;
  const migrated = localStorage.getItem('lovart_db_migrated');
  if (migrated) return;

  const tables = ['projects', 'canvas_elements', 'user_profiles'];
  for (const t of tables) {
    const key = `lovart_db_${t}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const rows: Row[] = JSON.parse(raw);
        if (Array.isArray(rows) && rows.length > 0) {
          await setStore(t, rows);
        }
        localStorage.removeItem(key);
      } catch { /* ignore corrupt data */ }
    }
  }
  localStorage.setItem('lovart_db_migrated', '1');
}

// ── Migrate canvas_elements from tables store to per-element store ──

let _elemMigrated = false;
async function migrateCanvasElementsToPerElement() {
  if (typeof window === 'undefined') return;
  if (_elemMigrated) return;
  _elemMigrated = true;
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains('elements')) return;
    const oldRows = await new Promise<Row[]>((resolve) => {
      const tx = db.transaction('tables', 'readonly');
      const store = tx.objectStore('tables');
      const req = store.get('canvas_elements');
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
    if (oldRows.length === 0) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['elements', 'tables'], 'readwrite');
      const elemStore = tx.objectStore('elements');
      const tablesStore = tx.objectStore('tables');
      for (const row of oldRows) {
        const projectId = getRowStringValue(row, 'project_id');
        const elementId = getRowElementId(row);
        if (!projectId || !elementId) continue;
        const key = makeElementKey(projectId, elementId);
        elemStore.put({ ...row, _key: key, project_id: projectId });
      }
      tablesStore.delete('canvas_elements');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    console.log(`[local-db] Migrated ${oldRows.length} canvas elements to per-element storage`);
  } catch (err) {
    console.warn('[local-db] Canvas elements migration failed:', err);
  }
}

// Kick off migrations as soon as module loads (client-side)
if (typeof window !== 'undefined') {
  migrateFromLocalStorage().catch(() => {});
  openDB().then(() => migrateCanvasElementsToPerElement()).catch(() => {});
}

// ── QueryBuilder ──────────────────────────────────────────────────

class QueryBuilder {
  private table: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: Array<{ column: string; value: unknown }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private isSingle = false;
  private insertData: Row | Row[] | null = null;
  private updateData: Row | null = null;
  private selectColumns: string = '*';
  private extraFilters: Array<{ path: string; op: string; value: unknown }> = [];

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    this.operation = 'select';
    this.selectColumns = columns;
    return this;
  }

  insert(data: Row | Row[]) {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: Row) {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  /** Supabase-style filter for JSONB path expressions, e.g. filter('element_data->>id', 'eq', value) */
  filter(path: string, op: string, value: unknown) {
    this.extraFilters.push({ path, op, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  single() {
    this.isSingle = true;
    return this.execute();
  }

  then(resolve: (result: { data: unknown; error: unknown }) => void, reject?: (err: unknown) => void) {
    return this.execute().then(resolve, reject);
  }

  private applyFilters(rows: Row[]): Row[] {
    let result = rows;
    for (const f of this.filters) {
      result = result.filter(r => r[f.column] === f.value);
    }
    return result;
  }

  private getSelectedColumns(): string[] | null {
    if (!this.selectColumns || this.selectColumns.trim() === '*' || this.selectColumns.trim().length === 0) {
      return null;
    }

    return this.selectColumns
      .split(',')
      .map((column) => column.trim())
      .filter((column) => column.length > 0);
  }

  private projectRows<T extends Row>(rows: T[]): T[] {
    const selectedColumns = this.getSelectedColumns();
    if (!selectedColumns) return rows;

    return rows.map((row) => {
      const projected: Row = {};
      for (const column of selectedColumns) {
        projected[column] = row[column];
      }
      return projected as T;
    });
  }

  /** Resolve Supabase-style JSONB path like 'element_data->>id' */
  private resolveJsonPath(row: Row, path: string): unknown {
    const parts = path.split('->>');
    let val: unknown = row;
    for (const part of parts) {
      if (val == null) return undefined;
      if (typeof val !== 'object') return undefined;
      val = (val as Record<string, unknown>)[part.trim()];
    }
    return val;
  }

  private applyExtraFilters(rows: Row[]): Row[] {
    if (this.extraFilters.length === 0) return rows;
    let result = rows;
    for (const f of this.extraFilters) {
      result = result.filter(row => {
        const val = this.resolveJsonPath(row, f.path);
        switch (f.op) {
          case 'eq': return val === f.value;
          case 'neq': return val !== f.value;
          case 'gt': return isComparableValue(val) && isComparableValue(f.value) ? val > f.value : false;
          case 'lt': return isComparableValue(val) && isComparableValue(f.value) ? val < f.value : false;
          default: return true;
        }
      });
    }
    return result;
  }

  async execute(): Promise<{ data: unknown; error: unknown }> {
    try {
      // canvas_elements: use per-element storage for O(1) operations
      if (this.table === 'canvas_elements') {
        return await this.executeCanvasElements();
      }

      let rows = await getStore(this.table);

      switch (this.operation) {
        case 'select': {
          let result = this.applyFilters(rows);
          result = this.applyExtraFilters(result);
          if (this.orderBy) {
            const { column, ascending } = this.orderBy;
            result.sort((a, b) => {
              const aVal = a[column] ?? '';
              const bVal = b[column] ?? '';
              if (aVal < bVal) return ascending ? -1 : 1;
              if (aVal > bVal) return ascending ? 1 : -1;
              return 0;
            });
          }
          result = this.projectRows(result);
          if (this.isSingle) {
            if (result.length === 0) {
              return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
            }
            return { data: result[0], error: null };
          }
          return { data: result, error: null };
        }

        case 'insert': {
          const now = new Date().toISOString();
          const toInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
          const newRows = toInsert.map(item => ({
            id: item?.id || uuidv4(),
            created_at: now,
            updated_at: now,
            ...item,
          }));
          rows = [...rows, ...newRows];
          await setStore(this.table, rows);

          if (this.isSingle) {
            return { data: newRows[0], error: null };
          }
          return { data: newRows, error: null };
        }

        case 'update': {
          const now = new Date().toISOString();
          let updated: Row | null = null;
          rows = rows.map(row => {
            const matches = this.filters.every(f => row[f.column] === f.value);
            if (matches) {
              updated = { ...row, ...this.updateData, updated_at: now };
              return updated;
            }
            return row;
          });
          await setStore(this.table, rows);
          if (this.isSingle) {
            return { data: updated, error: null };
          }
          return { data: updated, error: null };
        }

        case 'delete': {
          rows = rows.filter(row => {
            return !this.filters.every(f => row[f.column] === f.value);
          });
          await setStore(this.table, rows);
          return { data: null, error: null };
        }

        default:
          return { data: null, error: { message: 'Unknown operation', code: 'LOCAL_DB_ERROR' } };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[local-db] ${this.operation} on "${this.table}" failed:`, msg);
      return { data: null, error: { message: msg, code: 'LOCAL_DB_ERROR' } };
    }
  }

  /**
   * Specialized execute() for canvas_elements — per-element IndexedDB storage.
   * Each element gets its own record keyed by project_id::element_data.id.
   * This makes insert/update/delete O(1) instead of O(n) full-table rewrite.
   */
  private async executeCanvasElements(): Promise<{ data: unknown; error: unknown }> {
    try {
      const now = new Date().toISOString();
      const projectFilter = this.filters.find(f => f.column === 'project_id');
      const projectId = typeof projectFilter?.value === 'string' ? projectFilter.value : undefined;

      // Extract element_data.id from extra filters (e.g. filter('element_data->>id', 'eq', val))
      const elementIdFilter = this.extraFilters.find(
        f => f.path === 'element_data->>id' && f.op === 'eq'
      );
      const elementDataId = typeof elementIdFilter?.value === 'string' ? elementIdFilter.value : undefined;

      switch (this.operation) {
        case 'select': {
          let rows: Row[];
          if (projectId) {
            rows = await getElementsByProject(projectId);
          } else {
            // Fallback: not expected in normal usage
            rows = [];
          }
          // Apply non-project_id eq filters
          for (const f of this.filters) {
            if (f.column === 'project_id') continue;
            rows = rows.filter(r => r[f.column] === f.value);
          }
          rows = this.applyExtraFilters(rows);

          if (this.orderBy) {
            const { column, ascending } = this.orderBy;
            rows.sort((a, b) => {
              const aVal = a[column] ?? '';
              const bVal = b[column] ?? '';
              if (aVal < bVal) return ascending ? -1 : 1;
              if (aVal > bVal) return ascending ? 1 : -1;
              return 0;
            });
          }
          rows = this.projectRows(rows);
          if (this.isSingle) {
            return rows.length === 0
              ? { data: null, error: { code: 'PGRST116', message: 'No rows found' } }
              : { data: rows[0], error: null };
          }
          return { data: rows, error: null };
        }

        case 'insert': {
          const toInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
          const newRows = toInsert.map(item => ({
            id: getRowElementId(item ?? {}) || uuidv4(),
            created_at: now,
            updated_at: now,
            ...item,
          }));
          await putElements(newRows);
          return { data: this.isSingle ? newRows[0] : newRows, error: null };
        }

        case 'update': {
          if (projectId && elementDataId) {
            // O(1) direct key update
            const db = await openDB();
            const key = makeElementKey(projectId, elementDataId);
            const existing = await new Promise<Row | null>((resolve) => {
              const tx = db.transaction('elements', 'readonly');
              const store = tx.objectStore('elements');
              const req = store.get(key);
              req.onsuccess = () => {
                const row = req.result;
                const storedRow = row as StoredRow | undefined;
                if (!storedRow) {
                  resolve(null);
                  return;
                }
                  resolve(stripStoredRow(storedRow));
              };
              req.onerror = () => resolve(null);
            });
            if (existing) {
              const updated = { ...existing, ...this.updateData, updated_at: now };
              await putElements([updated]);
              return { data: updated, error: null };
            }
            return { data: null, error: null };
          }
          // Fallback: load all for project and update matching
          const rows = projectId ? await getElementsByProject(projectId) : [];
          let updated: Row | null = null;
          const toUpdate: Row[] = [];
          for (const row of rows) {
            const matches = this.filters.every(f => row[f.column] === f.value);
            if (matches) {
              updated = { ...row, ...this.updateData, updated_at: now };
              toUpdate.push(updated);
            }
          }
          if (toUpdate.length > 0) await putElements(toUpdate);
          return { data: updated, error: null };
        }

        case 'delete': {
          if (projectId && elementDataId) {
            // O(1) delete by composite key
            await deleteElementByKey(projectId, elementDataId);
          } else if (projectId) {
            // Delete all elements for a project
            await deleteElementsByProject(projectId);
          }
          return { data: null, error: null };
        }

        default:
          return { data: null, error: { message: 'Unknown operation', code: 'LOCAL_DB_ERROR' } };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[local-db] canvas_elements ${this.operation} failed:`, msg);
      return { data: null, error: { message: msg, code: 'LOCAL_DB_ERROR' } };
    }
  }
}

// ── Chainable Proxy ───────────────────────────────────────────────

function createChainableQuery(table: string): ChainableQuery {
  const builder = new QueryBuilder(table);

  const handler: ProxyHandler<QueryBuilder> = {
    get(target, prop: string | symbol) {
      if (prop === 'then') {
        // Make it thenable — when awaited, execute and resolve with {data, error}
        return (resolve: (result: { data: unknown; error: unknown }) => void, reject?: (err: unknown) => void) => {
          target.execute().then(resolve, reject);
        };
      }

      const val = Reflect.get(target, prop);
      if (typeof val === 'function') {
        return (...args: unknown[]) => {
          const result = val.apply(target, args);
          if (result === target || result instanceof QueryBuilder) {
            return new Proxy(target, handler) as ChainableQuery;
          }
          // For .single() which now returns a Promise<{data, error}>
          return result;
        };
      }
      return val;
    }
  };

  return new Proxy(builder, handler) as ChainableQuery;
}

/**
 * Local database client that mimics Supabase client API.
 * Backed by IndexedDB for large-capacity persistence.
 */
export const localDb = {
  from(table: string) {
    return createChainableQuery(table);
  },
};

export type LocalDbClient = typeof localDb;

// ── 行级存储直接 API（绕过 QueryBuilder，用于高性能场景）──────────

import type { IElementStore } from './editor-kernel';

export const elementStore: IElementStore = {
  /** 按复合键读取单个元素 — O(1) */
  getByKey: getElementByKey,

  /** 部分字段投影 — 只返回指定字段 */
  getPartial: getElementPartial,

  /** 按项目读取全部元素 */
  getAllByProject: getElementsByProject,

  /** 批量读取指定 ID 的元素 — 单事务 */
  getByKeys: getElementsByKeys,

  /** 游标批量遍历 — 按 batchSize 分批回调，内存友好 */
  cursorByProject: getElementsByProjectCursor,

  /** 异步生成器逐条遍历 — for await (const row of ...) */
  iterateByProject: elementCursorIterator,

  /** 统计项目元素数量 — 不加载数据 */
  countByProject: countElementsByProject,

  /** 写入元素（upsert） */
  put: putElements,

  /** 删除单个元素 */
  deleteByKey: deleteElementByKey,

  /** 批量删除多个元素 — 单事务 */
  deleteByKeys: deleteElementsByKeys,

  /** 删除项目全部元素 */
  deleteByProject: deleteElementsByProject,

  /** 收集本地数据库中所有图片引用 */
  collectAllImageRefs,
};
