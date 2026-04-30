"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Circle, Frame, Hand, Image as ImageIcon, LayoutGrid, MapPin, MousePointer2, Pencil, PlusSquare, Sparkles, Square, Triangle, Type, Video, X } from 'lucide-react';

interface FloatingToolbarProps {
    activeTool: string;
    onToolChange: (tool: string) => void;
    onAddImage: (files: File[]) => void;
    onAddVideo: (file: File) => void;
    onAddText: () => void;
    onAddShape: (type: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right') => void;
    onOpenImageGenerator: () => void;
    onOpenVideoGenerator?: () => void;
    onOpenStoryboardPlanner?: () => void;
}

export function FloatingToolbar({ activeTool, onToolChange, onAddImage, onAddVideo, onAddText, onAddShape, onOpenImageGenerator, onOpenVideoGenerator, onOpenStoryboardPlanner }: FloatingToolbarProps) {
    const [openMenu, setOpenMenu] = useState<'select' | 'upload' | 'shape' | 'draw' | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };

        window.addEventListener('mousedown', handlePointerDown);
        return () => window.removeEventListener('mousedown', handlePointerDown);
    }, []);

    const handleImageUploadClick = () => {
        imageInputRef.current?.click();
        setOpenMenu(null);
    };

    const handleVideoUploadClick = () => {
        videoInputRef.current?.click();
        setOpenMenu(null);
    };

    const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            onAddImage(Array.from(files));
        }
        event.target.value = '';
    };

    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAddVideo(file);
        }
    };

    const handleShapeClick = (type: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right') => {
        onAddShape(type);
        setOpenMenu(null);
        onToolChange('select');
    };

    const toggleMenu = (menu: 'select' | 'upload' | 'shape' | 'draw') => {
        setOpenMenu((current) => current === menu ? null : menu);
    };

    return (
        <div ref={rootRef} className="pointer-events-none absolute left-3 top-1/2 z-50 hidden -translate-y-1/2 md:flex xl:left-4">
            <div className="workbench-panel-elevated pointer-events-auto flex flex-col items-center gap-1 rounded-2xl p-1.5">

                <div className="flex flex-col items-center gap-0.5">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => toggleMenu('select')}
                            className={`tool-btn flex h-9 w-9 items-center justify-center ${['select', 'hand', 'mark'].includes(activeTool) || openMenu === 'select' ? 'active' : ''}`}
                            title="选择 / 拖动 / 标记 (V/H/M)"
                        >
                            {activeTool === 'hand' ? <Hand size={17} /> : activeTool === 'mark' ? <MapPin size={17} /> : <MousePointer2 size={17} />}
                        </button>

                        {openMenu === 'select' && (
                            <div className="absolute left-full top-0 pl-3">
                                <div className="tool-menu-enter workbench-panel min-w-[180px] rounded-2xl p-1.5">
                                    <button
                                        type="button"
                                        onClick={() => { onToolChange('select'); setOpenMenu(null); }}
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${activeTool === 'select' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <span className="flex items-center gap-2.5"><MousePointer2 size={14} />选择</span>
                                        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold opacity-50">V</kbd>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { onToolChange('hand'); setOpenMenu(null); }}
                                        className={`mt-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${activeTool === 'hand' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <span className="flex items-center gap-2.5"><Hand size={14} />拖动</span>
                                        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold opacity-50">H</kbd>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { onToolChange('mark'); setOpenMenu(null); }}
                                        className={`mt-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${activeTool === 'mark' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <span className="flex items-center gap-2.5"><MapPin size={14} />标记</span>
                                        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold opacity-50">M</kbd>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => { onToolChange('frame'); setOpenMenu(null); }}
                        className={`tool-btn flex h-9 w-9 items-center justify-center ${activeTool === 'frame' ? 'active' : ''}`}
                        title="智能画板 (F)"
                    >
                        <Frame size={17} />
                    </button>
                </div>

                <div className="h-px w-6 bg-slate-200/80" />

                <div className="flex flex-col items-center gap-0.5">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => toggleMenu('upload')}
                            className={`tool-btn flex h-9 w-9 items-center justify-center ${openMenu === 'upload' ? 'active' : ''}`}
                            title="添加与生成"
                        >
                            <PlusSquare size={17} />
                        </button>

                        {openMenu === 'upload' && (
                            <div className="absolute left-full top-0 pl-3">
                                <div className="tool-menu-enter workbench-panel min-w-[200px] rounded-2xl p-1.5">
                                    <button onClick={handleImageUploadClick} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition-all hover:bg-slate-50">
                                        <ImageIcon size={14} className="text-slate-400" />上传图片
                                    </button>
                                    <button onClick={handleVideoUploadClick} className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition-all hover:bg-slate-50">
                                        <Video size={14} className="text-slate-400" />上传视频
                                    </button>
                                    <div className="my-1 h-px bg-slate-100" />
                                    <button
                                        onClick={() => {
                                            onOpenImageGenerator();
                                            setOpenMenu(null);
                                        }}
                                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-violet-700 transition-all hover:bg-violet-50"
                                    >
                                        <span className="flex items-center gap-2.5"><Sparkles size={14} className="text-violet-500" />图像生成器</span>
                                        <kbd className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">A</kbd>
                                    </button>
                                    {onOpenVideoGenerator && (
                                        <button
                                            onClick={() => {
                                                onOpenVideoGenerator();
                                                setOpenMenu(null);
                                            }}
                                            className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-violet-700 transition-all hover:bg-violet-50"
                                        >
                                            <Video size={14} className="text-violet-500" />视频生成器
                                        </button>
                                    )}
                                    {onOpenStoryboardPlanner && (
                                        <button
                                            onClick={() => {
                                                onOpenStoryboardPlanner();
                                                setOpenMenu(null);
                                            }}
                                            className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-sky-700 transition-all hover:bg-sky-50"
                                        >
                                            <LayoutGrid size={14} className="text-sky-500" />分镜规划器
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => toggleMenu('shape')}
                            className={`tool-btn flex h-9 w-9 items-center justify-center ${openMenu === 'shape' ? 'active' : ''}`}
                            title="形状"
                        >
                            <Square size={17} />
                        </button>

                        {openMenu === 'shape' && (
                            <div className="absolute left-full top-0 pl-3">
                                <div className="tool-menu-enter workbench-panel rounded-2xl p-1.5">
                                    <div className="flex gap-0.5 p-0.5">
                                        <button onClick={() => handleShapeClick('square')} className="rounded-xl p-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"><Square size={16} /></button>
                                        <button onClick={() => handleShapeClick('circle')} className="rounded-xl p-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"><Circle size={16} /></button>
                                        <button onClick={() => handleShapeClick('triangle')} className="rounded-xl p-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"><Triangle size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            onToolChange('text');
                            onAddText();
                            setOpenMenu(null);
                        }}
                        className={`tool-btn flex h-9 w-9 items-center justify-center ${activeTool === 'text' ? 'active' : ''}`}
                        title="文本 (T)"
                    >
                        <Type size={17} />
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => toggleMenu('draw')}
                            className={`tool-btn flex h-9 w-9 items-center justify-center ${activeTool === 'draw' || openMenu === 'draw' ? 'active' : ''}`}
                            title="画笔 (B)"
                        >
                            <Pencil size={17} />
                        </button>

                        {openMenu === 'draw' && (
                            <div className="absolute left-full top-0 pl-3">
                                <div className="tool-menu-enter workbench-panel min-w-[168px] rounded-2xl p-1.5">
                                    <button
                                        onClick={() => {
                                            onToolChange('draw');
                                            setOpenMenu(null);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${activeTool === 'draw' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <span className="flex items-center gap-2.5"><Pencil size={14} />画笔</span>
                                        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold opacity-50">B</kbd>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {openMenu && (
                    <button
                        type="button"
                        onClick={() => setOpenMenu(null)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-600"
                        title="收起菜单"
                    >
                        <X size={13} />
                    </button>
                )}

                <input
                    type="file"
                    ref={imageInputRef}
                    className="hidden"
                    aria-label="上传图片"
                    onChange={handleImageFileChange}
                    accept="image/*"
                    multiple
                />
                <input
                    type="file"
                    ref={videoInputRef}
                    className="hidden"
                    aria-label="上传视频"
                    onChange={handleVideoFileChange}
                    accept="video/*"
                />
            </div>
        </div>
    );
}
