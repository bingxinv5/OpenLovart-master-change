import { IDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'lovart_local_db';

function createLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

function installFakeIndexedDb(localStorage = createLocalStorage({ lovart_db_migrated: '1' })) {
  vi.stubGlobal('window', { indexedDB: fakeIndexedDB, localStorage });
  vi.stubGlobal('indexedDB', fakeIndexedDB);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('localStorage', localStorage);
  return localStorage;
}

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database deletion was blocked'));
  });
}

function seedVersion2Projects(projects: Array<Record<string, unknown>>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('tables');
      const elements = db.createObjectStore('elements', { keyPath: '_key' });
      elements.createIndex('by_project', 'project_id', { unique: false });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('tables', 'readwrite');
      tx.objectStore('tables').put(projects, 'projects');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  vi.resetModules();
  await deleteTestDatabase();
});

describe('local-db read failures', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    await deleteTestDatabase();
  });

  it('returns an explicit query error instead of treating an IndexedDB failure as an empty table', async () => {
    const request: {
      error?: Error;
      onerror?: () => void;
    } = {};
    const indexedDbMock = {
      open: vi.fn(() => {
        queueMicrotask(() => {
          request.error = Object.assign(new Error('IndexedDB unavailable'), { name: 'UnknownError' });
          request.onerror?.();
        });
        return request;
      }),
    };
    const localStorageMock = {
      getItem: vi.fn(() => '1'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', { indexedDB: indexedDbMock, localStorage: localStorageMock });
    vi.stubGlobal('indexedDB', indexedDbMock);
    vi.stubGlobal('localStorage', localStorageMock);

    const { localDb } = await import('./local-db');
    const result = await localDb.from('projects').select('*');

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      code: 'LOCAL_DB_ERROR',
      message: 'IndexedDB unavailable',
    });
  });

  it('atomically migrates legacy v2 project arrays into independent records', async () => {
    const projects = [
      { id: 'project-a', title: 'A', updated_at: '2026-08-01T00:00:00.000Z' },
      { id: 'project-b', title: 'B', updated_at: '2026-08-02T00:00:00.000Z' },
    ];
    await seedVersion2Projects(projects);
    installFakeIndexedDb();

    const { localDb } = await import('./local-db');
    const result = await localDb.from('projects').select('*').order('updated_at', { ascending: true });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(projects);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = fakeIndexedDB.open(DB_NAME, 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const legacyRows = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('tables', 'readonly');
      const request = tx.objectStore('tables').get('projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(db.objectStoreNames.contains('projects')).toBe(true);
    expect(legacyRows).toBeUndefined();
    db.close();
  });

  it('preserves concurrent inserts instead of replacing a stale project array', async () => {
    installFakeIndexedDb();
    const { localDb } = await import('./local-db');

    const [first, second] = await Promise.all([
      localDb.from('projects').insert({ id: 'project-a', title: 'A' }),
      localDb.from('projects').insert({ id: 'project-b', title: 'B' }),
    ]);
    const result = await localDb.from('projects').select('*');

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((result.data as Array<{ id: string }>).map((row) => row.id).sort()).toEqual(['project-a', 'project-b']);
  });

  it('merges concurrent patches to one project in serialized transactions', async () => {
    installFakeIndexedDb();
    const { localDb } = await import('./local-db');
    await localDb.from('projects').insert({
      id: 'project-a',
      title: 'Original',
      thumbnail: null,
    });

    const [rename, cover] = await Promise.all([
      localDb.from('projects').update({ title: 'Renamed' }).eq('id', 'project-a'),
      localDb.from('projects').update({ thumbnail: 'imgref://cover' }).eq('id', 'project-a'),
    ]);
    const result = await localDb.from('projects').select('*').eq('id', 'project-a').single();

    expect(rename.error).toBeNull();
    expect(cover.error).toBeNull();
    expect(result.data).toMatchObject({
      id: 'project-a',
      title: 'Renamed',
      thumbnail: 'imgref://cover',
    });
  });

  it('deletes one project without affecting a concurrent update to another', async () => {
    installFakeIndexedDb();
    const { localDb } = await import('./local-db');
    await localDb.from('projects').insert([
      { id: 'project-a', title: 'A' },
      { id: 'project-b', title: 'B' },
    ]);

    const [deleted, updated] = await Promise.all([
      localDb.from('projects').delete().eq('id', 'project-a'),
      localDb.from('projects').update({ title: 'B updated' }).eq('id', 'project-b'),
    ]);
    const result = await localDb.from('projects').select('*');

    expect(deleted.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({ id: 'project-b', title: 'B updated' }),
    ]);
  });

  it('migrates localStorage projects without overwriting a newer IndexedDB row', async () => {
    await seedVersion2Projects([
      { id: 'project-a', title: 'Newer', updated_at: '2026-08-03T00:00:00.000Z' },
    ]);
    const localStorage = installFakeIndexedDb(createLocalStorage({
      lovart_db_projects: JSON.stringify([
        { id: 'project-a', title: 'Older', updated_at: '2026-08-01T00:00:00.000Z' },
        { id: 'project-b', title: 'Recovered', updated_at: '2026-08-02T00:00:00.000Z' },
      ]),
    }));

    const { localDb } = await import('./local-db');
    const result = await localDb.from('projects').select('*');
    const rows = result.data as Array<{ id: string; title: string }>;

    expect(rows.find((row) => row.id === 'project-a')?.title).toBe('Newer');
    expect(rows.find((row) => row.id === 'project-b')?.title).toBe('Recovered');
    expect(localStorage.removeItem).toHaveBeenCalledWith('lovart_db_projects');
    expect(localStorage.setItem).toHaveBeenCalledWith('lovart_db_migrated', '1');
  });
});
