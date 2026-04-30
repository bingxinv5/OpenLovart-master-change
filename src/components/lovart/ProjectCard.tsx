import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Image as ImageIcon, ImageOff, ImagePlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';

interface ProjectCardProps {
    id: string;
    title: string;
    date: string;
    imageUrl?: string;
    isMetadataPending?: boolean;
    onRename?: (id: string, newTitle: string) => void;
    onDelete?: (id: string) => void;
    onSetCover?: (id: string) => void;
    onClearCover?: (id: string) => void;
    onDuplicate?: (id: string) => void;
}

export function ProjectCard({
    id,
    title,
    date,
    imageUrl,
    isMetadataPending,
    onRename,
    onDelete,
    onSetCover,
    onClearCover,
    onDuplicate,
}: ProjectCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(title);
    const [imageError, setImageError] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleImageLoadState = useCallback((state: 'loading' | 'ready' | 'error') => {
        setImageError(state === 'error');
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        }

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showMenu]);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);

    const handleMenuClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu((prev) => !prev);
    };

    const handleRenameClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        setRenameValue(title);
        setIsRenaming(true);
    };

    const handleDeleteClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        onDelete?.(id);
    };

    const handleSetCoverClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        onSetCover?.(id);
    };

    const handleClearCoverClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        onClearCover?.(id);
    };

    const handleDuplicateClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        onDuplicate?.(id);
    };

    const handleRenameSubmit = (event?: React.FormEvent) => {
        event?.preventDefault();
        event?.stopPropagation();
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== title) {
            onRename?.(id, trimmed);
        }
        setIsRenaming(false);
    };

    const handleRenameKeyDown = (event: React.KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            setIsRenaming(false);
            setRenameValue(title);
        }
    };

    return (
        <article data-testid={`project-card-${id}`} className={`group relative min-w-0 ${showMenu ? 'z-20' : 'z-0'}`}>
            <div className="relative">
                {/* 图片占位：发丝边框 + 极浅底色 + 极小圆角 */}
                <div className="aspect-[4/3] overflow-hidden rounded-[3px] border border-[#EBEBEB] bg-black/[0.02]">
                    {imageUrl && !imageError ? (
                        <WorkbenchImage
                            content={imageUrl}
                            alt={title}
                            containerClassName="h-full w-full"
                            imageClassName="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03]"
                            onLoadStateChange={handleImageLoadState}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#C8C8C8]">
                            <ImageIcon size={20} strokeWidth={1.4} />
                        </div>
                    )}
                </div>

                {/* 常驻但弱化的更多操作按钮 */}
                <div ref={menuRef} className="absolute right-2 top-2 z-10">
                    <button
                        type="button"
                        data-testid={`project-menu-button-${id}`}
                        aria-label="项目更多操作"
                        title="项目更多操作"
                        onClick={handleMenuClick}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[#CCCCCC] transition-colors duration-200 hover:bg-white hover:text-[#1A1A1A] group-hover:text-[#9A9A9A]"
                    >
                        <MoreHorizontal size={16} strokeWidth={1.8} />
                    </button>

                    {showMenu && (
                        <div className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-[6px] border border-[#EBEBEB] bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                            <button
                                type="button"
                                data-testid={`project-rename-${id}`}
                                onClick={handleRenameClick}
                                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12.5px] text-[#1A1A1A] transition hover:bg-black/[0.03]"
                            >
                                <Pencil size={13} strokeWidth={1.6} /> 重命名
                            </button>
                            <button
                                type="button"
                                data-testid={`project-set-cover-${id}`}
                                onClick={handleSetCoverClick}
                                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12.5px] text-[#1A1A1A] transition hover:bg-black/[0.03]"
                            >
                                <ImagePlus size={13} strokeWidth={1.6} /> 设置封面
                            </button>
                            {imageUrl && !imageError && (
                                <button
                                    type="button"
                                    data-testid={`project-clear-cover-${id}`}
                                    onClick={handleClearCoverClick}
                                    className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12.5px] text-[#1A1A1A] transition hover:bg-black/[0.03]"
                                >
                                    <ImageOff size={13} strokeWidth={1.6} /> 清除封面
                                </button>
                            )}
                            <button
                                type="button"
                                data-testid={`project-duplicate-${id}`}
                                onClick={handleDuplicateClick}
                                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12.5px] text-[#1A1A1A] transition hover:bg-black/[0.03]"
                            >
                                <Copy size={13} strokeWidth={1.6} /> 复制项目
                            </button>
                            <div className="my-1 border-t border-[#F0F0F0]" />
                            <button
                                type="button"
                                data-testid={`project-delete-${id}`}
                                onClick={handleDeleteClick}
                                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12.5px] text-[#D24343] transition hover:bg-[#D24343]/[0.06]"
                            >
                                <Trash2 size={13} strokeWidth={1.6} /> 删除项目
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 文案区：与图片左边缘对齐，标题与日期之间留白 */}
            <div className="pt-4">
                {isRenaming ? (
                    <form onSubmit={handleRenameSubmit} onClick={(event) => event.preventDefault()}>
                        <input
                            ref={inputRef}
                            type="text"
                            aria-label="项目名称"
                            placeholder="输入项目名称"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={() => handleRenameSubmit()}
                            onKeyDown={handleRenameKeyDown}
                            className="w-full rounded-[3px] border border-[#EBEBEB] bg-white px-2 py-1 text-[13px] font-medium text-[#1A1A1A] outline-none transition focus:border-[#1A1A1A]"
                            maxLength={50}
                        />
                    </form>
                ) : (
                    <h3
                        className="truncate text-[13px] font-medium tracking-tight text-[#222222] transition-colors duration-300 group-hover:text-[#000000]"
                        title={title}
                    >
                        {title}
                    </h3>
                )}
                <p className="mt-1.5 text-[11px] tracking-[0.05em] text-[#9A9A9A]">
                    {date}
                    {isMetadataPending ? ' · 整理中' : ''}
                </p>
            </div>
        </article>
    );
}
