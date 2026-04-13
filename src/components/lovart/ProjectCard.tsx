import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal, Pencil, Trash2, FolderOpen, Star, ImagePlus, ImageOff, Copy } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';

interface ProjectCardProps {
    id: string;
    title: string;
    date: string;
    imageUrl?: string;
    elementCount?: number;
    isMetadataPending?: boolean;
    isFavorite?: boolean;
    selected?: boolean;
    onToggleFavorite?: (id: string) => void;
    onRename?: (id: string, newTitle: string) => void;
    onDelete?: (id: string) => void;
    onSetCover?: (id: string) => void;
    onClearCover?: (id: string) => void;
    onDuplicate?: (id: string) => void;
}

export function ProjectCard({ id, title, date, imageUrl, elementCount, isMetadataPending, isFavorite, selected, onToggleFavorite, onRename, onDelete, onSetCover, onClearCover, onDuplicate }: ProjectCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(title);
    const [imageError, setImageError] = useState(false);

    const handleImageLoadState = useCallback((state: 'loading' | 'ready' | 'error') => {
        setImageError(state === 'error');
    }, []);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

    const handleMenuClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(!showMenu);
    };

    const handleRenameClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        setRenameValue(title);
        setIsRenaming(true);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        onDelete?.(id);
    };

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorite?.(id);
    };

    const handleSetCoverClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        onSetCover?.(id);
    };

    const handleClearCoverClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        onClearCover?.(id);
    };

    const handleDuplicateClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
        onDuplicate?.(id);
    };

    const handleRenameSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== title) {
            onRename?.(id, trimmed);
        }
        setIsRenaming(false);
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            setIsRenaming(false);
            setRenameValue(title);
        }
    };

    return (
        <div data-testid={`project-card-${id}`} className={`group relative cursor-pointer overflow-hidden rounded-lg bg-white border transition-all duration-150 hover:shadow-md ${selected ? 'border-gray-900 ring-2 ring-gray-900/15' : 'border-gray-200/70 hover:border-gray-300'}`}>
            {/* Image Area — compact 16:10 */}
            <div className="relative aspect-[16/10] overflow-hidden bg-gray-50">
                {imageUrl && !imageError ? (
                    <WorkbenchImage
                        content={imageUrl}
                        alt={title}
                        containerClassName="w-full h-full"
                        imageClassName="transition-transform duration-400 group-hover:scale-[1.03]"
                        onLoadStateChange={handleImageLoadState}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-slate-100">
                        <FolderOpen size={20} strokeWidth={1.5} className="text-gray-300" />
                    </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

                {/* Favorite btn */}
                <button
                    type="button"
                    onClick={handleFavoriteClick}
                    data-testid={`project-favorite-${id}`}
                    className={`absolute top-1.5 right-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 ${
                        isFavorite
                            ? 'bg-amber-50 text-amber-500 border border-amber-200'
                            : 'bg-white/90 text-gray-400 border border-gray-200/60 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                    }`}
                    aria-label={isFavorite ? '取消收藏' : '收藏'}
                >
                    <Star size={10} className={isFavorite ? 'fill-current' : ''} />
                </button>

                {/* Menu button */}
                <div className="absolute top-1.5 left-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150" ref={menuRef}>
                    <button
                        onClick={handleMenuClick}
                        data-testid={`project-menu-button-${id}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 border border-gray-200/60 transition hover:bg-white"
                    >
                        <MoreHorizontal size={12} className="text-gray-600" />
                    </button>

                    {showMenu && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-[130px] rounded-lg border border-gray-100 bg-white py-0.5 shadow-xl">
                            <button data-testid={`project-rename-${id}`} onClick={handleRenameClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                                <Pencil size={12} /> 重命名
                            </button>
                            <button data-testid={`project-set-cover-${id}`} onClick={handleSetCoverClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                                <ImagePlus size={12} /> 设置封面
                            </button>
                            {imageUrl && !imageError && (
                                <button data-testid={`project-clear-cover-${id}`} onClick={handleClearCoverClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                                    <ImageOff size={12} /> 清除封面
                                </button>
                            )}
                            <button data-testid={`project-duplicate-${id}`} onClick={handleDuplicateClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                                <Copy size={12} /> 复制项目
                            </button>
                            <div className="my-0.5 border-t border-gray-100" />
                            <button data-testid={`project-delete-${id}`} onClick={handleDeleteClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 size={12} /> 删除
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content — tight */}
            <div className="px-2.5 py-2">
                {isRenaming ? (
                    <form onSubmit={handleRenameSubmit} onClick={e => e.preventDefault()}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameSubmit()}
                            onKeyDown={handleRenameKeyDown}
                            className="w-full px-1.5 py-0.5 text-[12px] font-medium text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                            maxLength={50}
                        />
                    </form>
                ) : (
                    <h3 className="text-[12px] font-semibold leading-4 text-gray-900 truncate" title={title}>{title}</h3>
                )}
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                    <p className="truncate">{date}</p>
                    <span className={`shrink-0 ${isMetadataPending ? 'text-blue-500' : 'text-gray-400'}`}>
                        {typeof elementCount === 'number' ? `${elementCount} 项` : (isMetadataPending ? '补算中' : '待补算')}
                    </span>
                </div>
            </div>
        </div>
    );
}
