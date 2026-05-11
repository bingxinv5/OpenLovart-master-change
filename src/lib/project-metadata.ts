'use client';

import { elementStore, type LocalDbClient, saveImage } from './editor-kernel';
import { getCachedVideoThumbnailDataUrl } from './video-load-state';

export type ProjectListMetadataRow = {
  id: string;
  thumbnail?: string | null;
  element_count?: number;
  project_stats_updated_at?: string;
  thumbnail_scan_completed_at?: string;
};

type CanvasElementProjectRow = {
  project_id: string;
  element_data?: {
    type?: string;
    hidden?: boolean;
    content?: string;
  };
};

export type ProjectMetadataHydrationResult = {
  projectId: string;
  elementCount: number;
  thumbnail: string | null;
  thumbnailScanCompletedAt: string;
};

export async function hydrateProjectMetadata(
  database: LocalDbClient,
  project: ProjectListMetadataRow,
): Promise<ProjectMetadataHydrationResult> {
  const now = new Date().toISOString();
  const elementCount = await elementStore.countByProject(project.id);
  let imageThumbnail: string | null = null;
  let firstVideoUrl: string | null = null;

  await elementStore.cursorByProject(project.id, 180, async (rows) => {
    for (const row of rows as CanvasElementProjectRow[]) {
      const element = row.element_data;
      if (!element || element.hidden || !element.content) continue;
      if (!imageThumbnail && element.type === 'image') {
        imageThumbnail = element.content;
        return false;
      }
      if (!firstVideoUrl && element.type === 'video') {
        firstVideoUrl = element.content;
      }
    }
    return true;
  });

  let nextThumbnail = project.thumbnail ?? null;
  if (!nextThumbnail) {
    if (imageThumbnail) {
      nextThumbnail = imageThumbnail;
    } else if (firstVideoUrl) {
      const thumbnailDataUrl = await getCachedVideoThumbnailDataUrl(firstVideoUrl);
      if (thumbnailDataUrl) {
        nextThumbnail = await saveImage(thumbnailDataUrl, `${project.id}-thumbnail`);
      }
    }
  }

  const payload = {
    element_count: elementCount,
    project_stats_updated_at: now,
    thumbnail_scan_completed_at: now,
    ...(nextThumbnail !== project.thumbnail ? { thumbnail: nextThumbnail } : {}),
  };

  await database.from('projects').update(payload).eq('id', project.id);

  return {
    projectId: project.id,
    elementCount,
    thumbnail: nextThumbnail,
    thumbnailScanCompletedAt: now,
  };
}

export function projectNeedsMetadataHydration(project: ProjectListMetadataRow): boolean {
  return typeof project.element_count !== 'number' || (!project.thumbnail && !project.thumbnail_scan_completed_at);
}
