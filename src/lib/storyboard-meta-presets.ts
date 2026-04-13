import { deleteNamedEntry, readNamedEntries, saveNamedEntry, type NamedStorageEntry } from './named-storage';

const STORAGE_KEY = 'lovart.storyboardMeta.templates.v1';

export interface StoryboardMetaTemplateValue {
  storyboardSceneType?: string;
  storyboardCameraMove?: string;
  storyboardDuration?: string;
  storyboardNote?: string;
}

export type StoryboardMetaTemplateEntry = NamedStorageEntry<StoryboardMetaTemplateValue>;

function normalizeValue(value: StoryboardMetaTemplateValue): StoryboardMetaTemplateValue {
  const normalizeText = (input?: string) => {
    const trimmed = input?.trim();
    return trimmed ? trimmed : undefined;
  };

  return {
    storyboardSceneType: normalizeText(value.storyboardSceneType),
    storyboardCameraMove: normalizeText(value.storyboardCameraMove),
    storyboardDuration: normalizeText(value.storyboardDuration),
    storyboardNote: normalizeText(value.storyboardNote),
  };
}

export function listStoryboardMetaTemplates(): StoryboardMetaTemplateEntry[] {
  return readNamedEntries<StoryboardMetaTemplateValue>({
    storageKey: STORAGE_KEY,
    emptyName: '未命名分镜模板',
    itemLabel: '分镜模板',
    normalizeValue: (value) => normalizeValue(value || {}),
  });
}

export function saveStoryboardMetaTemplate(name: string, value: StoryboardMetaTemplateValue) {
  return saveNamedEntry<StoryboardMetaTemplateValue>(name, value, {
    storageKey: STORAGE_KEY,
    emptyName: '未命名分镜模板',
    itemLabel: '分镜模板',
    normalizeValue: (nextValue) => normalizeValue(nextValue || {}),
  });
}

export function deleteStoryboardMetaTemplate(id: string) {
  return deleteNamedEntry<StoryboardMetaTemplateValue>(id, {
    storageKey: STORAGE_KEY,
    emptyName: '未命名分镜模板',
    itemLabel: '分镜模板',
    normalizeValue: (value) => normalizeValue(value || {}),
  });
}
