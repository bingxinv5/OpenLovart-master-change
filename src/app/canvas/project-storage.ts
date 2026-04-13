import { elementStore, type LocalDbClient, cleanupUnusedImages } from '@/lib/editor-kernel';
import { clearProjectGenerations, clearProjectSubmissions } from './generation-persistence';
import { clearViewportState } from './viewport-persistence';

const LARGE_PROJECT_CURSOR_THRESHOLD = 1200;

type DatabaseError = {
  message?: string;
  code?: string;
} | null;

type DatabaseResponse<T> = {
  data: T;
  error: DatabaseError;
};

export type CanvasProjectRow = {
  id: string;
  title?: string;
  thumbnail?: string | null;
  updated_at?: string;
  element_count?: number;
  project_stats_updated_at?: string;
  canvas_chunk_manifest?: CanvasChunkManifestEntry[];
  canvas_chunk_stats?: CanvasChunkStats;
};

type CanvasElementRow<TElement> = {
  project_id: string;
  element_data: TElement;
};

export type CanvasChunkManifestEntry = {
  id: string;
  label: string;
  elementIds: string[];
  elementCount: number;
  topFrameId?: string;
};

export type CanvasChunkStats = {
  chunkCount: number;
  largestChunkSize: number;
  rootElementCount: number;
};

export function buildCanvasChunkManifest<TElement extends { id: string; type?: string; parentFrameId?: string; frameName?: string; groupFrame?: boolean }>(
  elements: TElement[],
): { manifest: CanvasChunkManifestEntry[]; stats: CanvasChunkStats } {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const chunkMap = new Map<string, TElement[]>();

  const resolveTopFrame = (element: TElement) => {
    let cursor = element.parentFrameId;
    let topFrame: TElement | undefined;
    const visited = new Set<string>();

    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = byId.get(cursor);
      if (!parent) break;
      topFrame = parent;
      cursor = parent.parentFrameId;
    }

    if (!topFrame && element.type === 'frame' && !element.parentFrameId) {
      topFrame = element;
    }

    return topFrame;
  };

  elements.forEach((element) => {
    const topFrame = resolveTopFrame(element);
    const chunkId = topFrame ? `frame:${topFrame.id}` : 'root';
    const bucket = chunkMap.get(chunkId) || [];
    bucket.push(element);
    chunkMap.set(chunkId, bucket);
  });

  const manifest = Array.from(chunkMap.entries())
    .map(([id, chunkElements]) => {
      const frameId = id.startsWith('frame:') ? id.slice('frame:'.length) : undefined;
      const topFrame = frameId ? byId.get(frameId) : undefined;
      return {
        id,
        label: topFrame
          ? topFrame.frameName?.trim() || (topFrame.groupFrame ? '编组块' : '画板块')
          : '根层级块',
        elementIds: chunkElements.map((element) => element.id),
        elementCount: chunkElements.length,
        topFrameId: frameId,
      } satisfies CanvasChunkManifestEntry;
    })
    .sort((a, b) => b.elementCount - a.elementCount);

  return {
    manifest,
    stats: {
      chunkCount: manifest.length,
      largestChunkSize: manifest[0]?.elementCount ?? 0,
      rootElementCount: manifest.find((entry) => entry.id === 'root')?.elementCount ?? 0,
    },
  };
}

function getDatabaseErrorMessage(error: DatabaseError, label: string): string {
  if (!error) return `Database operation failed: ${label}`;
  return error.message || error.code || `Database operation failed: ${label}`;
}

async function runDatabaseOperation<T>(
  label: string,
  operation: Promise<DatabaseResponse<T>>,
): Promise<T> {
  const result = await operation;
  if (result.error) {
    const message = getDatabaseErrorMessage(result.error, label);
    console.error(`DB error [${label}]:`, message, result.error);
    throw new Error(message);
  }
  return result.data;
}

