/**
 * Storyboard export settings — persistence layer.
 *
 * Owns the default values, localStorage load/save, and key constant
 * for StoryboardExportOptions. Keeps StoryboardExportPanel free of
 * persistence concerns.
 */

import type { StoryboardExportOptions } from './storyboard-export';

export const EXPORT_SETTINGS_STORAGE_KEY = 'lovart.storyboardExport.settings.v1';

export const DEFAULT_EXPORT_OPTIONS: StoryboardExportOptions = {
  columns: 3,
  gap: 24,
  padding: 28,
  backgroundColor: '#ffffff',
  textColor: '#111827',
  showNumbers: true,
  captionMode: 'display-name',
  exportStyle: 'classic',
  lockCurrentOrder: false,
  showHeader: false,
  headerTitle: '',
  headerSubtitle: '',
};

/** Persistent fields written to / read from localStorage. */
const PERSISTED_FIELDS = [
  'columns', 'gap', 'padding',
  'backgroundColor', 'textColor',
  'showNumbers', 'captionMode', 'exportStyle',
  'lockCurrentOrder', 'showHeader', 'headerTitle', 'headerSubtitle',
] as const;

/**
 * Load export options from localStorage, merged with defaults.
 * `suggestedFileName` always comes from the caller, never from storage.
 */
export function loadStoryboardExportOptions(defaultFileName?: string): StoryboardExportOptions {
  const base: StoryboardExportOptions = {
    ...DEFAULT_EXPORT_OPTIONS,
    suggestedFileName: defaultFileName || '',
  };

  if (typeof window === 'undefined') return base;

  try {
    const raw = window.localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY);
    if (!raw) return base;

    const parsed = JSON.parse(raw) as Partial<StoryboardExportOptions>;
    return {
      ...base,
      ...parsed,
      suggestedFileName: defaultFileName || parsed.suggestedFileName || base.suggestedFileName || '',
    };
  } catch {
    return base;
  }
}

/** Persist the user-editable subset of export options to localStorage. */
export function persistStoryboardExportOptions(options: StoryboardExportOptions): void {
  if (typeof window === 'undefined') return;
  try {
    const subset: Record<string, unknown> = {};
    for (const key of PERSISTED_FIELDS) {
      subset[key] = options[key] ?? DEFAULT_EXPORT_OPTIONS[key];
    }
    window.localStorage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(subset));
  } catch {
    // ignore — quota or private browsing
  }
}
