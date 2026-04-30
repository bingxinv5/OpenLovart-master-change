'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, X } from 'lucide-react';
import { SignInButton, useUser } from '@/lib/mock-clerk';
import { ProjectCard } from '@/components/lovart/ProjectCard';
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

function CreateProjectTile({ onClick }: { onClick: () => void }) {
    return (
        <div className="min-w-0">
            <button
                type="button"
                data-testid="projects-create-tile"
                onClick={onClick}
                className="group flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[3px] border border-dashed border-[#D8D8D8] bg-transparent transition-colors duration-300 hover:border-[#1A1A1A]"
            >
                <Plus size={22} strokeWidth={1.4} className="text-[#1A1A1A] transition-transform duration-500 group-hover:scale-110" />
                <span className="text-[13px] font-medium tracking-tight text-[#1A1A1A]">新建项目</span>
            </button>
            <div className="px-0 pt-4 text-[11.5px] tracking-[0.04em] text-[#9A9A9A]">创建新的项目</div>
        </div>
    );
}

function ProjectsContent() {
    const { user } = useUser();
    const database = useLocalDb();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [metadataRefreshingIds, setMetadataRefreshingIds] = useState<string[]>([]);
    const metadataHydratingIdsRef = useRef<Set<string>>(new Set());

    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const newProjectInputRef = useRef<HTMLInputElement>(null);

    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

    const coverInputRef = useRef<HTMLInputElement>(null);
    const [coverTargetId, setCoverTargetId] = useState<string | null>(null);

    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setShowNewDialog(true);
            window.history.replaceState({}, '', '/projects');
        }
    }, [searchParams]);

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

            const projectsWithCounts = projectsData.map((project) => ({
                ...project,
                thumbnail: project.thumbnail || null,
                elementCount: typeof project.element_count === 'number' ? project.element_count : -1,
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
                if (group.length === 1) {
                    filteredProjects.push(stripElementCount(group[0]));
                    continue;
                }

                const keepProject = pickProjectToKeep(group);
                const cleanupCandidates = group.filter((project) => project.id !== keepProject.id && project.elementCount === 0);
                if (cleanupCandidates.length === group.length - 1) {
                    duplicateIdsToDelete.push(...cleanupCandidates.map((project) => project.id));
                }
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

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

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
        if (showNewDialog && newProjectInputRef.current) {
            window.setTimeout(() => newProjectInputRef.current?.focus(), 100);
        }
    }, [showNewDialog]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    };

    const handleOpenProject = useCallback((projectId: string) => {
        router.push(`/canvas?id=${projectId}`);
    }, [router]);

    const generateUUID = (): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
            const random = (Math.random() * 16) | 0;
            return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
        });
    };

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

            setProjects((prev) => [{
                id: newId,
                title: name,
                thumbnail: null,
                updated_at: now,
                created_at: now,
                element_count: 0,
                project_stats_updated_at: now,
                thumbnail_scan_completed_at: now,
            }, ...prev]);
            setShowNewDialog(false);
            setNewProjectName('');
            router.push(`/canvas?id=${newId}`);
        } catch (error) {
            console.error('Failed to create project:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRenameProject = async (id: string, newTitle: string) => {
        if (!database) return;

        try {
            const { error } = await database.from('projects').update({ title: newTitle }).eq('id', id);
            if (error) throw error;

            setProjects((prev) => prev.map((project) => project.id === id ? {
                ...project,
                title: newTitle,
                updated_at: new Date().toISOString(),
            } : project));
        } catch (error) {
            console.error('Failed to rename project:', error);
        }
    };

    const handleDeleteProject = async () => {
        if (!database || !deleteTarget) return;

        const id = deleteTarget.id;
        try {
            await deleteCanvasProjects({ database, projectIds: [id] });
            setProjects((prev) => prev.filter((project) => project.id !== id));
        } catch (error) {
            console.error('Failed to delete project:', error);
        } finally {
            setDeleteTarget(null);
        }
    };

    const handleDuplicateProject = async (id: string) => {
        if (!database) return;

        const source = projects.find((project) => project.id === id);
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
        } catch (error) {
            console.error('Failed to duplicate project:', error);
        }
    };

    const handleSetCover = (id: string) => {
        setCoverTargetId(id);
        coverInputRef.current?.click();
    };

    const handleClearCover = async (id: string) => {
        if (!database) return;

        try {
            const { error } = await database.from('projects').update({ thumbnail: null }).eq('id', id);
            if (error) throw error;

            setProjects((prev) => prev.map((project) => project.id === id ? {
                ...project,
                thumbnail: null,
                thumbnail_scan_completed_at: undefined,
            } : project));
        } catch (error) {
            console.error('Failed to clear cover:', error);
        }
    };

    const handleCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !coverTargetId || !database) {
            setCoverTargetId(null);
            return;
        }

        try {
            const reader = new FileReader();
            const now = new Date().toISOString();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const persistedUrl = await saveImage(dataUrl, `${coverTargetId}-cover`);
            const { error } = await database.from('projects').update({
                thumbnail: persistedUrl,
                thumbnail_scan_completed_at: now,
            }).eq('id', coverTargetId);
            if (error) throw error;

            setProjects((prev) => prev.map((project) => project.id === coverTargetId ? {
                ...project,
                thumbnail: persistedUrl,
                thumbnail_scan_completed_at: now,
            } : project));
        } catch (error) {
            console.error('Failed to set cover:', error);
        } finally {
            setCoverTargetId(null);
            if (event.target) event.target.value = '';
        }
    };

    const openNewDialog = () => {
        setNewProjectName('');
        setShowNewDialog(true);
    };

    return (
        <div className="min-h-screen bg-[#f8f8fa] text-slate-900">
            <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="上传封面图片"
                onChange={handleCoverFileChange}
            />

            <div className="min-h-screen">
                <main className="mx-auto max-w-[1480px] px-10 pb-24 pt-12 sm:px-14 lg:px-16">
                    <header className="mb-12 flex items-baseline gap-3">
                        <h1 className="text-[20px] font-semibold tracking-tight text-[#1A1A1A]">全部项目</h1>
                        {user && !isLoading && projects.length > 0 && (
                            <span className="text-[12px] tracking-[0.04em] text-[#9A9A9A]">· {projects.length} 个项目</span>
                        )}
                    </header>

                    {!user ? (
                        <div className="flex min-h-[52vh] flex-col items-center justify-center rounded-[28px] border border-slate-200/70 bg-white/70 px-8 py-14 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-sm">
                            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm">
                                <FolderOpen size={26} strokeWidth={1.6} />
                            </div>
                            <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">登录后查看项目</h2>
                            <p className="mt-2 max-w-md text-[14px] leading-7 text-slate-500">登录后即可继续管理已有创作，或者直接开始新的项目。</p>
                            <SignInButton mode="modal">
                                <button className="mt-8 rounded-full bg-slate-900 px-6 py-3 text-[14px] font-medium text-white transition hover:bg-slate-800">
                                    立即登录
                                </button>
                            </SignInButton>
                        </div>
                    ) : isLoading ? (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-14 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <div key={index} className="min-w-0 animate-pulse">
                                    <div className="aspect-[4/3] rounded-[3px] bg-black/[0.03]" />
                                    <div className="mt-4 h-3 w-20 rounded-full bg-black/[0.06]" />
                                    <div className="mt-2 h-2.5 w-14 rounded-full bg-black/[0.04]" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <section className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                <CreateProjectTile onClick={openNewDialog} />

                                {projects.map((project) => (
                                    <div key={project.id} className="min-w-0" onClick={() => handleOpenProject(project.id)}>
                                        <ProjectCard
                                            id={project.id}
                                            title={project.title}
                                            date={formatDate(project.updated_at)}
                                            imageUrl={project.thumbnail || undefined}
                                            isMetadataPending={metadataRefreshingIds.includes(project.id)}
                                            onRename={handleRenameProject}
                                            onDelete={(id) => {
                                                const target = projects.find((item) => item.id === id);
                                                if (target) setDeleteTarget(target);
                                            }}
                                            onSetCover={handleSetCover}
                                            onClearCover={handleClearCover}
                                            onDuplicate={handleDuplicateProject}
                                        />
                                    </div>
                                ))}
                            </section>

                            <div className="pt-16 text-center text-[12px] tracking-[0.04em] text-[#9A9A9A]">
                                {projects.length === 0 ? '从第一个项目开始' : '没有更多了'}
                            </div>
                        </>
                    )}
                </main>
            </div>

            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm" onClick={() => setShowNewDialog(false)}>
                    <div className="w-full max-w-md rounded-[14px] border border-slate-200/70 bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.14)]" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-4 flex items-start justify-between">
                            <h3 className="text-[20px] font-semibold tracking-tight text-slate-900">新建项目</h3>
                            <button
                                type="button"
                                aria-label="关闭新建项目弹窗"
                                title="关闭新建项目弹窗"
                                onClick={() => setShowNewDialog(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={(event) => { event.preventDefault(); void handleCreateProject(); }}>
                            <label htmlFor="projects-new-name-input" className="mb-2.5 block text-[13px] font-medium text-slate-700">项目名称</label>
                            <input
                                id="projects-new-name-input"
                                data-testid="projects-new-name-input"
                                ref={newProjectInputRef}
                                type="text"
                                value={newProjectName}
                                onChange={(event) => setNewProjectName(event.target.value)}
                                placeholder="输入项目名称"
                                maxLength={50}
                                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[14px] text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
                            />

                            <div className="mt-6 flex justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setShowNewDialog(false)}
                                    className="rounded-[10px] px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                >
                                    取消
                                </button>
                                <button
                                    data-testid="projects-create-confirm"
                                    type="submit"
                                    disabled={isCreating}
                                    className="rounded-[10px] bg-slate-900 px-5 py-2 text-[13px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isCreating ? '创建中...' : '开始创作'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
                    <div className="w-full max-w-sm rounded-[24px] border border-slate-200/70 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]" onClick={(event) => event.stopPropagation()}>
                        <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">确认删除</h3>
                        <p className="mt-3 text-[13px] leading-7 text-slate-500">
                            删除后无法恢复。确定删除“<span className="font-medium text-slate-900">{deleteTarget.title}</span>”吗？
                        </p>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="rounded-full px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                            >
                                取消
                            </button>
                            <button
                                data-testid="projects-delete-confirm"
                                type="button"
                                onClick={() => void handleDeleteProject()}
                                className="rounded-full bg-red-600 px-5 py-2 text-[13px] font-medium text-white transition hover:bg-red-700"
                            >
                                删除项目
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ProjectsPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f8f8fa] text-[13px] text-slate-400">加载中...</div>}>
            <ProjectsContent />
        </Suspense>
    );
}
