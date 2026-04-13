import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from './history-manager';
import type { CanvasElementLike } from './history-manager';

type TestElement = CanvasElementLike & {
  x?: number;
  y?: number;
  content?: string;
  label?: string;
};

describe('HistoryManager', () => {
  let hm: HistoryManager;

  beforeEach(() => {
    hm = new HistoryManager({ maxPatches: 50 });
  });

  it('starts with no undo/redo', () => {
    const elements: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(elements);
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
  });

  it('records and undoes a simple field update', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 100 }];
    const recorded = hm.recordIncremental(v2, ['a']);
    expect(recorded).toBe(true);
    expect(hm.canUndo).toBe(true);

    const result = hm.undo(v2);
    expect(result).not.toBeNull();
    expect(result!.elements).toHaveLength(1);
    expect((result!.elements[0] as TestElement).x).toBe(0);
  });

  it('redo restores the change', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 100 }];
    hm.recordIncremental(v2, ['a']);
    const undone = hm.undo(v2)!;
    expect(hm.canRedo).toBe(true);

    const redone = hm.redo(undone.elements);
    expect(redone).not.toBeNull();
    expect((redone!.elements[0] as TestElement).x).toBe(100);
  });

  it('record detects element addition', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 0 }, { id: 'b', x: 50 }];
    hm.recordIncremental(v2, ['b']);
    expect(hm.canUndo).toBe(true);

    const result = hm.undo(v2);
    expect(result!.elements).toHaveLength(1);
    expect(result!.elements[0].id).toBe('a');
  });

  it('record detects element removal', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }, { id: 'b', x: 50 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 0 }];
    hm.recordIncremental(v2, ['b']);

    const result = hm.undo(v2);
    expect(result!.elements).toHaveLength(2);
    const ids = result!.elements.map((e) => e.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('handles large field (content) via ContentStore', () => {
    const bigContent = 'data:image/png;base64,' + 'A'.repeat(50000);
    const v1: TestElement[] = [{ id: 'a', content: bigContent }];
    hm.initialize(v1);

    const newContent = 'data:image/png;base64,' + 'B'.repeat(50000);
    const v2: TestElement[] = [{ id: 'a', content: newContent }];
    hm.recordIncremental(v2, ['a']);

    const result = hm.undo(v2);
    expect((result!.elements[0] as TestElement).content).toBe(bigContent);
  });

  it('new recording after undo discards redo stack', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 10 }];
    hm.recordIncremental(v2, ['a']);
    hm.undo(v2);
    expect(hm.canRedo).toBe(true);

    const v3: TestElement[] = [{ id: 'a', x: 99 }];
    hm.recordIncremental(v3, ['a']);
    expect(hm.canRedo).toBe(false);
  });

  it('respects maxPatches limit', () => {
    const hm2 = new HistoryManager({ maxPatches: 3 });
    const elements: TestElement[] = [{ id: 'a', x: 0 }];
    hm2.initialize(elements);
    for (let i = 1; i <= 5; i++) {
      const next: TestElement[] = [{ id: 'a', x: i * 10 }];
      hm2.recordIncremental(next, ['a']);
    }
    expect(hm2.stats.patchCount).toBe(3);
  });

  it('transaction groups multiple changes into one undo step', () => {
    const v1: TestElement[] = [
      { id: 'a', x: 0 },
      { id: 'b', x: 0 },
    ];
    hm.initialize(v1);

    hm.beginTransaction({ label: 'batch move' });
    hm.touchTransactionIds(['a', 'b']);
    const v2: TestElement[] = [
      { id: 'a', x: 100 },
      { id: 'b', x: 200 },
    ];
    hm.commitTransaction(v2);
    expect(hm.canUndo).toBe(true);

    const result = hm.undo(v2);
    expect((result!.elements[0] as TestElement).x).toBe(0);
    expect((result!.elements[1] as TestElement).x).toBe(0);
    // Should be single undo, not two
    expect(hm.canUndo).toBe(false);
  });

  it('cancelTransaction does not record', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    hm.beginTransaction();
    hm.touchTransactionIds(['a']);
    hm.cancelTransaction();
    expect(hm.canUndo).toBe(false);
    expect(hm.hasActiveTransaction).toBe(false);
  });

  it('timeline reflects history state', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    const v2: TestElement[] = [{ id: 'a', x: 10 }];
    hm.recordIncremental(v2, ['a'], { label: 'move' });
    const timeline = hm.timeline;
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[timeline.length - 1].label).toBe('move');
    expect(timeline[timeline.length - 1].active).toBe(true);
  });

  it('stats reports patch count and ContentStore size', () => {
    const v1: TestElement[] = [{ id: 'a', x: 0 }];
    hm.initialize(v1);
    hm.recordIncremental([{ id: 'a', x: 10 }] as TestElement[], ['a']);
    const stats = hm.stats;
    expect(stats.patchCount).toBe(1);
    expect(stats.currentIndex).toBe(0);
    expect(stats.contentStore).toBeDefined();
    expect(stats.contentStore.entries).toBeGreaterThanOrEqual(0);
  });
});
