import { describe, it, expect } from 'vitest';

/**
 * Editor-kernel boundary smoke tests.
 *
 * Verifies that every contract type and every re-exported runtime
 * symbol is reachable from the single editor-kernel entry point.
 * Consumers should never need to reach past this module.
 */

// ── Contract types ───────────────────────────────────────────
import type {
  IHistoryManager,
  IDirtyTracker,
  ISpatialIndex,
} from './editor-kernel';

// ── Runtime implementations ──────────────────────────────────
import {
  HistoryManager,
  DirtyTracker,
  SpatialIndex,
  imageStore,
  elementStore,
  localDb,
} from './editor-kernel';

// ── Image-store free functions ───────────────────────────────
import {
  IMAGE_REF_PREFIX,
  isImageRef,
  getRefId,
  makeRef,
} from './editor-kernel';

describe('editor-kernel re-exports', () => {
  it('exposes HistoryManager class', () => {
    expect(HistoryManager).toBeDefined();
    const hm = new HistoryManager();
    expect(typeof hm.initialize).toBe('function');
    expect(typeof hm.record).toBe('function');
    expect(typeof hm.undo).toBe('function');
    expect(typeof hm.redo).toBe('function');
  });

  it('exposes DirtyTracker class', () => {
    expect(DirtyTracker).toBeDefined();
    const dt = new DirtyTracker();
    expect(typeof dt.initialize).toBe('function');
    expect(typeof dt.markModified).toBe('function');
    expect(typeof dt.getChanges).toBe('function');
  });

  it('exposes SpatialIndex class', () => {
    expect(SpatialIndex).toBeDefined();
    const si = new SpatialIndex();
    expect(typeof si.load).toBe('function');
    expect(typeof si.search).toBe('function');
    expect(si.size).toBe(0);
  });

  it('exposes image-store ref utilities', () => {
    expect(IMAGE_REF_PREFIX).toBe('imgref://');
    expect(isImageRef('imgref://abc')).toBe(true);
    expect(isImageRef('https://example.com')).toBe(false);
    expect(getRefId('imgref://test-id')).toBe('test-id');
    expect(makeRef('my-id')).toBe('imgref://my-id');
  });

  it('exposes imageStore singleton with IImageStore shape', () => {
    expect(imageStore).toBeDefined();
    expect(typeof imageStore.isImageRef).toBe('function');
    expect(typeof imageStore.saveImage).toBe('function');
    expect(typeof imageStore.getImageBlobUrl).toBe('function');
    expect(typeof imageStore.deleteImage).toBe('function');
  });

  it('exposes elementStore singleton with IElementStore shape', () => {
    expect(elementStore).toBeDefined();
    expect(typeof elementStore.getByKey).toBe('function');
    expect(typeof elementStore.getAllByProject).toBe('function');
    expect(typeof elementStore.put).toBe('function');
    expect(typeof elementStore.deleteByKey).toBe('function');
  });

  it('exposes localDb query builder', () => {
    expect(localDb).toBeDefined();
    expect(typeof localDb.from).toBe('function');
  });

  it('HistoryManager satisfies IHistoryManager contract', () => {
    const hm = new HistoryManager();
    // verify contract methods exist
    const contractMethods: (keyof IHistoryManager)[] = [
      'initialize', 'record', 'recordIncremental',
      'undo', 'redo',
      'beginTransaction', 'touchTransactionIds', 'commitTransaction', 'cancelTransaction',
    ];
    for (const method of contractMethods) {
      expect(typeof (hm as IHistoryManager)[method]).toBe('function');
    }
    // verify contract getters
    expect(typeof hm.canUndo).toBe('boolean');
    expect(typeof hm.canRedo).toBe('boolean');
    expect(typeof hm.hasActiveTransaction).toBe('boolean');
  });

  it('DirtyTracker satisfies IDirtyTracker contract', () => {
    const dt = new DirtyTracker();
    const contractMethods: (keyof IDirtyTracker)[] = [
      'initialize', 'markModified', 'markAdded', 'markRemoved',
      'diffAndMark', 'getChanges', 'markSaved', 'markSavedIfUnchanged', 'reset',
    ];
    for (const method of contractMethods) {
      expect(typeof (dt as IDirtyTracker)[method]).toBe('function');
    }
    expect(typeof dt.isDirty).toBe('boolean');
    expect(typeof dt.revision).toBe('number');
  });

  it('SpatialIndex satisfies ISpatialIndex contract', () => {
    const si = new SpatialIndex();
    const contractMethods: (keyof ISpatialIndex)[] = [
      'load', 'insert', 'remove', 'update', 'batchUpdate',
      'search', 'searchNearby', 'has', 'clear',
    ];
    for (const method of contractMethods) {
      expect(typeof (si as ISpatialIndex)[method]).toBe('function');
    }
    expect(typeof si.size).toBe('number');
  });
});
