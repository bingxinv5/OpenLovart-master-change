import { describe, expect, it } from 'vitest';
import { isEditableShortcutTarget } from './canvas-keyboard-shortcuts';

type FakeTarget = {
    tagName?: string | null;
    isContentEditable?: boolean;
    parentElement?: FakeTarget | null;
    getAttribute?: (name: string) => string | null;
};

function createTarget(overrides: Partial<FakeTarget> = {}): EventTarget {
    const base: FakeTarget = {
        tagName: null,
        isContentEditable: false,
        parentElement: null,
        getAttribute: () => null,
        ...overrides,
    };

    return base as EventTarget;
}

describe('isEditableShortcutTarget', () => {
    it('treats native text inputs as editable targets', () => {
        expect(isEditableShortcutTarget(createTarget({ tagName: 'input' }))).toBe(true);
        expect(isEditableShortcutTarget(createTarget({ tagName: 'textarea' }))).toBe(true);
        expect(isEditableShortcutTarget(createTarget({ tagName: 'select' }))).toBe(true);
    });

    it('treats contenteditable roots as editable targets', () => {
        expect(isEditableShortcutTarget(createTarget({ isContentEditable: true }))).toBe(true);
        expect(isEditableShortcutTarget(createTarget({
            getAttribute: (name) => (name === 'contenteditable' ? 'true' : null),
        }))).toBe(true);
    });

    it('treats descendants of editable containers as editable targets', () => {
        const editor = createTarget({ isContentEditable: true }) as FakeTarget;
        const chip = createTarget({
            tagName: 'span',
            getAttribute: (name) => (name === 'contenteditable' ? 'false' : null),
            parentElement: editor,
        });

        expect(isEditableShortcutTarget(chip)).toBe(true);
    });

    it('falls back to the active element when the event target is not editable', () => {
        const nonEditableTarget = createTarget({ tagName: 'div' });
        const activeEditor = createTarget({ isContentEditable: true });

        expect(isEditableShortcutTarget(nonEditableTarget, activeEditor)).toBe(true);
    });

    it('returns false for non-editable targets', () => {
        expect(isEditableShortcutTarget(createTarget({ tagName: 'div' }))).toBe(false);
    });
});