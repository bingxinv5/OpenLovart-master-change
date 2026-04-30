import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { markCanvasLegacyMigrationApplied } from '@/components/lovart/canvas-types';
import { debugLog } from '@/lib/debug-log';
import {
    DirtyTracker,
    isImageRef,
    migrateElementsToImageStore,
    type LocalDbClient,
} from '@/lib/editor-kernel';
import { v4 as uuidv4 } from 'uuid';
import { loadCanvasSession } from './canvas-session-loader';
import { loadViewportState } from './viewport-persistence';
import {
    buildCanvasChunkManifest,
    createCanvasProject,
    saveExistingCanvasProject,
} from './project-storage';
import { deriveProjectThumbnail } from './canvas-media-utils';
import type { ChunkPreheatState } from './canvas-runtime-types';

type SearchParamsLike = {
    get(name: string): string | null;
    toString(): string;
};

type UserLike = {
    id: string;
} | null | undefined;

type NormalizeLoadedImageElements = (
    loadedElements: CanvasElement[],
    options?: {
        onProgress?: (elements: CanvasElement[], normalizedIds: string[]) => void;
    },
) => Promise<{ elements: CanvasElement[]; normalizedIds: string[] }>;

export interface UseCanvasProjectPersistenceParams {
    user: UserLike;
    database: LocalDbClient | null | undefined;
    projectId: string | null;
    currentProjectId: string | null;
    setCurrentProjectId: Dispatch<SetStateAction<string | null>>;
    currentProjectIdRef: MutableRefObject<string | null>;
    isInitializedRef: MutableRefObject<boolean>;
    migrationPendingRef: MutableRefObject<string[]>;
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    dirtyTrackerRef: MutableRefObject<DirtyTracker>;
    historyInitializedRef: MutableRefObject<boolean>;
    setElements: (updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => void;
    setScale: Dispatch<SetStateAction<number>>;
    setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    searchParams: SearchParamsLike;
    setInitialPrompt: Dispatch<SetStateAction<string | undefined>>;
    openChat: () => void;
    setChunkPreheat: Dispatch<SetStateAction<ChunkPreheatState>>;
    syncImageStoreCleanup: (currentElements: CanvasElement[]) => Promise<void> | void;
    normalizeLoadedImageElements: NormalizeLoadedImageElements;
    refreshStorageEstimate: () => Promise<unknown> | unknown;
}

export function useCanvasProjectPersistence({
    user,
    database,
    projectId,
    currentProjectId,
    setCurrentProjectId,
    currentProjectIdRef,
    isInitializedRef,
    migrationPendingRef,
    elementsMapRef,
    dirtyTrackerRef,
    historyInitializedRef,
    setElements,
    setScale,
    setPan,
    searchParams,
    setInitialPrompt,
    openChat,
    setChunkPreheat,
    syncImageStoreCleanup,
    normalizeLoadedImageElements,
    refreshStorageEstimate,
}: UseCanvasProjectPersistenceParams) {
    const [title, setTitle] = useState('未命名');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
    const [isLoading, setIsLoading] = useState(true);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSavingRef = useRef(false);
    const needsSaveRef = useRef(false);
    const hasLoadedRef = useRef(false);
    const existingThumbnailRef = useRef<string | null>(null);
    const titleDirtyRef = useRef(false);
    const lastSavedTitleRef = useRef(title);

    const clearScheduledSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
    }, []);

    const handleTitleChange = useCallback((nextTitle: string) => {
        setTitle(nextTitle);

        if (!isInitializedRef.current) {
            lastSavedTitleRef.current = nextTitle;
            titleDirtyRef.current = false;
            return;
        }

        const isDirty = nextTitle !== lastSavedTitleRef.current;
        titleDirtyRef.current = isDirty;

        if (isDirty) {
            setSaveStatus('saving');
        } else if (!dirtyTrackerRef.current.isDirty) {
            setSaveStatus('saved');
        }
    }, [dirtyTrackerRef, isInitializedRef]);

    const saveProject = useCallback(async () => {
        if (!user) {
            debugLog('Save skipped: No user logged in');
            setSaveStatus('offline');
            return;
        }

        if (!database) {
            debugLog('Save skipped: local database client not initialized yet');
            return;
        }

        if (isSavingRef.current) {
            needsSaveRef.current = true;
            return;
        }

        isSavingRef.current = true;
        const activeProjectId = currentProjectIdRef.current;
        const currentElements = Array.from(elementsMapRef.current.values());
        debugLog('Starting save...', { userId: user.id, projectId: activeProjectId, elementsCount: currentElements.length });

        try {
            setSaveStatus('saving');
            const saveRevision = dirtyTrackerRef.current.revision;
            const savedElementIds = currentElements.map((element) => element.id);
            const derivedThumbnail = await deriveProjectThumbnail(currentElements, uuidv4);
            const nextChunkSummary = buildCanvasChunkManifest(currentElements);
            const thumbnail = existingThumbnailRef.current ? undefined : derivedThumbnail;

            if (activeProjectId) {
                const changes = dirtyTrackerRef.current.getChanges();
                const elementMap = new Map(currentElements.map((element) => [element.id, element]));
                const addedElements = changes.addedIds
                    .map((id) => elementMap.get(id))
                    .filter((element): element is CanvasElement => !!element);
                const modifiedElements = changes.modifiedIds
                    .map((id) => elementMap.get(id))
                    .filter((element): element is CanvasElement => !!element);

                const totalChanges = changes.addedIds.length + changes.modifiedIds.length + changes.removedIds.length;
                debugLog(`Incremental save: ${changes.addedIds.length} added, ${changes.modifiedIds.length} modified, ${changes.removedIds.length} removed (total: ${totalChanges})`);

                await saveExistingCanvasProject({
                    database,
                    projectId: activeProjectId,
                    title,
                    thumbnail,
                    elementCount: currentElements.length,
                    addedElements,
                    modifiedElements,
                    removedIds: changes.removedIds,
                    chunkManifest: nextChunkSummary.manifest,
                    chunkStats: nextChunkSummary.stats,
                });

                if (!dirtyTrackerRef.current.markSavedIfUnchanged(saveRevision, savedElementIds)) {
                    needsSaveRef.current = true;
                }
            } else {
                const newProjectId = uuidv4();
                const uniqueElements = Array.from(new Map(currentElements.map((item) => [item.id, item])).values());

                await createCanvasProject({
                    database,
                    projectId: newProjectId,
                    title,
                    thumbnail,
                    elementCount: uniqueElements.length,
                    elements: uniqueElements,
                    chunkManifest: nextChunkSummary.manifest,
                    chunkStats: nextChunkSummary.stats,
                });

                currentProjectIdRef.current = newProjectId;
                setCurrentProjectId(newProjectId);
                const nextSearchParams = new URLSearchParams(searchParams.toString());
                nextSearchParams.set('id', newProjectId);
                window.history.pushState({}, '', `/canvas?${nextSearchParams.toString()}`);

                if (!dirtyTrackerRef.current.markSavedIfUnchanged(saveRevision, savedElementIds)) {
                    needsSaveRef.current = true;
                }
            }

            lastSavedTitleRef.current = title;
            titleDirtyRef.current = false;

            debugLog('Save successful!');
            void syncImageStoreCleanup(currentElements);
            void refreshStorageEstimate();
            setSaveStatus('saved');
        } catch (error: unknown) {
            console.warn('Save project issue:', error instanceof Error ? error.message : error);
            setSaveStatus('offline');
        } finally {
            isSavingRef.current = false;
            if (needsSaveRef.current) {
                needsSaveRef.current = false;
                void saveProject();
            }
        }
    }, [currentProjectIdRef, database, dirtyTrackerRef, elementsMapRef, refreshStorageEstimate, searchParams, setCurrentProjectId, syncImageStoreCleanup, title, user]);

    useEffect(() => {
        currentProjectIdRef.current = currentProjectId;
    }, [currentProjectId, currentProjectIdRef]);

    const loadProject = useCallback(async (id: string) => {
        if (!user) {
            debugLog('Load skipped: No user logged in');
            setIsLoading(false);
            return;
        }

        if (!database) {
            debugLog('Load skipped: local database client not initialized yet');
            return;
        }

        try {
            setIsLoading(true);
            setChunkPreheat({
                active: false,
                phase: 'idle',
                loadedChunks: 0,
                totalChunks: 0,
                loadedElements: 0,
                totalElements: 0,
            });
            debugLog('Loading project:', id);

            const snapshot = await loadCanvasSession({
                database,
                projectId: id,
                onChunkProgress: ({ chunk, loadedChunkCount, totalChunks, loadedElementCount, totalElementCount }) => {
                    setChunkPreheat({
                        active: true,
                        phase: loadedChunkCount < totalChunks ? 'preheating' : 'idle',
                        loadedChunks: loadedChunkCount,
                        totalChunks,
                        loadedElements: loadedElementCount,
                        totalElements: totalElementCount,
                        currentChunkLabel: chunk.label,
                    });
                },
            });

            if (!snapshot) {
                debugLog('Project not found in database, treating as new project');
                setIsLoading(false);
                isInitializedRef.current = true;
                return;
            }

            setTitle(snapshot.header.title);
            lastSavedTitleRef.current = snapshot.header.title;
            titleDirtyRef.current = false;
            existingThumbnailRef.current = snapshot.header.thumbnail;

            const uniqueElements = snapshot.elements;
            debugLog('Canvas elements loaded:', uniqueElements.length);

            if (uniqueElements.length > 0) {
                const pendingGens = snapshot.pendingGenerations;
                const pendingKeys = Object.keys(pendingGens);
                let restoredElements = uniqueElements;
                if (pendingKeys.length > 0) {
                    debugLog(`[GenPersist] Restoring ${pendingKeys.length} pending generation tasks from sessionStorage`);
                    restoredElements = uniqueElements.map((element) => {
                        const pending = pendingGens[element.id];
                        if (pending && !element.generatingTaskId) {
                            return {
                                ...element,
                                generatingTaskId: pending.taskId,
                                generatingTaskType: pending.taskType,
                                generatingProgress: pending.progress,
                            };
                        }
                        return element;
                    });
                    migrationPendingRef.current = Array.from(new Set([
                        ...migrationPendingRef.current,
                        ...pendingKeys.filter((elementId) => restoredElements.some((element) => element.id === elementId && element.generatingTaskId)),
                    ]));
                }

                const { elements: migratedElements, migratedCount } =
                    await migrateElementsToImageStore(restoredElements);
                const restoredElementById = new Map(restoredElements.map((element) => [element.id, element]));
                const imageStoreMigratedIds: string[] = [];
                const migratedElementsWithMarkers = migratedElements.map((element) => {
                    const previousElement = restoredElementById.get(element.id);
                    const wasImageStoreMigrated = element.type === 'image'
                        && previousElement?.content !== element.content
                        && isImageRef(element.content);
                    if (!wasImageStoreMigrated) {
                        return element;
                    }

                    imageStoreMigratedIds.push(element.id);
                    return markCanvasLegacyMigrationApplied(element);
                });
                setElements(migratedElementsWithMarkers);

                if (migratedCount > 0) {
                    migrationPendingRef.current = Array.from(new Set([
                        ...migrationPendingRef.current,
                        ...imageStoreMigratedIds,
                    ]));
                    if (migratedCount > 0) {
                        debugLog(`[Migration] ${migratedCount} images migrated, will persist on next save`);
                    }
                }

                void syncImageStoreCleanup(migratedElementsWithMarkers);

                void (async () => {
                    const { elements: normalizedElements, normalizedIds } =
                        await normalizeLoadedImageElements(migratedElementsWithMarkers, {
                            onProgress: (partialElements, partialIds) => {
                                migrationPendingRef.current = Array.from(new Set([
                                    ...migrationPendingRef.current,
                                    ...partialIds,
                                ]));

                                if (historyInitializedRef.current) {
                                    for (const id of partialIds) {
                                        dirtyTrackerRef.current.markModified(id);
                                    }
                                }

                                setElements(partialElements);
                            },
                        });

                    if (normalizedIds.length > 0) {
                        migrationPendingRef.current = Array.from(new Set([
                            ...migrationPendingRef.current,
                            ...normalizedIds,
                        ]));
                        if (historyInitializedRef.current) {
                            for (const id of normalizedIds) {
                                dirtyTrackerRef.current.markModified(id);
                            }
                        }
                        setElements(normalizedElements);
                        debugLog(`[Workbench] Corrected ${normalizedIds.length} legacy image placements on load`);
                    }

                    void syncImageStoreCleanup(normalizedElements);
                })();
            } else {
                debugLog('No canvas elements found for this project');
                setElements([]);
                void syncImageStoreCleanup([]);
            }
        } catch (error: unknown) {
            console.error('Failed to load project:', error);
        } finally {
            setChunkPreheat((prev) => ({
                ...prev,
                phase: 'idle',
                active: prev.totalChunks > 0 && prev.loadedChunks < prev.totalChunks,
            }));
            const savedViewport = loadViewportState(id);
            if (savedViewport) {
                setScale(savedViewport.scale);
                setPan({ x: savedViewport.panX, y: savedViewport.panY });
                debugLog(`[Viewport] Restored: scale=${savedViewport.scale.toFixed(2)}, pan=(${Math.round(savedViewport.panX)}, ${Math.round(savedViewport.panY)})`);
            }
            setIsLoading(false);
        }
    }, [database, dirtyTrackerRef, historyInitializedRef, isInitializedRef, migrationPendingRef, normalizeLoadedImageElements, setChunkPreheat, setElements, setPan, setScale, syncImageStoreCleanup, user]);

    useEffect(() => {
        if (projectId && user && database && !hasLoadedRef.current) {
            hasLoadedRef.current = true;
            void loadProject(projectId);
        } else if (!projectId) {
            setIsLoading(false);
            isInitializedRef.current = true;
            const nameParam = searchParams.get('name');
            if (nameParam) {
                setTitle(nameParam);
                lastSavedTitleRef.current = nameParam;
            } else {
                lastSavedTitleRef.current = '未命名';
            }
            titleDirtyRef.current = false;
        }

        const prompt = searchParams.get('prompt');
        if (prompt) {
            setInitialPrompt(prompt);
            openChat();
        }
    }, [database, isInitializedRef, loadProject, openChat, projectId, searchParams, setInitialPrompt, user]);

    useEffect(() => {
        if (!isLoading && !isInitializedRef.current && hasLoadedRef.current) {
            debugLog('Marking as initialized after load complete');
            isInitializedRef.current = true;
        }
    }, [isInitializedRef, isLoading]);

    return {
        title,
        setTitle,
        handleTitleChange,
        saveStatus,
        isLoading,
        titleDirtyRef,
        lastSavedTitleRef,
        existingThumbnailRef,
        clearScheduledSave,
        saveProject,
        loadProject,
    };
}