export interface NamedStorageEntry<T> {
  id: string;
  name: string;
  value: T;
  updatedAt: number;
}

interface NamedStorageOptions<T> {
  storageKey: string;
  emptyName: string;
  itemLabel: string;
  normalizeValue: (value: T) => T;
}

export function sanitizeNamedEntryName(name: string, emptyName: string) {
  const trimmed = name.trim();
  if (!trimmed) return emptyName;
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

export function readNamedEntries<T>(options: NamedStorageOptions<T>): NamedStorageEntry<T>[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(options.storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as NamedStorageEntry<T>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => !!item && typeof item === 'object')
      .map((item, index) => ({
        id: item.id || `${Date.now()}-${index}`,
        name: sanitizeNamedEntryName(item.name || `${options.itemLabel} ${index + 1}`, options.emptyName),
        value: options.normalizeValue(item.value),
        updatedAt: item.updatedAt || Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function writeNamedEntries<T>(storageKey: string, entries: NamedStorageEntry<T>[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export function saveNamedEntry<T>(name: string, value: T, options: NamedStorageOptions<T>): NamedStorageEntry<T>[] {
  const normalizedName = sanitizeNamedEntryName(name, options.emptyName);
  const nextEntries: NamedStorageEntry<T>[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: normalizedName,
      value: options.normalizeValue(value),
      updatedAt: Date.now(),
    },
    ...readNamedEntries(options).filter((item) => item.name !== normalizedName),
  ].slice(0, 12);

  writeNamedEntries(options.storageKey, nextEntries);
  return nextEntries;
}

export function deleteNamedEntry<T>(id: string, options: NamedStorageOptions<T>): NamedStorageEntry<T>[] {
  const nextEntries = readNamedEntries(options).filter((item) => item.id !== id);
  writeNamedEntries(options.storageKey, nextEntries);
  return nextEntries;
}