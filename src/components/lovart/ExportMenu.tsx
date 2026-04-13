import React from 'react';
import { Download } from 'lucide-react';
import type { CanvasElementExportFormat } from './canvas-types';
import { getMediaExportOptions } from './export-format-options';

interface ExportMenuProps {
    kind: 'image' | 'video';
    onSelect: (format: CanvasElementExportFormat) => void;
    className?: string;
}

export function ExportMenu({ kind, onSelect, className = 'w-48' }: ExportMenuProps) {
    const options = getMediaExportOptions(kind);

    return (
        <div className={`rounded-[14px] border border-slate-200/60 bg-white/96 backdrop-blur-xl p-2 shadow-xl ${className}`.trim()}>
            <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {kind === 'video' ? '导出视频' : '导出格式'}
            </div>
            <div className={`grid gap-1.5 ${options.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {options.map((item) => (
                    <button
                        key={`${kind}-${item.format}-${item.label}`}
                        onClick={() => onSelect(item.format)}
                        className="flex items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                        <Download size={12} className="text-slate-400" />
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
