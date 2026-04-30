import { describe, it, expect, beforeEach } from 'vitest';
import { DirtyTracker } from './dirty-tracker';

describe('DirtyTracker', () => {
  let tracker: DirtyTracker;

  beforeEach(() => {
    tracker = new DirtyTracker();
    tracker.initialize(['a', 'b', 'c']);
  });

  it('starts clean after initialize', () => {
    expect(tracker.isDirty).toBe(false);
    expect(tracker.revision).toBe(0);
    expect(tracker.stats.total).toBe(0);
  });

  it('tracks added elements', () => {
    tracker.markAdded('d');
    expect(tracker.isDirty).toBe(true);
    const changes = tracker.getChanges();
    expect(changes.addedIds).toEqual(['d']);
    expect(changes.modifiedIds).toEqual([]);
    expect(changes.removedIds).toEqual([]);
  });

  it('tracks modified elements', () => {
    tracker.markModified('b');
    expect(tracker.isDirty).toBe(true);
    const changes = tracker.getChanges();
    expect(changes.modifiedIds).toEqual(['b']);
  });

  it('tracks removed elements', () => {
    tracker.markRemoved('a');
    expect(tracker.isDirty).toBe(true);
    const changes = tracker.getChanges();
    expect(changes.removedIds).toEqual(['a']);
  });

  it('add then remove cancels out (never in DB)', () => {
    tracker.markAdded('x');
    tracker.markRemoved('x');
    expect(tracker.isDirty).toBe(false);
    const changes = tracker.getChanges();
    expect(changes.addedIds).toEqual([]);
    expect(changes.removedIds).toEqual([]);
  });

  it('remove then add (undo) → marks as modified for saved element', () => {
    tracker.markRemoved('a');
    tracker.markAdded('a');
    const changes = tracker.getChanges();
    expect(changes.removedIds).toEqual([]);
    expect(changes.modifiedIds).toEqual(['a']);
  });

  it('remove then add (undo) → marks as added for unsaved element', () => {
    tracker.markAdded('x');
    tracker.markRemoved('x'); // cancels
    tracker.markAdded('x');   // re-add, never saved
    const changes = tracker.getChanges();
    expect(changes.addedIds).toEqual(['x']);
  });

  it('does not duplicate modified for already-added element', () => {
    tracker.markAdded('x');
    tracker.markModified('x');
    const changes = tracker.getChanges();
    expect(changes.addedIds).toEqual(['x']);
    expect(changes.modifiedIds).toEqual([]);
  });

  it('revision increments on each change', () => {
    expect(tracker.revision).toBe(0);
    tracker.markAdded('x');
    expect(tracker.revision).toBe(1);
    tracker.markModified('a');
    expect(tracker.revision).toBe(2);
    tracker.markRemoved('b');
    expect(tracker.revision).toBe(3);
  });

  it('markSaved resets dirty state', () => {
    tracker.markAdded('d');
    tracker.markModified('a');
    tracker.markRemoved('c');
    tracker.markSaved(['a', 'b', 'd']);
    expect(tracker.isDirty).toBe(false);
    expect(tracker.revision).toBe(0);
  });

  it('markSavedIfUnchanged succeeds at matching revision', () => {
    tracker.markModified('a');
    const rev = tracker.revision;
    const ok = tracker.markSavedIfUnchanged(rev, ['a', 'b', 'c']);
    expect(ok).toBe(true);
    expect(tracker.isDirty).toBe(false);
  });

  it('markSavedIfUnchanged fails at stale revision', () => {
    tracker.markModified('a');
    const rev = tracker.revision;
    tracker.markModified('b'); // bumps revision
    const ok = tracker.markSavedIfUnchanged(rev, ['a', 'b', 'c']);
    expect(ok).toBe(false);
    expect(tracker.isDirty).toBe(true);
  });

  it('diffAndMark detects added, modified, and removed', () => {
    // 'a' → same ref won't work because we create new objects in both arrays
    // Let me use the same ref for 'a'
    const aRef = { id: 'a' };
    const old2 = [aRef, { id: 'b' }, { id: 'c' }];
    const new2 = [aRef, { id: 'b' }, { id: 'd' }];

    tracker.diffAndMark(old2, new2);
    const changes = tracker.getChanges();
    expect(changes.modifiedIds).toContain('b'); // different object ref
    expect(changes.addedIds).toContain('d');
    expect(changes.removedIds).toContain('c');
  });

  it('stats reflect current state', () => {
    tracker.markAdded('x');
    tracker.markAdded('y');
    tracker.markModified('a');
    tracker.markRemoved('c');
    expect(tracker.stats).toEqual({
      added: 2,
      modified: 1,
      removed: 1,
      total: 4,
    });
  });

  it('reset clears everything', () => {
    tracker.markAdded('x');
    tracker.markModified('a');
    tracker.reset();
    expect(tracker.isDirty).toBe(false);
    expect(tracker.revision).toBe(0);
  });
});
