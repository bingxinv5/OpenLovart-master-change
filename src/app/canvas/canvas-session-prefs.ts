/**
 * canvas-session-prefs.ts — 画布会话偏好持久化
 *
 * 管理 chunk 固定状态和故事板预览面板偏好的 sessionStorage/localStorage 读写。
 */

import {
    CHUNK_PIN_STORAGE_KEY_PREFIX,
    STORYBOARD_OVERVIEW_PREFS_KEY_PREFIX,
    type StoryboardNavigationScope,
    type StoryboardAuditFilter,
    type StoryboardOverviewPrefs,
} from './canvas-runtime-types';
import type { CanvasElement } from '@/components/lovart/canvas-types';

// ── Chunk Pin Storage ────────────────────────────────────────

export function buildPinnedChunkStorageKey(projectId: string) {
    return `${CHUNK_PIN_STORAGE_KEY_PREFIX}${projectId}`;
}

export function loadPinnedChunkIds(projectId: string | null): string[] {
    if (!projectId || typeof window === 'undefined') return [];

    try {
        const raw = window.sessionStorage.getItem(buildPinnedChunkStorageKey(projectId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export function persistPinnedChunkIds(projectId: string | null, chunkIds: string[]) {
    if (!projectId || typeof window === 'undefined') return;

    try {
        const storageKey = buildPinnedChunkStorageKey(projectId);
        if (chunkIds.length === 0) {
            window.sessionStorage.removeItem(storageKey);
            return;
        }
        window.sessionStorage.setItem(storageKey, JSON.stringify(chunkIds));
    } catch {
        // Ignore storage quota / privacy mode failures.
    }
}

// ── Storyboard Overview Prefs ────────────────────────────────

export function buildStoryboardOverviewPrefsStorageKey(projectId: string) {
    return `${STORYBOARD_OVERVIEW_PREFS_KEY_PREFIX}${projectId}`;
}

export function loadStoryboardOverviewPrefs(projectId: string | null): StoryboardOverviewPrefs | null {
    if (!projectId || typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(buildStoryboardOverviewPrefsStorageKey(projectId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StoryboardOverviewPrefs>;

        const scope = parsed.autoAdvanceScope;
        const normalizedScope: StoryboardNavigationScope = scope === 'invalid' || scope === 'partial' || scope === 'untracked' || scope === 'issues'
            ? scope
            : 'issues';
        const filter = parsed.auditFilter;
        const normalizedFilter: StoryboardAuditFilter = filter === 'ready' || filter === 'partial' || filter === 'invalid' || filter === 'untracked' || filter === 'all'
            ? filter
            : 'all';

        return {
            collapsed: !!parsed.collapsed,
            autoAdvanceEnabled: !!parsed.autoAdvanceEnabled,
            autoAdvanceScope: normalizedScope,
            auditFilter: normalizedFilter,
        };
    } catch {
        return null;
    }
}

export function persistStoryboardOverviewPrefs(projectId: string | null, prefs: StoryboardOverviewPrefs) {
    if (!projectId || typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(buildStoryboardOverviewPrefsStorageKey(projectId), JSON.stringify(prefs));
    } catch {
        // Ignore storage quota / privacy mode failures.
    }
}

export function mapStoryboardFilterToScope(filter: StoryboardAuditFilter): StoryboardNavigationScope {
    if (filter === 'invalid') return 'invalid';
    if (filter === 'partial') return 'partial';
    if (filter === 'untracked') return 'untracked';
    return 'issues';
}

// ── Element Chunk Resolution ─────────────────────────────────

export function resolveElementChunkId(element: Pick<CanvasElement, 'id' | 'type' | 'parentFrameId'>, byId: Map<string, Pick<CanvasElement, 'id' | 'type' | 'parentFrameId'>>) {
    let cursorId: string | undefined = element.parentFrameId;
    let topFrameId: string | undefined;
    const visited = new Set<string>();

    while (cursorId && !visited.has(cursorId)) {
        visited.add(cursorId);
        const parent = byId.get(cursorId);
        if (!parent) break;
        topFrameId = parent.id;
        cursorId = parent.parentFrameId;
    }

    if (!topFrameId && element.type === 'frame' && !element.parentFrameId) {
        topFrameId = element.id;
    }

    return topFrameId ? `frame:${topFrameId}` : 'root';
}
