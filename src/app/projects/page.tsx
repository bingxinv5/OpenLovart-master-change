'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense, useMemo } from 'react';
import { Plus, X, Search, Clock3, Star, LayoutGrid, History, Sparkles, ArrowUpDown, Trash2, CheckSquare } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@/lib/mock-clerk';
import { ProjectCard } from '@/components/lovart/ProjectCard';
import { ApiSettingsButton } from '@/components/lovart/ApiSettingsDialog';
import { useLocalDb } from '@/hooks/useLocalDb';
import { saveImage } from '@/lib/editor-kernel';
import { hydrateProjectMetadata, projectNeedsMetadataHydration } from '@/lib/project-metadata';
import { useRouter, useSearchParams } from 'next/navigation';
import { deleteCanvasProjects, duplicateCanvasProject } from '../canvas/project-storage';

interface Project {
    id: string;
    title: string;
    thumbnail: string | null;
    updated_at: string;
    created_at?: string;
    element_count?: number;
    project_stats_updated_at?: string;
    thumbnail_scan_completed_at?: string;
}

const FAVORITE_PROJECTS_KEY = 'lovart.favoriteProjectIds';
const RECENT_PROJECTS_KEY = 'lovart.recentProjectIds';
const PROJECTS_PAGE_BATCH_SIZE = 60;

type SortMode = 'updated' | 'name' | 'created';

