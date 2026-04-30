import type { StoryboardPlanMode, StoryboardPlanResponse } from '@/lib/ai-client';
import type { ImageGenerationDefaults } from '@/lib/generation-defaults';

export const STORYBOARD_PLANNER_STORAGE_KEY = 'lovart-storyboard-planner';
export const STORYBOARD_PLANNER_SAVE_DEBOUNCE_MS = 1500;

export type StoryboardPlannerSourceImage = { content: string; label: string };

export interface PersistedStoryboardPlannerState {
  mode: StoryboardPlanMode;
  shotCount: number;
  sceneDescription: string;
  storyContext: string;
  sourceImages: StoryboardPlannerSourceImage[];
  combinedPrompt: string;
  promptLang?: 'zh' | 'en';
  bilingualPrompt?: { zh?: string; en?: string };
  result: StoryboardPlanResponse | null;
  generationImageUrl: string | null;
  pendingTaskId: string | null;
  isPlanningPending?: boolean;
  isGeneratingBoardPending?: boolean;
  userModel?: ImageGenerationDefaults['model'];
  userModelOverride?: boolean;
  userAspectRatio?: 'auto' | ImageGenerationDefaults['aspectRatio'];
  userAspectRatioOverride?: boolean;
  userImageSize?: string;
  userImageSizeOverride?: boolean;
  userQuality?: ImageGenerationDefaults['quality'];
  userQualityOverride?: boolean;
}

function hasPlannerPayload(state: Partial<PersistedStoryboardPlannerState>) {
  return !!state.mode || !!state.result;
}

export function getStoryboardPlannerStorageKey(elementId: string) {
  return `${STORYBOARD_PLANNER_STORAGE_KEY}-${elementId}`;
}

export function loadStoryboardPlannerState(key: string): Partial<PersistedStoryboardPlannerState> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedStoryboardPlannerState>;
  } catch {
    return {};
  }
}

export function saveStoryboardPlannerState(key: string, state: PersistedStoryboardPlannerState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

export function patchStoryboardPlannerState(key: string, patch: Partial<PersistedStoryboardPlannerState>) {
  if (typeof window === 'undefined') return;

  try {
    const current = loadStoryboardPlannerState(key);
    window.localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

export function removeStoryboardPlannerState(key: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

export function loadStoryboardPlannerStateWithLegacyMigration(key: string) {
  const data = loadStoryboardPlannerState(key);
  if (hasPlannerPayload(data)) return data;

  const legacy = loadStoryboardPlannerState(STORYBOARD_PLANNER_STORAGE_KEY);
  if (hasPlannerPayload(legacy)) {
    removeStoryboardPlannerState(STORYBOARD_PLANNER_STORAGE_KEY);
    return legacy;
  }

  return data;
}
