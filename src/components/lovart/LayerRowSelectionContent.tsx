import React from 'react';
import {
    Frame,
    Image as ImageIcon,
    Pencil,
    Shapes,
    Sparkles,
    Square,
    Type,
    Video,
} from 'lucide-react';
import type { CanvasElement } from './canvas-types';
import { getLayerLabel } from './layers-tree-model';
import { getStoryboardSummaryParts } from './layers-panel-utils';

function LayerTypeIcon({ element, size }: { element: CanvasElement; size: number }) {
    switch (element.type) {
        case 'image':
            return <ImageIcon size={size} />;
        case 'text':
            return <Type size={size} />;
        case 'shape':
            return <Shapes size={size} />;
        case 'path':
            return <Pencil size={size} />;
        case 'video':
            return <Video size={size} />;
        case 'image-generator':
        case 'video-generator':
            return <Sparkles size={size} />;
        case 'frame':
            return <Frame size={size} />;
        default:
            return <Square size={size} />;
    }
}

interface LayerRowSelectionContentProps {
    element: CanvasElement;
    selected: boolean;
    hidden: boolean;
    locked: boolean;
    hasChildren: boolean;
    childrenCount: number;
    isEditingName: boolean;
    editingNameValue: string;
    onStartRename: (element: CanvasElement) => void;
    onSetEditingNameValue: (value: string) => void;
    onCancelRename: () => void;
    onCommitRename: () => void;
}

export function LayerRowSelectionContent({
    element,
    selected,
    hidden,
    locked,
    hasChildren,
    childrenCount,
    isEditingName,
    editingNameValue,
    onStartRename,
    onSetEditingNameValue,
    onCancelRename,
    onCommitRename,
}: LayerRowSelectionContentProps) {
    const storyboardSummaryParts = getStoryboardSummaryParts(element);
    const storyboardNote = element.storyboardNote?.trim();

    return (
        <>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${selected ? 'bg-violet-100 text-blue-700 ring-violet-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                <LayerTypeIcon element={element} size={14} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                    {isEditingName ? (
                        <input
                            data-testid={`layer-name-input-${element.id}`}
                            title="重命名图层"
                            value={editingNameValue}
                            autoFocus
                            onChange={(event) => onSetEditingNameValue(event.target.value)}
                            onBlur={onCommitRename}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === 'Enter') onCommitRename();
                                if (event.key === 'Escape') {
                                    onCancelRename();
                                }
                            }}
                            className="h-6 min-w-0 max-w-[160px] rounded border border-blue-200 bg-white px-1.5 text-[12px] font-medium text-slate-800 outline-none ring-2 ring-blue-100"
                        />
                    ) : (
                        <span
                            className="truncate text-[12px] font-medium text-slate-800"
                            title="双击重命名"
                            onDoubleClick={(event) => {
                                event.stopPropagation();
                                onStartRename(element);
                            }}
                        >
                            {getLayerLabel(element)}
                        </span>
                    )}
                    {element.groupFrame && (
                        <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-semibold text-blue-700">组</span>
                    )}
                    {element.type === 'frame' && !element.groupFrame && (
                        <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold text-sky-700">板</span>
                    )}
                    {hidden && <span className="rounded bg-slate-100 px-1 py-px text-[9px] text-slate-500">隐</span>}
                    {locked && <span className="rounded bg-amber-50 px-1 py-px text-[9px] text-amber-600">锁</span>}
                    {hasChildren && <span className="text-[9px] text-slate-400">{childrenCount}</span>}
                </div>
                {element.type === 'image' && (storyboardSummaryParts.length > 0 || storyboardNote) && (
                    <div className="mt-px flex flex-wrap items-center gap-0.5">
                        {storyboardSummaryParts.map((part, index) => (
                            <span
                                key={`${element.id}-storyboard-${index}-${part}`}
                                className="rounded border border-amber-200/70 bg-amber-50/80 px-1 py-px text-[8px] font-medium text-amber-700"
                            >
                                {part}
                            </span>
                        ))}
                        {storyboardNote && (
                            <span
                                className="max-w-[120px] truncate rounded border border-slate-200/70 bg-slate-50/80 px-1 py-px text-[8px] text-slate-500"
                                title={storyboardNote}
                            >
                                {storyboardNote}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
