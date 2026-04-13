export type CanvasToolPresetKey = 'crop-image' | 'annotate-image' | 'split-storyboard';

import { sanitizeNamedEntryName, writeNamedEntries, type NamedStorageEntry } from './named-storage';

const STORAGE_PREFIX = 'lovart.toolPreset.v1';

export type ToolPresetEntry<T> = NamedStorageEntry<T>;

function getStorageKey(key: CanvasToolPresetKey) {
  return `${STORAGE_PREFIX}.${key}`;
}

function sanitizePresetName(name: string) {
  return sanitizeNamedEntryName(name, '未命名预设');
}

function readPresetEntries<T>(key: CanvasToolPresetKey): ToolPresetEntry<T>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ToolPresetEntry<T>[] | T;

    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => !!item && typeof item === 'object')
        .map((item, index) => ({
          id: item.id || `${Date.now()}-${index}`,
          name: sanitizePresetName(item.name || `预设 ${index + 1}`),
          value: item.value,
          updatedAt: item.updatedAt || Date.now(),
        }));
    }

    return [{
      id: 'legacy-last',
      name: '上次使用',
      value: parsed as T,
      updatedAt: Date.now(),
    }];
  } catch {
    return [];
  }
}

function writePresetEntries<T>(key: CanvasToolPresetKey, entries: ToolPresetEntry<T>[]) {
  writeNamedEntries(getStorageKey(key), entries);
}

export function saveToolPreset<T>(key: CanvasToolPresetKey, value: T) {
  saveNamedToolPreset(key, '上次使用', value);
}

export function loadToolPreset<T>(key: CanvasToolPresetKey): Partial<T> | null {
  const entries = readPresetEntries<T>(key);
  return entries[0]?.value ? entries[0].value as Partial<T> : null;
}

export function listToolPresets<T>(key: CanvasToolPresetKey): ToolPresetEntry<T>[] {
  return readPresetEntries<T>(key).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveNamedToolPreset<T>(key: CanvasToolPresetKey, name: string, value: T) {
  const entries = readPresetEntries<T>(key).filter((item) => item.name !== sanitizePresetName(name));
  const nextEntries: ToolPresetEntry<T>[] = [{
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: sanitizePresetName(name),
    value,
    updatedAt: Date.now(),
  }, ...entries].slice(0, 12);
  writePresetEntries(key, nextEntries);
  return nextEntries;
}

export function deleteToolPreset(key: CanvasToolPresetKey, id: string) {
  const nextEntries = readPresetEntries(key).filter((item) => item.id !== id);
  writePresetEntries(key, nextEntries);
  return nextEntries;
}
