import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    STORYBOARD_PLANNER_STORAGE_KEY,
    getStoryboardPlannerStorageKey,
    loadStoryboardPlannerState,
    loadStoryboardPlannerStateWithLegacyMigration,
    patchStoryboardPlannerState,
    removeStoryboardPlannerState,
    saveStoryboardPlannerState,
    type PersistedStoryboardPlannerState,
} from './storyboard-planner-storage';

const state: PersistedStoryboardPlannerState = {
    mode: 'shot',
    shotCount: 9,
    sceneDescription: 'scene',
    storyContext: 'context',
    sourceImages: [{ content: 'imgref:1', label: 'image 1' }],
    combinedPrompt: 'prompt',
    result: null,
    generationImageUrl: null,
    pendingTaskId: null,
};

function createLocalStorageMock() {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    };
}

describe('storyboard-planner-storage', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'window', {
            value: {
                localStorage: createLocalStorageMock(),
            },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        window.localStorage.clear();
        Reflect.deleteProperty(globalThis, 'window');
    });

    it('loads, saves, patches, and removes per-element planner state', () => {
        const key = getStoryboardPlannerStorageKey('planner-1');

        expect(loadStoryboardPlannerState(key)).toEqual({});
        saveStoryboardPlannerState(key, state);
        expect(loadStoryboardPlannerState(key)).toMatchObject({ mode: 'shot', combinedPrompt: 'prompt' });

        patchStoryboardPlannerState(key, { pendingTaskId: 'task-1', isGeneratingBoardPending: true });
        expect(loadStoryboardPlannerState(key)).toMatchObject({
            combinedPrompt: 'prompt',
            pendingTaskId: 'task-1',
            isGeneratingBoardPending: true,
        });

        removeStoryboardPlannerState(key);
        expect(loadStoryboardPlannerState(key)).toEqual({});
    });

    it('migrates legacy global planner state once', () => {
        const key = getStoryboardPlannerStorageKey('planner-2');
        window.localStorage.setItem(STORYBOARD_PLANNER_STORAGE_KEY, JSON.stringify(state));

        expect(loadStoryboardPlannerStateWithLegacyMigration(key)).toMatchObject({ mode: 'shot' });
        expect(window.localStorage.getItem(STORYBOARD_PLANNER_STORAGE_KEY)).toBeNull();
    });

    it('returns an empty object for invalid JSON', () => {
        const key = getStoryboardPlannerStorageKey('planner-3');
        window.localStorage.setItem(key, '{bad json');

        expect(loadStoryboardPlannerState(key)).toEqual({});
    });
});