export async function saveExistingCanvasProject<TElement extends { id: string }>(params: {
  database: LocalDbClient;
  projectId: string;
  title: string;
  thumbnail?: string | null;
  elementCount?: number;
  addedElements: TElement[];
  modifiedElements: TElement[];
  removedIds: string[];
  chunkManifest?: CanvasChunkManifestEntry[];
  chunkStats?: CanvasChunkStats;
}) {
  const { database, projectId, title, thumbnail, elementCount, addedElements, modifiedElements, removedIds, chunkManifest, chunkStats } = params;

  const updatePayload: Record<string, unknown> = {
    title,
    updated_at: new Date().toISOString(),
  };
  // Only update thumbnail if explicitly provided (not undefined)
  // This preserves user-set custom covers when canvas auto-saves
  if (thumbnail !== undefined) {
    updatePayload.thumbnail = thumbnail;
  }
  if (elementCount !== undefined) {
    updatePayload.element_count = elementCount;
    updatePayload.project_stats_updated_at = new Date().toISOString();
  }
  if (chunkManifest !== undefined) {
    updatePayload.canvas_chunk_manifest = chunkManifest;
  }
  if (chunkStats !== undefined) {
    updatePayload.canvas_chunk_stats = chunkStats;
  }

  await runDatabaseOperation(
    'update-project',
    database
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId),
  );

  if (removedIds.length > 0) {
    await elementStore.deleteByKeys(projectId, removedIds);
  }

  const changedElements = [...addedElements, ...modifiedElements];
  if (changedElements.length > 0) {
    await elementStore.put(
      changedElements.map((element) => ({
        project_id: projectId,
        element_data: element,
      })),
    );
  }
}

export async function createCanvasProject<TElement extends { id: string }>(params: {
  database: LocalDbClient;
  projectId: string;
  title: string;
  thumbnail?: string | null;
  elementCount?: number;
  elements: TElement[];
  chunkManifest?: CanvasChunkManifestEntry[];
  chunkStats?: CanvasChunkStats;
}) {
  const { database, projectId, title, thumbnail, elementCount, elements, chunkManifest, chunkStats } = params;

  await runDatabaseOperation(
    'create-project',
    database.from('projects').insert({
      id: projectId,
      title,
      thumbnail: thumbnail ?? null,
      element_count: elementCount ?? elements.length,
      project_stats_updated_at: new Date().toISOString(),
      canvas_chunk_manifest: chunkManifest ?? [],
      canvas_chunk_stats: chunkStats,
    }),
  );

  if (elements.length > 0) {
    await elementStore.put(
      elements.map((element) => ({
        project_id: projectId,
        element_data: element,
      })),
    );
  }
}

export async function duplicateCanvasProject(params: {
  database: LocalDbClient;
  sourceProjectId: string;
  newProjectId: string;
  newTitle: string;
  thumbnail?: string | null;
}) {
  const { database, sourceProjectId, newProjectId, newTitle, thumbnail } = params;
  const now = new Date().toISOString();
  const sourceProject = await loadCanvasProjectHeader(database, sourceProjectId);
  const elementCount = sourceProject?.element_count ?? await elementStore.countByProject(sourceProjectId);

  await runDatabaseOperation(
    'duplicate-project-create',
    database.from('projects').insert({
      id: newProjectId,
      title: newTitle,
      thumbnail: thumbnail ?? sourceProject?.thumbnail ?? null,
      created_at: now,
      updated_at: now,
      element_count: elementCount,
      project_stats_updated_at: now,
      thumbnail_scan_completed_at: thumbnail ?? sourceProject?.thumbnail ? now : undefined,
      canvas_chunk_manifest: sourceProject?.canvas_chunk_manifest ?? [],
      canvas_chunk_stats: sourceProject?.canvas_chunk_stats,
    }),
  );

  await elementStore.cursorByProject(sourceProjectId, 180, async (rows) => {
    const duplicatedRows = rows.map((row) => ({
      ...row,
      project_id: newProjectId,
    }));
    await elementStore.put(duplicatedRows);
  });
}

