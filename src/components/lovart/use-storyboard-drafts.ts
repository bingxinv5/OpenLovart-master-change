import { useCallback, useState } from 'react';
import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';
import {
    getInitialStoryboardDraft,
    type StoryboardDraftKey,
    type StoryboardDraftValue,
} from './layers-panel-utils';

interface UseStoryboardDraftsOptions {
    onRenameElement: (id: string, attrs: Partial<CanvasElement>) => void;
}

export function useStoryboardDrafts({ onRenameElement }: UseStoryboardDraftsOptions) {
    const [storyboardDrafts, setStoryboardDrafts] = useState<Record<string, StoryboardDraftValue>>({});

    const getStoryboardDraft = useCallback((element: CanvasElement) => {
        const draft = storyboardDrafts[element.id];
        return draft || getInitialStoryboardDraft(element);
    }, [storyboardDrafts]);

    const updateStoryboardDraft = useCallback((
        id: string,
        key: StoryboardDraftKey,
        value: string,
        element: CanvasElement,
    ) => {
        setStoryboardDrafts((prev) => ({
            ...prev,
            [id]: {
                ...getStoryboardDraft(element),
                ...prev[id],
                [key]: value,
            },
        }));
    }, [getStoryboardDraft]);

    const commitStoryboardDraft = useCallback((id: string, element: CanvasElement) => {
        const draft = storyboardDrafts[id];
        if (!draft) return;

        const normalizeValue = (value: string) => {
            const nextValue = value.trim();
            return nextValue ? nextValue : undefined;
        };

        const nextAttrs: Partial<CanvasElement> = {};
        const nextShotCode = normalizeValue(draft.storyboardShotCode);
        const nextSceneType = normalizeValue(draft.storyboardSceneType);
        const nextCameraMove = normalizeValue(draft.storyboardCameraMove);
        const nextDuration = normalizeValue(draft.storyboardDuration);
        const nextNote = normalizeValue(draft.storyboardNote);

        if (validateStoryboardShotCode(nextShotCode) || validateStoryboardDuration(nextDuration)) {
            return;
        }

        if ((element.storyboardShotCode || undefined) !== nextShotCode) nextAttrs.storyboardShotCode = nextShotCode;
        if ((element.storyboardSceneType || undefined) !== nextSceneType) nextAttrs.storyboardSceneType = nextSceneType;
        if ((element.storyboardCameraMove || undefined) !== nextCameraMove) nextAttrs.storyboardCameraMove = nextCameraMove;
        if ((element.storyboardDuration || undefined) !== nextDuration) nextAttrs.storyboardDuration = nextDuration;
        if ((element.storyboardNote || undefined) !== nextNote) nextAttrs.storyboardNote = nextNote;

        if (Object.keys(nextAttrs).length > 0) {
            onRenameElement(id, nextAttrs);
        }

        setStoryboardDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, [onRenameElement, storyboardDrafts]);

    const resetStoryboardDraft = useCallback((id: string) => {
        setStoryboardDrafts((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    return {
        getStoryboardDraft,
        updateStoryboardDraft,
        commitStoryboardDraft,
        resetStoryboardDraft,
    };
}