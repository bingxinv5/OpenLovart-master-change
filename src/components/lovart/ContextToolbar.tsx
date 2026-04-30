import React, { useState, useRef, useEffect } from 'react';
import { Download, Trash2, Wand2, Copy, ArrowRight, X, Send, Eye, EyeOff, Lock, Unlock, Wrench, LayoutGrid, Check, LibraryBig, BookmarkPlus } from 'lucide-react';
import type { CanvasElement, CanvasElementExportFormat } from './canvas-types';
import { ExportMenu } from './ExportMenu';
import { WorkbenchImage } from './WorkbenchImage';
import { getCanvasImageTool } from '@/lib/canvas-tools';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import { mockupTemplates, bgOptions, parseSavedReferenceImages } from './toolbar-actions';
import { StableColorInput } from './canvas-ui-utils';

// mockupTemplates, bgOptions, parseSavedReferenceImages — imported from toolbar-actions

const splitStoryboardTool = getCanvasImageTool('split-storyboard');
const cropImageTool = getCanvasImageTool('crop-image');
const annotateImageTool = getCanvasImageTool('annotate-image');

interface ContextToolbarProps {
    element: CanvasElement;
    onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
    onStoryboardSaved?: (id: string) => void;
    storyboardAutoAdvanceEnabled?: boolean;
    onDelete: (id: string) => void;
    onCopy?: (element: CanvasElement) => void;
    onDownload?: (element: CanvasElement, format?: CanvasElementExportFormat) => void;
    projectReferenceImages?: ProjectReferenceImageItem[];
    onUseProjectReferenceImage?: (id: string) => void;
    onSaveAsProjectReference?: (element: CanvasElement) => void;
    onAiEdit?: (element: CanvasElement, prompt: string) => void;
    onRecoverTask?: (elementId: string, taskId: string) => Promise<void>;
    onReplaceBackground?: (element: CanvasElement, prompt: string) => void;
    onMockup?: (element: CanvasElement, templateId: string) => void;
    onAnnotateImage?: (element: CanvasElement) => void;
    onCropImage?: (element: CanvasElement) => void;
    onSplitStoryboard?: (element: CanvasElement) => void;
    onStoryboardPlanFromImage?: (element: CanvasElement) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onSendToChat?: (element: CanvasElement) => void;
    onToggleHidden?: (element: CanvasElement) => void;
    onToggleLocked?: (element: CanvasElement) => void;
    scale?: number;
}

// parseSavedReferenceImages — imported from toolbar-actions

export function ContextToolbar({ element, onUpdate, onStoryboardSaved, storyboardAutoAdvanceEnabled = false, onDelete, onCopy, onDownload, projectReferenceImages, onUseProjectReferenceImage, onSaveAsProjectReference, onAiEdit, onRecoverTask, onAnnotateImage, onCropImage, onSplitStoryboard, onStoryboardPlanFromImage, onConnectFlow, onSendToChat, onToggleHidden, onToggleLocked, scale = 1 }: ContextToolbarProps) {
    const stateKey = [
        element.id,
        element.savedPrompt || '',
        element.savedReferenceImages || '',
        element.generatingTaskId || '',
        element.sourceGenerationTaskId || '',
        element.generatingError || '',
        element.storyboardShotCode || '',
        element.storyboardSceneType || '',
        element.storyboardCameraMove || '',
        element.storyboardDuration || '',
        element.storyboardNote || '',
    ].join('::');

    return (
        <ContextToolbarContent
            key={stateKey}
            element={element}
            onUpdate={onUpdate}
            onStoryboardSaved={onStoryboardSaved}
            storyboardAutoAdvanceEnabled={storyboardAutoAdvanceEnabled}
            onDelete={onDelete}
            onCopy={onCopy}
            onDownload={onDownload}
            projectReferenceImages={projectReferenceImages}
            onUseProjectReferenceImage={onUseProjectReferenceImage}
            onSaveAsProjectReference={onSaveAsProjectReference}
            onAiEdit={onAiEdit}
            onRecoverTask={onRecoverTask}
            onAnnotateImage={onAnnotateImage}
            onCropImage={onCropImage}
            onSplitStoryboard={onSplitStoryboard}
            onStoryboardPlanFromImage={onStoryboardPlanFromImage}
            onConnectFlow={onConnectFlow}
            onSendToChat={onSendToChat}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            scale={scale}
        />
    );
}

