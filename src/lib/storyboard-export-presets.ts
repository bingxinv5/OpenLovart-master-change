import type { StoryboardExportOptions } from './storyboard-export';
import { deleteNamedEntry, readNamedEntries, saveNamedEntry, type NamedStorageEntry } from './named-storage';

const STORAGE_KEY = 'lovart.storyboardExport.templates.v1';

export type StoryboardExportTemplateEntry = NamedStorageEntry<Partial<StoryboardExportOptions>>;

function normalizeTemplateValue(value: Partial<StoryboardExportOptions>): Partial<StoryboardExportOptions> {
  return {
    columns: value.columns,
    gap: value.gap,
    padding: value.padding,
    backgroundColor: value.backgroundColor,
    textColor: value.textColor,
    showNumbers: value.showNumbers,
    captionMode: value.captionMode,
    exportStyle: value.exportStyle,
    lockCurrentOrder: value.lockCurrentOrder,
    showHeader: value.showHeader,
    headerTitle: value.headerTitle,
    headerSubtitle: value.headerSubtitle,
  };
}

export function listStoryboardExportTemplates(): StoryboardExportTemplateEntry[] {
  return readNamedEntries<Partial<StoryboardExportOptions>>({
    storageKey: STORAGE_KEY,
    emptyName: '未命名模板',
    itemLabel: '模板',
    normalizeValue: (value) => normalizeTemplateValue(value || {}),
  });
}

export function saveStoryboardExportTemplate(name: string, value: Partial<StoryboardExportOptions>) {
  return saveNamedEntry<Partial<StoryboardExportOptions>>(name, value, {
    storageKey: STORAGE_KEY,
    emptyName: '未命名模板',
    itemLabel: '模板',
    normalizeValue: (nextValue) => normalizeTemplateValue(nextValue || {}),
  });
}

export function deleteStoryboardExportTemplate(id: string) {
  return deleteNamedEntry<Partial<StoryboardExportOptions>>(id, {
    storageKey: STORAGE_KEY,
    emptyName: '未命名模板',
    itemLabel: '模板',
    normalizeValue: (value) => normalizeTemplateValue(value || {}),
  });
}
