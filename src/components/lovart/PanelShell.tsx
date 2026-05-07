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
            className={`canvas-theme-panel pointer-events-auto flex h-full w-[280px] flex-col overflow-hidden rounded-xl ${className ?? ''}`}
        >
            <div className="canvas-panel-header flex h-9 shrink-0 items-center justify-between gap-1 px-3">
                <div className="flex items-center gap-1.5 min-w-0">
                    <div className="canvas-panel-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-md">
                        {icon}
                    </div>
                    <span className="canvas-panel-title truncate text-[13px] font-semibold">{title}</span>
                    {badge}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    {actions}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={`关闭${title}`}
                            className="canvas-panel-close flex h-6 w-6 items-center justify-center rounded-md transition-colors"
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
        <span className="canvas-panel-badge rounded px-1 py-px text-[10px] font-semibold tabular-nums">
            {children}
        </span>
    );
}
