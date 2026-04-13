"use client";

import React from 'react';
import { X } from 'lucide-react';

interface PanelShellProps {
    icon: React.ReactNode;
    title: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    onClose?: () => void;
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
}

export function PanelShell({
    icon,
    title,
    badge,
    actions,
    onClose,
    children,
    className,
    'data-testid': testId,
}: PanelShellProps) {
    return (
        <div
            data-testid={testId}
            className={`pointer-events-auto flex h-full w-[280px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${className ?? ''}`}
        >
            <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-slate-100 px-3">
                <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-800 text-white">
                        {icon}
                    </div>
                    <span className="truncate text-[13px] font-semibold text-slate-900">{title}</span>
                    {badge}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    {actions}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={`关闭${title}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

export function PanelBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-semibold tabular-nums text-slate-500">
            {children}
        </span>
    );
}