export async function deleteCanvasProjects(params: {
  database: LocalDbClient;
  projectIds: string[];
}) {
  const { database, projectIds } = params;
  const uniqueProjectIds = Array.from(new Set(projectIds.filter(Boolean)));

  for (const projectId of uniqueProjectIds) {
    await elementStore.deleteByProject(projectId);
    await runDatabaseOperation(
      'delete-project',
      database.from('projects').delete().eq('id', projectId),
    );
    clearViewportState(projectId);
    clearProjectGenerations(projectId);
    clearProjectSubmissions(projectId);
  }

  const remainingRefs = await elementStore.collectAllImageRefs();
  await cleanupUnusedImages(remainingRefs);
}

export async function loadCanvasProjectBundle<TElement>(
  database: LocalDbClient,
  projectId: string,
): Promise<{
  project: CanvasProjectRow | null;
  canvasRows: Array<CanvasElementRow<TElement>>;
}> {
  const projectResult = await (
    database
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single() as Promise<DatabaseResponse<CanvasProjectRow | null>>
  );

  if (projectResult.error) {
    if (projectResult.error.code === 'PGRST116') {
      return {
        project: null,
        canvasRows: [],
      };
    }

    throw new Error(getDatabaseErrorMessage(projectResult.error, 'load-project'));
  }

  const canvasRows: Array<CanvasElementRow<TElement>> = [];
  const totalElements = await elementStore.countByProject(projectId);
  if (totalElements >= LARGE_PROJECT_CURSOR_THRESHOLD) {
    await elementStore.cursorByProject(projectId, 240, (rows) => {
      canvasRows.push(...rows as Array<CanvasElementRow<TElement>>);
    });
  } else {
    canvasRows.push(...await elementStore.getAllByProject(projectId) as Array<CanvasElementRow<TElement>>);
  }

  return {
    project: projectResult.data,
    canvasRows,
  };
}

export async function loadCanvasProjectHeader(
  database: LocalDbClient,
  projectId: string,
): Promise<CanvasProjectRow | null> {
  const projectResult = await (
    database
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single() as Promise<DatabaseResponse<CanvasProjectRow | null>>
  );

  if (projectResult.error) {
    if (projectResult.error.code === 'PGRST116') {
      return null;
    }

    throw new Error(getDatabaseErrorMessage(projectResult.error, 'load-project-header'));
  }

  return projectResult.data;
}

export function getChunkLoadOrder(manifest: CanvasChunkManifestEntry[]): CanvasChunkManifestEntry[] {
  const rootChunk = manifest.find((entry) => entry.id === 'root');
  const nonRootChunks = manifest.filter((entry) => entry.id !== 'root');
  return [
    ...(rootChunk ? [rootChunk] : []),
    ...nonRootChunks,
  ];
}

export async function loadCanvasProjectRowsByManifest<TElement>(
  projectId: string,
  manifest: CanvasChunkManifestEntry[],
  onChunkLoaded?: (detail: {
    chunk: CanvasChunkManifestEntry;
    loadedChunkCount: number;
    totalChunks: number;
    loadedElementCount: number;
    totalElementCount: number;
  }) => void,
): Promise<Array<CanvasElementRow<TElement>>> {
  const orderedManifest = getChunkLoadOrder(manifest);
  const totalElementCount = orderedManifest.reduce((sum, chunk) => sum + chunk.elementCount, 0);
  const rows: Array<CanvasElementRow<TElement>> = [];
  let loadedChunkCount = 0;
  let loadedElementCount = 0;

  for (const chunk of orderedManifest) {
    const chunkRows = await elementStore.getByKeys(projectId, chunk.elementIds) as Array<CanvasElementRow<TElement>>;
    rows.push(...chunkRows);
    loadedChunkCount += 1;
    loadedElementCount += chunkRows.length;
    onChunkLoaded?.({
      chunk,
      loadedChunkCount,
      totalChunks: orderedManifest.length,
      loadedElementCount,
      totalElementCount,
    });
  }

  return rows;
}

export function dedupeCanvasElements<TElement extends { id: string }>(
  rows: Array<CanvasElementRow<TElement>>,
): TElement[] {
  const loadedElements = rows.map((row) => row.element_data);
  return Array.from(new Map(loadedElements.map((item) => [item.id, item])).values());
}
