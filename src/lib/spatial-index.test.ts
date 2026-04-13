import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIndex } from './spatial-index';

describe('SpatialIndex', () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  it('starts empty', () => {
    expect(index.size).toBe(0);
    expect(index.has('x')).toBe(false);
  });

  it('load indexes all elements', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 200, width: 50, height: 50 },
    ]);
    expect(index.size).toBe(2);
    expect(index.has('a')).toBe(true);
    expect(index.has('b')).toBe(true);
  });

  it('search returns intersecting elements', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 200, width: 50, height: 50 },
      { id: 'c', x: 50, y: 50, width: 20, height: 20 },
    ]);

    // Query overlapping 'a' and 'c' but not 'b'
    const result = index.search({ minX: 10, minY: 10, maxX: 80, maxY: 80 });
    expect(result).toContain('a');
    expect(result).toContain('c');
    expect(result).not.toContain('b');
  });

  it('search returns empty for non-intersecting region', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    ]);
    const result = index.search({ minX: 500, minY: 500, maxX: 600, maxY: 600 });
    expect(result).toEqual([]);
  });

  it('insert adds a new element', () => {
    index.insert({ id: 'x', x: 10, y: 10, width: 30, height: 30 });
    expect(index.size).toBe(1);
    expect(index.has('x')).toBe(true);
    const result = index.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 });
    expect(result).toContain('x');
  });

  it('insert replaces existing element with same ID', () => {
    index.insert({ id: 'x', x: 0, y: 0, width: 10, height: 10 });
    index.insert({ id: 'x', x: 500, y: 500, width: 10, height: 10 });
    expect(index.size).toBe(1);
    // Should NOT be found at old position
    const oldPos = index.search({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
    expect(oldPos).not.toContain('x');
    // Should be found at new position
    const newPos = index.search({ minX: 490, minY: 490, maxX: 520, maxY: 520 });
    expect(newPos).toContain('x');
  });

  it('remove deletes an element', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    ]);
    index.remove('a');
    expect(index.size).toBe(0);
    expect(index.has('a')).toBe(false);
  });

  it('remove is safe for non-existent ID', () => {
    index.remove('nonexistent');
    expect(index.size).toBe(0);
  });

  it('update moves an element', () => {
    index.insert({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
    index.update({ id: 'a', x: 1000, y: 1000, width: 10, height: 10 });
    const oldPos = index.search({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
    expect(oldPos).not.toContain('a');
    const newPos = index.search({ minX: 990, minY: 990, maxX: 1020, maxY: 1020 });
    expect(newPos).toContain('a');
  });

  it('batchUpdate handles multiple elements', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', x: 0, y: 0, width: 10, height: 10 },
    ]);
    index.batchUpdate([
      { id: 'a', x: 100, y: 100, width: 10, height: 10 },
      { id: 'b', x: 200, y: 200, width: 10, height: 10 },
    ]);
    expect(index.size).toBe(2);
    const result = index.search({ minX: 90, minY: 90, maxX: 120, maxY: 120 });
    expect(result).toContain('a');
    expect(result).not.toContain('b');
  });

  it('searchNearby expands the search region by margin', () => {
    index.insert({ id: 'a', x: 100, y: 100, width: 10, height: 10 });
    // Exact bbox does not overlap
    const noMatch = index.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 });
    expect(noMatch).not.toContain('a');
    // Nearby with large margin should find it
    const match = index.searchNearby({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, 60);
    expect(match).toContain('a');
  });

  it('clear empties the index', () => {
    index.load([
      { id: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', x: 50, y: 50, width: 10, height: 10 },
    ]);
    index.clear();
    expect(index.size).toBe(0);
  });

  it('handles elements without width/height (points)', () => {
    index.insert({ id: 'p', x: 50, y: 50 });
    expect(index.has('p')).toBe(true);
    // A point at (50,50) should be found when bbox includes it
    const result = index.search({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
    expect(result).toContain('p');
  });
});