function pickProjectToKeep(projects: Array<Project & { elementCount: number }>) {
    return [...projects].sort((a, b) => {
        if (b.elementCount !== a.elementCount) return b.elementCount - a.elementCount;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
}

function stripElementCount(project: Project & { elementCount: number }): Project {
    const nextProject = { ...project };
    delete (nextProject as Project & { elementCount?: number }).elementCount;
    return nextProject;
}

function waitForIdle(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();

    return new Promise((resolve) => {
        const win = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        };

        if (typeof win.requestIdleCallback === 'function') {
            win.requestIdleCallback(() => resolve(), { timeout: 800 });
            return;
        }

        window.setTimeout(resolve, 32);
    });
}

function ProjectsContent() {
    const { user } = useUser();
    const database = useLocalDb();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [favoriteProjectIds, setFavoriteProjectIds] = useState<string[]>([]);
    const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
    const [activeFilter, setActiveFilter] = useState<'all' | 'favorites' | 'recent'>('all');
    const [sortMode, setSortMode] = useState<SortMode>('updated');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [metadataRefreshingIds, setMetadataRefreshingIds] = useState<string[]>([]);
    const [visibleProjectCount, setVisibleProjectCount] = useState(PROJECTS_PAGE_BATCH_SIZE);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
    const metadataHydratingIdsRef = useRef<Set<string>>(new Set());

    // Batch selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const isBatchMode = selectedIds.size > 0;

    // New project dialog
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const newProjectInputRef = useRef<HTMLInputElement>(null);

    // Delete confirmation dialog
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

    // Cover image upload
    const coverInputRef = useRef<HTMLInputElement>(null);
    const [coverTargetId, setCoverTargetId] = useState<string | null>(null);

    // Close sort menu on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setShowSortMenu(false);
            }
        }
        if (showSortMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showSortMenu]);

    // Auto-open new project dialog from ?new=1
    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setShowNewDialog(true);
            window.history.replaceState({}, '', '/projects');
        }
    }, [searchParams]);

    // Load user's projects
    const loadProjects = useCallback(async () => {
        if (!user || !database) {
            setIsLoading(false);
            return;
        }

        try {
            const { data, error } = await database
                .from('projects')
                .select('id,title,thumbnail,updated_at,created_at,element_count,project_stats_updated_at,thumbnail_scan_completed_at')
                .order('updated_at', { ascending: false });
            if (error) throw error;

            const projectsData = (data || []) as Project[];

            const projectsWithCounts = projectsData.map((p) => ({
                ...p,
                thumbnail: p.thumbnail || null,
                elementCount: typeof p.element_count === 'number' ? p.element_count : -1,
            }));

            const groupedByTitle = new Map<string, Array<Project & { elementCount: number }>>();
            for (const project of projectsWithCounts) {
                const key = (project.title || '未命名').trim();
                const group = groupedByTitle.get(key) || [];
                group.push(project);
                groupedByTitle.set(key, group);
            }

            const duplicateIdsToDelete: string[] = [];
            const filteredProjects: Project[] = [];

            for (const group of groupedByTitle.values()) {
                if (group.length === 1) { filteredProjects.push(stripElementCount(group[0])); continue; }
                const keepProject = pickProjectToKeep(group);
                const cleanupCandidates = group.filter((p) => p.id !== keepProject.id && p.elementCount === 0);
                if (cleanupCandidates.length === group.length - 1) { duplicateIdsToDelete.push(...cleanupCandidates.map((p) => p.id)); }
                filteredProjects.push(stripElementCount(keepProject));
            }

            if (duplicateIdsToDelete.length > 0) {
                await deleteCanvasProjects({ database, projectIds: duplicateIdsToDelete });
            }

            filteredProjects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

            setProjects(filteredProjects);
        } catch (error) {
            console.error('Failed to load projects:', error);
        } finally {
            setIsLoading(false);
        }
    }, [database, user]);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    useEffect(() => {
        if (!database || projects.length === 0) return;

        let cancelled = false;
        const candidates = projects.filter(projectNeedsMetadataHydration).slice(0, 18);
        if (candidates.length === 0) return;

        const run = async () => {
            for (const project of candidates) {
                if (cancelled) break;
                if (metadataHydratingIdsRef.current.has(project.id)) continue;

                metadataHydratingIdsRef.current.add(project.id);
                setMetadataRefreshingIds((prev) => prev.includes(project.id) ? prev : [...prev, project.id]);

                try {
                    const hydrated = await hydrateProjectMetadata(database, project);
                    if (cancelled) break;

                    setProjects((prev) => prev.map((item) => item.id === hydrated.projectId ? {
                        ...item,
                        element_count: hydrated.elementCount,
                        thumbnail: item.thumbnail || hydrated.thumbnail,
                        project_stats_updated_at: hydrated.thumbnailScanCompletedAt,
                        thumbnail_scan_completed_at: hydrated.thumbnailScanCompletedAt,
                    } : item));
                } catch (error) {
                    console.warn('Failed to hydrate project metadata:', project.id, error);
                } finally {
                    metadataHydratingIdsRef.current.delete(project.id);
                    setMetadataRefreshingIds((prev) => prev.filter((id) => id !== project.id));
                }

                await waitForIdle();
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [database, projects]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const fav = JSON.parse(window.localStorage.getItem(FAVORITE_PROJECTS_KEY) || '[]');
            const rec = JSON.parse(window.localStorage.getItem(RECENT_PROJECTS_KEY) || '[]');
            setFavoriteProjectIds(Array.isArray(fav) ? fav : []);
            setRecentProjectIds(Array.isArray(rec) ? rec : []);
        } catch { setFavoriteProjectIds([]); setRecentProjectIds([]); }
    }, []);

    const persistFavoriteProjectIds = useCallback((nextIds: string[]) => {
        setFavoriteProjectIds(nextIds);
        if (typeof window !== 'undefined') window.localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(nextIds));
    }, []);

    const persistRecentProjectIds = useCallback((nextIds: string[]) => {
        setRecentProjectIds(nextIds);
        if (typeof window !== 'undefined') window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(nextIds));
    }, []);

    const handleOpenProject = useCallback((projectId: string) => {
        if (isBatchMode) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
                return next;
            });
            return;
        }
        const nextRecentIds = [projectId, ...recentProjectIds.filter((id) => id !== projectId)].slice(0, 12);
        persistRecentProjectIds(nextRecentIds);
        router.push(`/canvas?id=${projectId}`);
    }, [persistRecentProjectIds, recentProjectIds, router, isBatchMode]);

    const handleToggleFavorite = useCallback((projectId: string) => {
        const exists = favoriteProjectIds.includes(projectId);
        persistFavoriteProjectIds(exists ? favoriteProjectIds.filter((id) => id !== projectId) : [projectId, ...favoriteProjectIds]);
    }, [favoriteProjectIds, persistFavoriteProjectIds]);

    // --- Clean up deleted project IDs from recent & favorites ---
    const cleanupDeletedIds = useCallback((deletedIds: string[]) => {
        const deletedSet = new Set(deletedIds);
        const newFavs = favoriteProjectIds.filter((id) => !deletedSet.has(id));
        const newRecent = recentProjectIds.filter((id) => !deletedSet.has(id));
        if (newFavs.length !== favoriteProjectIds.length) persistFavoriteProjectIds(newFavs);
        if (newRecent.length !== recentProjectIds.length) persistRecentProjectIds(newRecent);
    }, [favoriteProjectIds, recentProjectIds, persistFavoriteProjectIds, persistRecentProjectIds]);

    const sortedProjects = useMemo(() => {
        const list = [...projects];
        if (sortMode === 'name') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        else if (sortMode === 'created') list.sort((a, b) => a.id.localeCompare(b.id)); // UUID v4 not time-based, fall back to insertion order (reverse)
        // default 'updated' — already sorted by updated_at desc from load
        return list;
    }, [projects, sortMode]);

    const filteredProjects = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();
        let result = sortedProjects;
        if (activeFilter === 'favorites') result = result.filter((p) => favoriteProjectIds.includes(p.id));
        else if (activeFilter === 'recent') result = result.filter((p) => recentProjectIds.includes(p.id));
        if (!keyword) return result;
        return result.filter((p) => (p.title || '未命名').toLowerCase().includes(keyword));
    }, [sortedProjects, searchQuery, activeFilter, favoriteProjectIds, recentProjectIds]);

    const limitedFilteredProjects = useMemo(
        () => filteredProjects.slice(0, visibleProjectCount),
        [filteredProjects, visibleProjectCount],
    );

    const favoriteProjects = useMemo(() => {
        const m = new Map(projects.map((p) => [p.id, p]));
        return favoriteProjectIds.map((id) => m.get(id)).filter((p): p is Project => !!p);
    }, [projects, favoriteProjectIds]);

    const projectIdSet = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);

    const groupedProjects = useMemo(() => {
        if (sortMode !== 'updated') return [{ key: 'all', title: '全部', items: limitedFilteredProjects }].filter((g) => g.items.length > 0);
        const now = Date.now();
        const oneDay = 86400000;
        const oneWeek = 7 * oneDay;
        const buckets = { today: [] as Project[], week: [] as Project[], earlier: [] as Project[] };
        limitedFilteredProjects.forEach((p) => {
            const age = now - new Date(p.updated_at).getTime();
            if (age <= oneDay) buckets.today.push(p);
            else if (age <= oneWeek) buckets.week.push(p);
            else buckets.earlier.push(p);
        });
        return [
            { key: 'today', title: '今天更新', items: buckets.today },
            { key: 'week', title: '最近 7 天', items: buckets.week },
            { key: 'earlier', title: '更早之前', items: buckets.earlier },
        ].filter((g) => g.items.length > 0);
    }, [limitedFilteredProjects, sortMode]);

    useEffect(() => {
        setVisibleProjectCount(PROJECTS_PAGE_BATCH_SIZE);
    }, [searchQuery, activeFilter, sortMode]);

    useEffect(() => {
        const node = loadMoreSentinelRef.current;
        if (!node) return;
        if (filteredProjects.length <= visibleProjectCount) return;

        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (!entry?.isIntersecting) return;
            setVisibleProjectCount((prev) => Math.min(prev + PROJECTS_PAGE_BATCH_SIZE, filteredProjects.length));
        }, {
            rootMargin: '320px 0px',
            threshold: 0,
        });

        observer.observe(node);
        return () => observer.disconnect();
    }, [filteredProjects.length, visibleProjectCount]);

    const recentProjectsCount = useMemo(() => {
        const now = Date.now();
        return projects.filter((p) => { const t = new Date(p.updated_at).getTime(); return Number.isFinite(t) && now - t <= 86400000; }).length;
    }, [projects]);

    const recentVisibleCount = useMemo(
        () => recentProjectIds.filter((id) => projectIdSet.has(id)).length,
        [projectIdSet, recentProjectIds],
    );

    useEffect(() => {
        if (showNewDialog && newProjectInputRef.current) setTimeout(() => newProjectInputRef.current?.focus(), 100);
    }, [showNewDialog]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const diffInMs = Date.now() - date.getTime();
        const diffInMins = Math.floor(diffInMs / 60000);
        const diffInHours = Math.floor(diffInMs / 3600000);
        const diffInDays = Math.floor(diffInMs / 86400000);
        if (diffInMins < 1) return '刚刚';
        if (diffInMins < 60) return `${diffInMins}分钟前`;
        if (diffInHours < 24) return `${diffInHours}小时前`;
        if (diffInDays < 7) return `${diffInDays}天前`;
        return date.toLocaleDateString('zh-CN');
    };

    // Create new project
    const generateUUID = (): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
    };
    const [isCreating, setIsCreating] = useState(false);
    const handleCreateProject = async () => {
        if (!database || isCreating) return;
        const name = newProjectName.trim() || '未命名';
        setIsCreating(true);
        try {
            const newId = generateUUID();
            const now = new Date().toISOString();
            const { error } = await database.from('projects').insert({
                id: newId,
                title: name,
                thumbnail: null,
                updated_at: now,
                created_at: now,
                element_count: 0,
                project_stats_updated_at: now,
                thumbnail_scan_completed_at: now,
            });
            if (error) throw error;
            setProjects((prev) => [{ id: newId, title: name, thumbnail: null, updated_at: now, created_at: now, element_count: 0, project_stats_updated_at: now, thumbnail_scan_completed_at: now }, ...prev]);
            setShowNewDialog(false);
            setNewProjectName('');
        } catch (error) { console.error('Failed to create project:', error); }
        finally { setIsCreating(false); }
    };

    // Rename
    const handleRenameProject = async (id: string, newTitle: string) => {
        if (!database) return;
        try {
            const { error } = await database.from('projects').update({ title: newTitle }).eq('id', id);
            if (error) throw error;
            setProjects((prev) => prev.map((p) => p.id === id ? { ...p, title: newTitle, updated_at: new Date().toISOString() } : p));
        } catch (error) { console.error('Failed to rename project:', error); }
    };

    // Delete single
    const handleDeleteProject = async () => {
        if (!database || !deleteTarget) return;
        const id = deleteTarget.id;
        try {
            await deleteCanvasProjects({ database, projectIds: [id] });
            setProjects((prev) => prev.filter((p) => p.id !== id));
            cleanupDeletedIds([id]);
        } catch (error) { console.error('Failed to delete project:', error); }
        finally { setDeleteTarget(null); }
    };

    // Delete batch
    const handleBatchDelete = async () => {
        if (!database || selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await deleteCanvasProjects({ database, projectIds: ids });
            setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
            cleanupDeletedIds(ids);
            setSelectedIds(new Set());
        } catch (error) { console.error('Failed to batch delete:', error); }
        finally { setShowBatchDeleteConfirm(false); }
    };

    // Duplicate project
    const handleDuplicateProject = async (id: string) => {
        if (!database) return;
        const source = projects.find((p) => p.id === id);
        if (!source) return;
        try {
            const newId = generateUUID();
            const now = new Date().toISOString();
            const newTitle = `${source.title} (副本)`;
            await duplicateCanvasProject({
                database,
                sourceProjectId: id,
                newProjectId: newId,
                newTitle,
                thumbnail: source.thumbnail,
            });
            setProjects((prev) => [{
                id: newId,
                title: newTitle,
                thumbnail: source.thumbnail,
                updated_at: now,
                created_at: now,
                element_count: typeof source.element_count === 'number' ? source.element_count : 0,
                project_stats_updated_at: now,
                thumbnail_scan_completed_at: source.thumbnail ? now : undefined,
            }, ...prev]);
        } catch (error) { console.error('Failed to duplicate project:', error); }
    };

    // Set custom cover image
    const handleSetCover = (id: string) => {
        setCoverTargetId(id);
        coverInputRef.current?.click();
    };

    const handleClearCover = async (id: string) => {
        if (!database) return;
        try {
            const { error } = await database.from('projects').update({ thumbnail: null }).eq('id', id);
            if (error) throw error;
            setProjects((prev) => prev.map((p) => p.id === id ? { ...p, thumbnail: null, thumbnail_scan_completed_at: undefined } : p));
        } catch (error) { console.error('Failed to clear cover:', error); }
    };

    const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !coverTargetId || !database) { setCoverTargetId(null); return; }
        try {
            const reader = new FileReader();
            const now = new Date().toISOString();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const persistedUrl = await saveImage(dataUrl, `${coverTargetId}-cover`);
            const { error } = await database.from('projects').update({ thumbnail: persistedUrl, thumbnail_scan_completed_at: now }).eq('id', coverTargetId);
            if (error) throw error;
            setProjects((prev) => prev.map((p) => p.id === coverTargetId ? { ...p, thumbnail: persistedUrl, thumbnail_scan_completed_at: now } : p));
        } catch (error) { console.error('Failed to set cover:', error); }
        finally { setCoverTargetId(null); if (e.target) e.target.value = ''; }
    };

    const openNewDialog = () => { setNewProjectName(''); setShowNewDialog(true); };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredProjects.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
    };

    const sortLabels: Record<SortMode, string> = { updated: '最近更新', name: '按名称', created: '创建时间' };

    return (
        <div className="h-screen flex bg-[#f8f8fa] text-gray-900 font-sans">
            {/* Hidden cover file input */}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" aria-label="上传封面图片" onChange={handleCoverFileChange} />

            {/* ===== Sidebar ===== */}
            <aside className="hidden md:flex w-[220px] flex-shrink-0 flex-col bg-white/70 backdrop-blur-xl border-r border-gray-200/60">
                <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-[8px] bg-gray-900 flex items-center justify-center shadow-lg shadow-gray-900/25">
                            <Sparkles size={13} className="text-white" />
                        </div>
                        <div>
                            <div className="text-[12px] font-bold tracking-tight text-gray-900">PixelForge</div>
                            <div className="text-[9px] text-gray-400 font-medium">AI 创作工作台</div>
                        </div>
                    </div>
                </div>

                <div className="px-2.5 mt-0.5 mb-2">
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            data-testid="projects-search-input"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索项目..."
                            className="w-full h-7 rounded-md bg-gray-100/80 border border-gray-200/60 pl-7 pr-7 text-[11px] text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-gray-300 focus:ring-1 focus:ring-gray-900/15 transition"
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X size={11} />
                            </button>
                        )}
                    </div>
                </div>

                <nav className="flex-1 px-2.5">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-gray-400 px-2 mb-1 font-semibold">工作区</div>
                    {([
                        { key: 'all' as const, icon: LayoutGrid, label: '全部项目', count: projects.length },
                        { key: 'favorites' as const, icon: Star, label: '收藏', count: favoriteProjects.length },
                        { key: 'recent' as const, icon: History, label: '最近访问', count: recentVisibleCount },
                    ]).map(({ key, icon: Icon, label, count }) => (
                        <button
                                data-testid={`projects-filter-${key}`}
                            key={key}
                            type="button"
                            onClick={() => { setActiveFilter(key); setSelectedIds(new Set()); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors mb-px ${activeFilter === key ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/80'}`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="ml-auto text-[10px] tabular-nums text-gray-400">{count}</span>
                        </button>
                    ))}
                </nav>

                <div className="px-2.5 pb-3 border-t border-gray-200/60 pt-2.5 space-y-0.5">
                    <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100/80 transition-colors cursor-pointer">
                        <ApiSettingsButton />
                        <span>设置中心</span>
                    </div>
                    <div onClick={() => router.push('/user')} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100/80 transition-colors text-left cursor-pointer">
                        <SignedIn>
                            <UserButton />
                            <span>账户与偏好</span>
                        </SignedIn>
                        <SignedOut>
                            <SignInButton mode="modal"><button className="text-[12px] text-gray-500 hover:text-gray-900 transition">登录</button></SignInButton>
                        </SignedOut>
                    </div>
                </div>
            </aside>

            {/* ===== Main Content ===== */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* Top Bar */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 h-12 border-b border-gray-200/60 bg-white/60 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="flex md:hidden items-center gap-1.5 mr-2">
                            <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center">
                                <Sparkles size={11} className="text-white" />
                            </div>
                            <span className="text-[12px] font-bold tracking-tight">PixelForge</span>
                        </div>
                        <h1 className="text-[15px] font-bold tracking-tight text-gray-900">
                            {activeFilter === 'all' ? '全部项目' : activeFilter === 'favorites' ? '收藏项目' : '最近访问'}
                        </h1>
                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                            {filteredProjects.length} 个项目{recentProjectsCount > 0 && ` · ${recentProjectsCount} 今日更新`}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {/* Sort picker */}
                        <div className="relative" ref={sortMenuRef}>
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className="h-8 inline-flex items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition"
                            >
                                <ArrowUpDown size={13} />
                                <span className="hidden sm:inline">{sortLabels[sortMode]}</span>
                            </button>
                            {showSortMenu && (
                                <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg border border-gray-100 bg-white py-0.5 shadow-xl">
                                    {(['updated', 'name', 'created'] as SortMode[]).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => { setSortMode(mode); setShowSortMenu(false); }}
                                            className={`w-full px-3 py-1.5 text-left text-[12px] transition-colors ${sortMode === mode ? 'text-gray-900 font-medium bg-gray-50' : 'text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {sortLabels[mode]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Batch select toggle */}
                        <button
                            onClick={toggleSelectAll}
                            className={`h-8 inline-flex items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition ${isBatchMode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                            title="批量选择"
                        >
                            <CheckSquare size={13} />
                            <span className="hidden sm:inline">{isBatchMode ? `已选 ${selectedIds.size}` : '选择'}</span>
                        </button>

                        {/* Batch actions */}
                        {isBatchMode && (
                            <>
                                <button
                                    onClick={() => setShowBatchDeleteConfirm(true)}
                                    className="h-8 inline-flex items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50 transition"
                                >
                                    <Trash2 size={13} /> 删除
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="h-8 inline-flex items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition"
                                >
                                    取消
                                </button>
                            </>
                        )}

                        {!isBatchMode && (
                            <>
                                <button
                                    data-testid="projects-create-button"
                                    onClick={openNewDialog}
                                    className="h-8 inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 text-[12px] font-medium text-white shadow-sm hover:bg-gray-800 transition"
                                >
                                    <Plus size={14} />
                                    <span className="hidden sm:inline">新建</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Mobile filter bar */}
                <div className="flex md:hidden items-center gap-1.5 px-3 py-2 border-b border-gray-200/60 overflow-x-auto bg-white/40">
                    {(['all', 'favorites', 'recent'] as const).map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveFilter(key)}
                            className={`flex-shrink-0 h-7 inline-flex items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition ${activeFilter === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
                        >
                            {key === 'all' ? '全部' : key === 'favorites' ? '收藏' : '最近'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <div className="px-5 py-4">
                        {!user ? (
                            <div className="flex flex-col items-center justify-center py-28">
                                <div className="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center mb-4 shadow-lg shadow-gray-900/20">
                                    <Sparkles size={20} className="text-white" />
                                </div>
                                <h2 className="text-lg font-bold mb-1.5">欢迎来到 PixelForge</h2>
                                <p className="text-gray-500 mb-5 text-[13px]">登录以查看和管理您的创作项目</p>
                                <SignInButton mode="modal">
                                    <button className="px-4 py-2 bg-gray-900 text-white rounded-md text-[13px] font-medium hover:bg-gray-800 transition">立即登录</button>
                                </SignInButton>
                            </div>
                        ) : isLoading ? (
                            <div className="flex items-center justify-center py-28">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                                    <span className="text-gray-400 text-[12px]">加载中...</span>
                                </div>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                                    <Plus size={22} className="text-gray-400" />
                                </div>
                                <h3 className="text-[14px] font-semibold text-gray-900 mb-1">还没有项目</h3>
                                <p className="text-[12px] text-gray-500 mb-4">创建您的第一个项目开始创作</p>
                                <button onClick={openNewDialog} className="px-4 py-2 bg-gray-900 text-white rounded-md text-[12px] font-medium hover:bg-gray-800 transition">
                                    创建项目
                                </button>
                            </div>
                        ) : filteredProjects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-3 text-gray-400">
                                    <Search size={18} />
                                </div>
                                <h4 className="text-[14px] font-semibold text-gray-900 mb-1">没有找到匹配的项目</h4>
                                <p className="text-[12px] text-gray-500">试试更换关键词，或直接创建一个新项目。</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Favorites section in "all" view */}
                                {activeFilter === 'all' && favoriteProjects.length > 0 && !searchQuery && (
                                    <section>
                                        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 tracking-wide">
                                            <Star size={12} className="text-amber-500" /> 收藏项目
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                                            {favoriteProjects.slice(0, 8).map((project) => (
                                                <div key={`fav-${project.id}`} onClick={() => handleOpenProject(project.id)}>
                                                    <ProjectCard
                                                        id={project.id} title={project.title} date={formatDate(project.updated_at)}
                                                        imageUrl={project.thumbnail || undefined}
                                                        elementCount={project.element_count}
                                                        isMetadataPending={metadataRefreshingIds.includes(project.id)}
                                                        isFavorite={favoriteProjectIds.includes(project.id)}
                                                        selected={selectedIds.has(project.id)}
                                                        onToggleFavorite={handleToggleFavorite} onRename={handleRenameProject}
                                                        onDelete={(id) => { const p = projects.find((proj) => proj.id === id); if (p) setDeleteTarget(p); }}
                                                        onSetCover={handleSetCover} onClearCover={handleClearCover} onDuplicate={handleDuplicateProject}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Time-grouped sections */}
                                {groupedProjects.map((group) => (
                                    <section key={group.key}>
                                        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 tracking-wide">
                                            <Clock3 size={12} /> {group.title}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                                            {group.items.map((project) => (
                                                <div key={project.id} onClick={() => handleOpenProject(project.id)}>
                                                    <ProjectCard
                                                        id={project.id} title={project.title} date={formatDate(project.updated_at)}
                                                        imageUrl={project.thumbnail || undefined}
                                                        elementCount={project.element_count}
                                                        isMetadataPending={metadataRefreshingIds.includes(project.id)}
                                                        isFavorite={favoriteProjectIds.includes(project.id)}
                                                        selected={selectedIds.has(project.id)}
                                                        onToggleFavorite={handleToggleFavorite} onRename={handleRenameProject}
                                                        onDelete={(id) => { const p = projects.find((proj) => proj.id === id); if (p) setDeleteTarget(p); }}
                                                        onSetCover={handleSetCover} onClearCover={handleClearCover} onDuplicate={handleDuplicateProject}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ))}

                                {filteredProjects.length > limitedFilteredProjects.length && (
                                    <div className="flex flex-col items-center gap-3 py-2">
                                        <div className="text-[11px] text-gray-400">
                                            已显示 {limitedFilteredProjects.length} / {filteredProjects.length} 个项目
                                        </div>
                                        <div ref={loadMoreSentinelRef} className="h-8 w-full" />
                                        <button
                                            type="button"
                                            onClick={() => setVisibleProjectCount((prev) => Math.min(prev + PROJECTS_PAGE_BATCH_SIZE, filteredProjects.length))}
                                            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                                        >
                                            加载更多
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* ===== Dialogs ===== */}

            {/* New Project */}
            {showNewDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowNewDialog(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[15px] font-semibold text-gray-900">新建项目</h3>
                            <button onClick={() => setShowNewDialog(false)} className="p-1 hover:bg-gray-100 rounded-md transition"><X size={14} className="text-gray-500" /></button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); handleCreateProject(); }}>
                            <label className="block text-[12px] font-medium text-gray-700 mb-1.5">项目名称</label>
                            <input
                                data-testid="projects-new-name-input"
                                ref={newProjectInputRef} type="text" value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="输入项目名称" maxLength={50}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                            />
                            <div className="flex justify-end gap-2 mt-5">
                                <button type="button" onClick={() => setShowNewDialog(false)} className="px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-100 rounded-md transition">取消</button>
                                <button data-testid="projects-create-confirm" type="submit" disabled={isCreating} className="px-4 py-1.5 bg-gray-900 text-white rounded-md text-[12px] font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isCreating ? '创建中...' : '创建'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete single */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs mx-4 p-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[15px] font-semibold text-gray-900 mb-1.5">确认删除</h3>
                        <p className="text-[12px] text-gray-600 mb-5">
                            确定要删除「<span className="font-medium text-gray-900">{deleteTarget.title}</span>」吗？此操作无法撤销。
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-100 rounded-md transition">取消</button>
                            <button data-testid="projects-delete-confirm" onClick={handleDeleteProject} className="px-4 py-1.5 bg-red-600 text-white rounded-md text-[12px] font-medium hover:bg-red-700 transition">删除</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch delete confirm */}
            {showBatchDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowBatchDeleteConfirm(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs mx-4 p-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[15px] font-semibold text-gray-900 mb-1.5">批量删除</h3>
                        <p className="text-[12px] text-gray-600 mb-5">
                            确定要删除选中的 <span className="font-medium text-gray-900">{selectedIds.size}</span> 个项目吗？此操作无法撤销。
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowBatchDeleteConfirm(false)} className="px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-100 rounded-md transition">取消</button>
                            <button data-testid="projects-batch-delete-confirm" onClick={handleBatchDelete} className="px-4 py-1.5 bg-red-600 text-white rounded-md text-[12px] font-medium hover:bg-red-700 transition">删除 {selectedIds.size} 个项目</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ProjectsPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-white flex items-center justify-center text-gray-400 text-[13px]">加载中...</div>}>
            <ProjectsContent />
        </Suspense>
    );
}