function ContextToolbarContent({ element, onUpdate, onStoryboardSaved, storyboardAutoAdvanceEnabled = false, onDelete, onCopy, onDownload, projectReferenceImages = [], onUseProjectReferenceImage, onSaveAsProjectReference, onAiEdit, onRecoverTask, onAnnotateImage, onCropImage, onSplitStoryboard, onStoryboardPlanFromImage, onConnectFlow, onSendToChat, onToggleHidden, onToggleLocked, scale = 1 }: ContextToolbarProps) {
    const [showReferenceMenu, setShowReferenceMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [showStoryboardMenu, setShowStoryboardMenu] = useState(false);
    const [showEditInput, setShowEditInput] = useState(false);
    const [editPrompt, setEditPrompt] = useState(() => element.savedPrompt || '');
    const [recoveryTaskId, setRecoveryTaskId] = useState(() => element.generatingTaskId || element.sourceGenerationTaskId || '');
    const [recoverError, setRecoverError] = useState<string | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
    const [storyboardFields, setStoryboardFields] = useState(() => ({
        shotCode: element.storyboardShotCode || '',
        sceneType: element.storyboardSceneType || '',
        cameraMove: element.storyboardCameraMove || '',
        duration: element.storyboardDuration || '',
        note: element.storyboardNote || '',
    }));
    const [storyboardHint, setStoryboardHint] = useState('');

    const referenceMenuRef = useRef<HTMLDivElement>(null);
    const toolsMenuRef = useRef<HTMLDivElement>(null);
    const downloadMenuRef = useRef<HTMLDivElement>(null);
    const storyboardMenuRef = useRef<HTMLDivElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (referenceMenuRef.current && !referenceMenuRef.current.contains(e.target as Node)) setShowReferenceMenu(false);
            if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setShowToolsMenu(false);
            if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) setShowDownloadMenu(false);
            if (storyboardMenuRef.current && !storyboardMenuRef.current.contains(e.target as Node)) setShowStoryboardMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus edit input when shown.
    useEffect(() => {
        if (showEditInput) {
            requestAnimationFrame(() => {
                if (editInputRef.current) {
                    editInputRef.current.focus();
                    // Place cursor at end
                    const len = editInputRef.current.value.length;
                    editInputRef.current.setSelectionRange(len, len);
                }
            });
        }
    }, [showEditInput]);

    useEffect(() => {
        if (!isRecovering) {
            setRecoveryTaskId(element.generatingTaskId || element.sourceGenerationTaskId || '');
        }
    }, [element.generatingTaskId, element.sourceGenerationTaskId, isRecovering]);

    if (!element) return null;

    // ========== Handlers ==========
    const handleCopy = () => {
        onCopy?.(element);
    };

    const handleDownload = (format: CanvasElementExportFormat = 'original') => {
        onDownload?.(element, format);
        setShowDownloadMenu(false);
    };

    const [selectedReferenceImages, setSelectedReferenceImages] = useState<string[]>(() => parseSavedReferenceImages(element.savedReferenceImages));
    const selectedReferenceCount = selectedReferenceImages.length;
    const canOpenReferenceMenu = projectReferenceImages.length > 0 || selectedReferenceCount > 0;
    const isSavedAsProjectReference = element.type === 'image' && !!element.content && projectReferenceImages.some((item) => item.image === element.content);

    useEffect(() => {
        setSelectedReferenceImages(parseSavedReferenceImages(element.savedReferenceImages));
    }, [element.id, element.savedReferenceImages]);

    const handleToggleProjectReference = (item: ProjectReferenceImageItem) => {
        const alreadySelected = selectedReferenceImages.includes(item.image);
        const nextReferenceImages = alreadySelected
            ? selectedReferenceImages.filter((image) => image !== item.image)
            : [...selectedReferenceImages, item.image].slice(0, 8);

        setSelectedReferenceImages(nextReferenceImages);

        onUpdate(element.id, {
            savedReferenceImages: nextReferenceImages.length > 0 ? JSON.stringify(nextReferenceImages) : undefined,
        });

        if (!alreadySelected) {
            onUseProjectReferenceImage?.(item.id);
        }
    };

    const handleClearProjectReferences = () => {
        setSelectedReferenceImages([]);
        onUpdate(element.id, { savedReferenceImages: undefined });
    };

    const getElementWithCurrentProjectReferences = () => {
        const savedReferenceImages = selectedReferenceImages.length > 0 ? JSON.stringify(selectedReferenceImages) : undefined;
        onUpdate(element.id, { savedReferenceImages });
        return {
            ...element,
            savedReferenceImages,
        };
    };

    const isLocked = !!element.locked;
    const isHidden = !!element.hidden;
    const canSendToChat = element.type === 'image' && !!element.content;
    const canOpenExportMenu = (element.type === 'image' || element.type === 'video') && !!element.content;
    const exportMenuKind = element.type === 'video' ? 'video' : 'image';

    const handleAiEditSubmit = () => {
        if (!editPrompt.trim()) return;
        onAiEdit?.(getElementWithCurrentProjectReferences(), editPrompt.trim());
        setRecoverError(null);
        setShowEditInput(false);
    };

    const handleAiPresetSelect = (prompt: string) => {
        setEditPrompt(prompt);
        setRecoverError(null);
        requestAnimationFrame(() => {
            editInputRef.current?.focus();
        });
    };

    const handleRecoverTask = async () => {
        const taskId = recoveryTaskId.trim();
        if (!taskId || !onRecoverTask) {
            return;
        }

        setIsRecovering(true);
        setRecoverError(null);
        try {
            await onRecoverTask(element.id, taskId);
            setShowEditInput(false);
        } catch (error) {
            setRecoverError(error instanceof Error ? error.message : '任务恢复失败');
        } finally {
            setIsRecovering(false);
        }
    };

    const storyboardShotCodeError = validateStoryboardShotCode(storyboardFields.shotCode);
    const storyboardDurationError = validateStoryboardDuration(storyboardFields.duration);
    const hasStoryboardValues = !!(
        element.storyboardShotCode?.trim()
        || element.storyboardSceneType?.trim()
        || element.storyboardCameraMove?.trim()
        || element.storyboardDuration?.trim()
        || element.storyboardNote?.trim()
    );

    const applyStoryboardFields = () => {
        if (storyboardShotCodeError || storyboardDurationError) {
            setStoryboardHint('请先修正镜头号或时长格式。');
            return;
        }

        onUpdate(element.id, {
            storyboardShotCode: storyboardFields.shotCode.trim() || undefined,
            storyboardSceneType: storyboardFields.sceneType.trim() || undefined,
            storyboardCameraMove: storyboardFields.cameraMove.trim() || undefined,
            storyboardDuration: storyboardFields.duration.trim() || undefined,
            storyboardNote: storyboardFields.note.trim() || undefined,
        });
        onStoryboardSaved?.(element.id);
        setStoryboardHint('已写入当前图片的分镜字段。');
    };

    const availableImageTools: Array<{ key: string; tool: ReturnType<typeof getCanvasImageTool>; run: () => void }> = [];
    if (element.type === 'image') {
        if (onCropImage) {
            availableImageTools.push({ key: cropImageTool.id, tool: cropImageTool, run: () => onCropImage(element) });
        }
        if (onAnnotateImage) {
            availableImageTools.push({ key: annotateImageTool.id, tool: annotateImageTool, run: () => onAnnotateImage(element) });
        }
        if (onSplitStoryboard) {
            availableImageTools.push({ key: splitStoryboardTool.id, tool: splitStoryboardTool, run: () => onSplitStoryboard(element) });
        }
    }

    // Frame elements have their own inline toolbar in CanvasArea, skip here
    if (element.type === 'frame') return null;

    // 针对图片和视频元素显示特殊的工具栏
    if (element.type === 'image' || element.type === 'video') {
        return (
            <div className="relative pointer-events-none">
                {/* AI Edit prompt input */}
                {showEditInput && (
                    <div
                        style={{ top: 48 + (element.height || 0) * scale + 8 }}
                        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 w-[22rem] workbench-panel-elevated rounded-xl z-50 p-3"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-white"><Wand2 size={12} /></div>
                                <span className="text-[13px] font-semibold text-slate-800">AI 智能编辑</span>
                            </div>
                            <button type="button" onClick={() => setShowEditInput(false)} title="关闭 AI 智能编辑" aria-label="关闭 AI 智能编辑" className="text-slate-400 hover:text-slate-600 transition-colors"><X size={14} /></button>
                        </div>
                        <div className="flex gap-2">
                            <input
                                ref={editInputRef}
                                type="text"
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAiEditSubmit(); }}
                                placeholder='输入编辑指令，如"把背景换成海边"'
                                className="flex-1 text-sm border border-slate-200/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-300"
                            />
                            <button
                                onClick={handleAiEditSubmit}
                                disabled={!editPrompt.trim()}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${editPrompt.trim() ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                                执行
                            </button>
                        </div>
                        {element.type === 'image' && onRecoverTask && (
                            <div className="mt-2 flex gap-2">
                                <input
                                    type="text"
                                    value={recoveryTaskId}
                                    onChange={(e) => { setRecoveryTaskId(e.target.value); setRecoverError(null); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void handleRecoverTask(); }}
                                    placeholder="输入 task_id 查询当前图片结果"
                                    className="flex-1 text-sm border border-slate-200/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => { void handleRecoverTask(); }}
                                    disabled={!recoveryTaskId.trim() || isRecovering}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${recoveryTaskId.trim() && !isRecovering ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    {isRecovering ? '查询中' : '查询 task_id'}
                                </button>
                            </div>
                        )}
                        {element.type === 'image' && !element.generatingTaskId && element.sourceGenerationTaskId && (
                            <div className="mt-2 text-[11px] text-slate-500">
                                已保存来源 task_id，可直接查询并重新应用当前图片结果。
                            </div>
                        )}
                        <div className="mt-3 space-y-3">
                            <div>
                                <div className="mb-1.5 text-[11px] font-medium text-slate-500">背景预设</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {bgOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => handleAiPresetSelect(option.prompt)}
                                            className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${editPrompt === option.prompt ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="mb-1.5 text-[11px] font-medium text-slate-500">Mockup 预设</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {mockupTemplates.map((template) => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => handleAiPresetSelect(template.prompt)}
                                            className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${editPrompt === template.prompt ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            {template.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="mb-1.5 text-[11px] font-medium text-slate-500">常用提示词</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {['加上墨镜', '变成水彩画风格', '添加文字水印', '增强画质'].map((hint) => (
                                        <button
                                            key={hint}
                                            type="button"
                                            onClick={() => handleAiPresetSelect(hint)}
                                            className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100"
                                        >
                                            {hint}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-400">点击预设会填入上方输入框，你可以直接执行，也可以继续微调提示词。</div>
                        </div>
                        {recoverError && (
                            <div className="mt-2 text-[11px] text-rose-500">{recoverError}</div>
                        )}
                    </div>
                )}

                <div
                    className="pointer-events-none workbench-panel rounded-[16px] p-1.5 flex items-center gap-1 whitespace-nowrap"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* 图片尺寸显示 */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">{Math.round(element.width || 0)}<span className="text-slate-400">×</span>{Math.round(element.height || 0)}</span>
                    </div>

                    <div className="w-px h-5 bg-slate-200/60" />

                    {canOpenReferenceMenu && (
                        <div ref={referenceMenuRef} className="pointer-events-auto relative">
                            <button
                                data-testid="context-project-reference-button"
                                onClick={() => {
                                    setShowReferenceMenu((prev) => !prev);
                                    setShowEditInput(false);
                                    setShowToolsMenu(false);
                                    setShowStoryboardMenu(false);
                                }}
                                className={`relative p-2 rounded-lg transition-all ${showReferenceMenu ? 'bg-violet-50 text-violet-700' : selectedReferenceCount > 0 ? 'bg-violet-50/70 text-violet-600 hover:bg-violet-100' : 'hover:bg-slate-50 text-slate-500'}`}
                                title="项目参考库"
                            >
                                <LibraryBig size={16} />
                                {selectedReferenceCount > 0 && (
                                    <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-violet-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{selectedReferenceCount}</span>
                                )}
                            </button>
                            {showReferenceMenu && (
                                <div
                                    className="pointer-events-auto popover-enter absolute top-full mt-2 right-0 w-[300px] whitespace-normal workbench-panel-elevated rounded-xl z-50"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-white"><LibraryBig size={12} /></div>
                                            <span className="text-[13px] font-semibold text-slate-800">项目参考库</span>
                                        </div>
                                        {selectedReferenceCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleClearProjectReferences}
                                                className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200"
                                            >
                                                清空
                                            </button>
                                        )}
                                    </div>
                                    {projectReferenceImages.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-1.5 p-2">
                                            {projectReferenceImages.slice(0, 9).map((item) => {
                                                const selected = selectedReferenceImages.includes(item.image);
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => handleToggleProjectReference(item)}
                                                        data-testid={`context-project-reference-${item.id}`}
                                                        className={`overflow-hidden rounded-md border text-left transition-colors ${selected ? 'ring-2 ring-slate-800 ring-offset-1 border-transparent' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                                        title={item.label}
                                                    >
                                                        <div className="relative">
                                                            <WorkbenchImage
                                                                content={item.image}
                                                                alt={item.label}
                                                                containerClassName="h-16 w-full"
                                                                imageClassName=""
                                                                fit="cover"
                                                                showSurface={false}
                                                            />
                                                            {selected && (
                                                                <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white"><Check size={10} /></div>
                                                            )}
                                                        </div>
                                                        <div className="px-1.5 py-1">
                                                            <div className="line-clamp-1 text-[11px] font-medium leading-4 text-slate-700">{item.label}</div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-4 text-[11px] text-slate-400">当前项目还没有可复用参考图，可先在媒体面板中加入参考库。</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 编辑元素 */}
                        <button
                        onClick={() => {
                            setShowEditInput((prev) => {
                                const next = !prev;
                                if (next) {
                                    setEditPrompt(element.savedPrompt || '');
                                }
                                return next;
                            });
                            setShowReferenceMenu(false);
                            setShowToolsMenu(false);
                            setShowStoryboardMenu(false);
                        }}
                            className={`pointer-events-auto p-2 rounded-lg transition-all ${showEditInput ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-50 text-slate-500'}`}
                        title="AI 智能编辑"
                    >
                        <Wand2 size={16} />
                    </button>

                    {availableImageTools.length > 0 && (
                        <div ref={toolsMenuRef} className="pointer-events-auto relative">
                            <button
                                onClick={() => {
                                    setShowToolsMenu((prev) => !prev);
                                    setShowEditInput(false);
                                    setShowReferenceMenu(false);
                                    setShowStoryboardMenu(false);
                                }}
                                className={`p-2 rounded-lg transition-all ${showToolsMenu ? 'bg-violet-50 text-violet-600' : 'hover:bg-slate-50 text-slate-500'}`}
                                title="图片工具"
                            >
                                <Wrench size={16} />
                            </button>
                            {showToolsMenu && (
                                <div
                                    className="pointer-events-auto popover-enter absolute top-full mt-2 right-0 w-64 whitespace-normal workbench-panel-elevated rounded-[16px] z-50"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="p-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 px-2.5 py-1.5">图片工具</p>
                                        {availableImageTools.map((entry) => (
                                            <button
                                                key={entry.key}
                                                onClick={() => {
                                                    setShowToolsMenu(false);
                                                    entry.run();
                                                }}
                                                className="block w-full text-left px-3 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
                                            >
                                                <span>{entry.tool.title}</span>
                                                <p className="text-[10px] text-slate-400 mt-0.5 font-normal">{entry.tool.description}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {element.type === 'image' && (
                        <div ref={storyboardMenuRef} className="pointer-events-auto relative">
                            <button
                                onClick={() => {
                                    setShowStoryboardMenu((prev) => !prev);
                                    setShowToolsMenu(false);
                                    setShowEditInput(false);
                                    setShowReferenceMenu(false);
                                }}
                                className={`p-2 rounded-lg transition-all ${showStoryboardMenu ? 'bg-amber-50 text-amber-700' : hasStoryboardValues ? 'bg-amber-50/60 text-amber-600 hover:bg-amber-100' : 'hover:bg-slate-50 text-slate-500'}`}
                                title="分镜字段"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            {showStoryboardMenu && (
                                <div
                                    className="pointer-events-auto popover-enter absolute top-full right-0 z-50 mt-2 w-[320px] whitespace-normal workbench-panel-elevated rounded-2xl"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                                            <LayoutGrid size={14} className="text-slate-400" />
                                            分镜字段
                                        </div>
                                        <button type="button" onClick={applyStoryboardFields} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all">
                                            <Check size={11} />
                                            写入
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 p-3">
                                        <label className={`rounded-xl border px-2.5 py-2 transition-colors ${storyboardShotCodeError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50 focus-within:border-indigo-300 focus-within:bg-white'}`}>
                                            <div className="text-[10px] font-semibold text-slate-500">镜头号</div>
                                            <input type="text" value={storyboardFields.shotCode} onChange={(e) => setStoryboardFields((prev) => ({ ...prev, shotCode: e.target.value }))} placeholder="如：A01" className="storyboard-input mt-0.5 text-[13px]" />
                                            {storyboardShotCodeError && <div className="mt-0.5 text-[9px] leading-3 text-rose-500">{storyboardShotCodeError}</div>}
                                        </label>
                                        <label className="rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-white">
                                            <div className="text-[10px] font-semibold text-slate-500">景别</div>
                                            <input type="text" value={storyboardFields.sceneType} onChange={(e) => setStoryboardFields((prev) => ({ ...prev, sceneType: e.target.value }))} placeholder="如：中景" className="storyboard-input mt-0.5 text-[13px]" />
                                        </label>
                                        <label className="rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-white">
                                            <div className="text-[10px] font-semibold text-slate-500">运镜</div>
                                            <input type="text" value={storyboardFields.cameraMove} onChange={(e) => setStoryboardFields((prev) => ({ ...prev, cameraMove: e.target.value }))} placeholder="如：推镜" className="storyboard-input mt-0.5 text-[13px]" />
                                        </label>
                                        <label className={`rounded-xl border px-2.5 py-2 transition-colors ${storyboardDurationError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50 focus-within:border-indigo-300 focus-within:bg-white'}`}>
                                            <div className="text-[10px] font-semibold text-slate-500">时长</div>
                                            <input type="text" value={storyboardFields.duration} onChange={(e) => setStoryboardFields((prev) => ({ ...prev, duration: e.target.value }))} placeholder="如：3s" className="storyboard-input mt-0.5 text-[13px]" />
                                            {storyboardDurationError && <div className="mt-0.5 text-[9px] leading-3 text-rose-500">{storyboardDurationError}</div>}
                                        </label>
                                        <label className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2 transition-colors focus-within:border-indigo-300 focus-within:bg-white">
                                            <div className="text-[10px] font-semibold text-slate-500">备注</div>
                                            <input type="text" value={storyboardFields.note} onChange={(e) => setStoryboardFields((prev) => ({ ...prev, note: e.target.value }))} placeholder="如：角色转身看向镜头" className="storyboard-input mt-0.5 text-[13px]" />
                                        </label>
                                    </div>
                                    {(storyboardHint || storyboardAutoAdvanceEnabled) && (
                                        <div className="border-t border-slate-100 px-4 py-2.5 space-y-1">
                                            {storyboardHint && <div className="text-[10px] text-slate-400">{storyboardHint}</div>}
                                            {storyboardAutoAdvanceEnabled && (
                                                <div className="text-[10px] text-violet-500">写入后自动跳转下一项</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {element.type === 'image' && element.content && onStoryboardPlanFromImage && (
                        <button
                            onClick={() => onStoryboardPlanFromImage(getElementWithCurrentProjectReferences())}
                            className="pointer-events-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-sky-50/90 px-3 py-2 text-sky-700 transition-all hover:bg-sky-100"
                            title="基于当前图片生成分镜宫格"
                        >
                            <LayoutGrid size={14} />
                            <span className="text-xs font-semibold">分镜</span>
                        </button>
                    )}

                    {element.type === 'image' && element.content && onSaveAsProjectReference && (
                        <button
                            onClick={() => onSaveAsProjectReference(element)}
                            disabled={isSavedAsProjectReference}
                            className={`pointer-events-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all ${isSavedAsProjectReference ? 'cursor-default bg-emerald-50 text-emerald-700' : 'bg-violet-50/80 text-violet-700 hover:bg-violet-100'}`}
                            title={isSavedAsProjectReference ? '已加入项目参考库' : '加入项目参考库'}
                        >
                            <BookmarkPlus size={14} />
                            <span className="text-xs font-semibold">参考</span>
                        </button>
                    )}

                    {/* 流程图连接 */}
                    {onConnectFlow && (
                        <button
                            data-testid="context-connect-flow-button"
                            onClick={() => onConnectFlow(getElementWithCurrentProjectReferences())}
                            className="pointer-events-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-50/80 px-3 py-2 text-blue-600 transition-all hover:bg-blue-100"
                            title="创建流程图连接"
                        >
                            <ArrowRight size={14} />
                            <span className="text-xs font-semibold">流程</span>
                        </button>
                    )}

                    <div className="w-px h-5 bg-slate-200/60" />

                    {/* 复制 */}
                    <button
                        onClick={handleCopy}
                        className="pointer-events-auto p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-all"
                        title="复制元素"
                    >
                        <Copy size={16} />
                    </button>

                    {/* 下载 */}
                    {element.content && (
                        <div className="pointer-events-auto relative" ref={downloadMenuRef}>
                            <button
                                onClick={() => canOpenExportMenu ? setShowDownloadMenu((value) => !value) : handleDownload()}
                                className={`p-2 rounded-lg text-slate-500 transition-all ${showDownloadMenu ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                                title={canOpenExportMenu ? '导出媒体' : '下载'}
                            >
                                <Download size={16} />
                            </button>
                            {canOpenExportMenu && showDownloadMenu && (
                                <div className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2">
                                    <ExportMenu kind={exportMenuKind} onSelect={handleDownload} />
                                </div>
                            )}
                        </div>
                    )}

                    {canSendToChat && (
                        <button
                            onClick={() => onSendToChat?.(element)}
                            className="pointer-events-auto p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-all"
                            title="发送至对话"
                        >
                            <Send size={16} />
                        </button>
                    )}

                    <button
                        onClick={() => onToggleHidden?.(element)}
                        className={`pointer-events-auto p-2 rounded-lg transition-all ${isHidden ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-500'}`}
                        title={isHidden ? '显示元素' : '隐藏元素'}
                    >
                        {isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>

                    <button
                        onClick={() => onToggleLocked?.(element)}
                        className={`pointer-events-auto p-2 rounded-lg transition-all ${isLocked ? 'bg-amber-50 text-amber-600' : 'hover:bg-slate-50 text-slate-500'}`}
                        title={isLocked ? '解锁元素' : '锁定元素'}
                    >
                        {isLocked ? <Unlock size={16} /> : <Lock size={16} />}
                    </button>

                    {/* 删除 */}
                    <button
                        onClick={() => onDelete(element.id)}
                        className="pointer-events-auto p-2 hover:bg-red-50 text-red-400 rounded-lg transition-all hover:text-red-500"
                        title="删除"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        );
    }

    // 其他元素类型的工具栏
    const resolvedElementColor = element.color || (element.type === 'text' ? '#000000' : '#9CA3AF');

    return (
        <div
            className="pointer-events-auto workbench-panel rounded-[16px] p-1.5 flex items-center gap-2.5"
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Color Picker (for Shapes and Text) */}
            <div className="flex items-center gap-2">
                <div
                    className="w-7 h-7 rounded-full border-2 border-white shadow-sm cursor-pointer relative overflow-hidden ring-1 ring-slate-200"
                    style={{ backgroundColor: resolvedElementColor }}
                >
                    <StableColorInput
                        value={element.color}
                        fallbackValue={element.type === 'text' ? '#000000' : '#9CA3AF'}
                        title={element.type === 'text' ? '文字颜色' : '元素颜色'}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        onChange={(value) => onUpdate(element.id, { color: value })}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            <div className="w-px h-5 bg-slate-200/60" />

            {/* Dimensions (Width/Height) - For Shapes */}
            {element.type === 'shape' && (
                <>
                    <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] font-semibold text-slate-400">W</span>
                            <input
                                type="number"
                                className="w-12 bg-transparent text-sm font-medium text-slate-700 outline-none"
                                title="形状宽度"
                                aria-label="形状宽度"
                                value={Math.round(element.width || 0)}
                                onChange={(e) => onUpdate(element.id, { width: parseInt(e.target.value) })}
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] font-semibold text-slate-400">H</span>
                            <input
                                type="number"
                                className="w-12 bg-transparent text-sm font-medium text-slate-700 outline-none"
                                title="形状高度"
                                aria-label="形状高度"
                                value={Math.round(element.height || 0)}
                                onChange={(e) => onUpdate(element.id, { height: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="w-px h-5 bg-slate-200/60" />
                </>
            )}

            {/* Text Properties */}
            {element.type === 'text' && (
                <>
                    <select
                        aria-label="选择字体"
                        className="bg-slate-50/80 text-sm font-medium text-slate-700 outline-none border border-slate-200/60 rounded-lg px-2 py-1.5"
                        value={element.fontFamily || 'Inter'}
                        onChange={(e) => onUpdate(element.id, { fontFamily: e.target.value })}
                    >
                        <option value="Inter">Inter</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                    </select>

                    <select
                        aria-label="选择字体大小"
                        className="bg-slate-50/80 text-sm font-medium text-slate-700 outline-none border border-slate-200/60 rounded-lg px-2 py-1.5"
                        value={element.fontSize || 24}
                        onChange={(e) => onUpdate(element.id, { fontSize: parseInt(e.target.value) })}
                    >
                        {[12, 14, 16, 18, 20, 24, 32, 48, 64, 80, 96].map(size => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                    <div className="w-px h-5 bg-slate-200/60" />
                </>
            )}

            {/* Common Actions */}
            <div className="flex items-center gap-1">
                {onCopy && (
                    <button onClick={handleCopy} className="p-2 hover:bg-slate-50 rounded-xl text-slate-600 transition-all" title="复制">
                        <Copy size={17} />
                    </button>
                )}
                {element.content && (
                    <div className="relative" ref={downloadMenuRef}>
                        <button
                            onClick={() => canOpenExportMenu ? setShowDownloadMenu((value) => !value) : handleDownload()}
                            className={`p-2 rounded-xl text-slate-600 transition-all ${showDownloadMenu ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                            title={canOpenExportMenu ? '导出' : '下载'}
                        >
                            <Download size={17} />
                        </button>
                        {canOpenExportMenu && showDownloadMenu && (
                            <div className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2">
                                <ExportMenu kind={exportMenuKind} onSelect={handleDownload} />
                            </div>
                        )}
                    </div>
                )}
                {canSendToChat && (
                    <button onClick={() => onSendToChat?.(element)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-600 transition-all" title="发送至对话">
                        <Send size={17} />
                    </button>
                )}
                <button
                    onClick={() => onToggleHidden?.(element)}
                    className={`p-2 rounded-xl transition-all ${isHidden ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-50 text-slate-600'}`}
                    title={isHidden ? '显示' : '隐藏'}
                >
                    {isHidden ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
                <button
                    onClick={() => onToggleLocked?.(element)}
                    className={`p-2 rounded-xl transition-all ${isLocked ? 'bg-amber-50 text-amber-600' : 'hover:bg-slate-50 text-slate-600'}`}
                    title={isLocked ? '解锁' : '锁定'}
                >
                    {isLocked ? <Unlock size={17} /> : <Lock size={17} />}
                </button>
                <button onClick={() => onDelete(element.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-all" title="删除">
                    <Trash2 size={17} />
                </button>
            </div>
        </div>
    );
}
