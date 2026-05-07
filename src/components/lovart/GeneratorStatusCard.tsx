"use client";

import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

type GeneratorKind = 'image' | 'video';
type GeneratorStatusTone = 'idle' | 'submitting' | 'queued' | 'running' | 'finishing' | 'error';

export interface GeneratorStatusState {
    tone: GeneratorStatusTone;
    showStatus: boolean;
    badgeLabel: string;
    title: string;
    description: string;
    progress: number;
    showProgress: boolean;
    buttonLabel: string;
    buttonBusy: boolean;
}

interface GeneratorStatusInput {
    kind: GeneratorKind;
    isSubmitting: boolean;
    isGeneratingTask: boolean;
    progress: number;
    error: string | null;
}

const ACCENT_STYLES: Record<GeneratorKind, {
    panel: string;
    badge: string;
    bar: string;
    spinner: string;
}> = {
    image: {
        panel: 'canvas-generator-status-card is-image',
        badge: 'canvas-generator-badge text-blue-700',
        bar: 'bg-blue-500',
        spinner: 'text-blue-600',
    },
    video: {
        panel: 'canvas-generator-status-card is-video',
        badge: 'canvas-generator-badge text-slate-700',
        bar: 'bg-slate-900',
        spinner: 'text-slate-700',
    },
};

export function getGeneratorStatusState({
    kind,
    isSubmitting,
    isGeneratingTask,
    progress,
    error,
}: GeneratorStatusInput): GeneratorStatusState {
    const noun = kind === 'image' ? '图片' : '视频';

    if (error) {
        return {
            tone: 'error',
            showStatus: false,
            badgeLabel: '失败',
            title: `${noun}生成失败`,
            description: error,
            progress: 0,
            showProgress: false,
            buttonLabel: '重试生成',
            buttonBusy: false,
        };
    }

    if (isSubmitting && !isGeneratingTask) {
        return {
            tone: 'submitting',
            showStatus: true,
            badgeLabel: '提交中',
            title: `正在提交${noun}生成请求`,
            description: '请求已发出，结果会显示在当前生成器位置。',
            progress: 8,
            showProgress: true,
            buttonLabel: '提交中...',
            buttonBusy: true,
        };
    }

    if (isGeneratingTask && progress <= 0) {
        return {
            tone: 'queued',
            showStatus: true,
            badgeLabel: '排队中',
            title: `${noun}任务已创建`,
            description: `正在等待${noun}服务开始处理，结果会显示在当前位置。`,
            progress: 6,
            showProgress: true,
            buttonLabel: '排队中...',
            buttonBusy: true,
        };
    }

    if (isGeneratingTask && progress < 85) {
        return {
            tone: 'running',
            showStatus: true,
            badgeLabel: '生成中',
            title: `正在生成${noun}`,
            description: kind === 'image' ? '正在渲染内容与细节，完成后会显示在当前位置。' : '正在生成镜头与时序内容，完成后会显示在当前位置。',
            progress: Math.max(progress, 10),
            showProgress: true,
            buttonLabel: `生成中${progress > 0 ? ` ${progress}%` : '...'}`,
            buttonBusy: true,
        };
    }

    if (isGeneratingTask) {
        return {
            tone: 'finishing',
            showStatus: true,
            badgeLabel: '整理中',
            title: `${noun}即将完成`,
            description: kind === 'image' ? '正在整理结果并回写到画布当前位置。' : '正在整理结果并准备视频输出到当前位置。',
            progress: Math.max(progress, 85),
            showProgress: true,
            buttonLabel: '即将完成...',
            buttonBusy: true,
        };
    }

    return {
        tone: 'idle',
        showStatus: false,
        badgeLabel: '',
        title: '',
        description: '',
        progress: 0,
        showProgress: false,
        buttonLabel: '生成',
        buttonBusy: false,
    };
}

interface GeneratorStatusCardProps {
    kind: GeneratorKind;
    state: GeneratorStatusState;
}

export function GeneratorStatusCard({ kind, state }: GeneratorStatusCardProps) {
    if (!state.showStatus) {
        return null;
    }

    const accent = ACCENT_STYLES[kind];
    const progressWidth = Math.max(state.progress, 5);
    const progressClassName = buildFloatingPanelPositionClassName('generator-status-progress', `${kind}-${state.tone}-${Math.round(progressWidth)}`);
    const progressCss = `.${progressClassName} { width: ${progressWidth}%; }`;

    return (
        <div className={`mx-4 mb-3 rounded-xl border px-3 py-2.5 shadow-sm ${accent.panel}`}>
            <div className="mb-2 flex items-start gap-2">
                <div className="mt-0.5 shrink-0">
                    {state.tone === 'error' ? (
                        <AlertCircle size={15} className="text-red-500" />
                    ) : (
                        <Loader2 size={15} className={`animate-spin ${accent.spinner}`} />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${accent.badge}`}>
                            {state.badgeLabel}
                        </span>
                        {state.progress > 0 && state.showProgress && (
                            <span className="text-[11px] text-slate-500">{Math.round(state.progress)}%</span>
                        )}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-800">{state.title}</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-slate-500">{state.description}</div>
                </div>
            </div>

            {state.showProgress && (
                <div className="canvas-progress-track h-1.5 overflow-hidden rounded-full">
                    <style>{progressCss}</style>
                    <div
                        className={`${progressClassName} h-full rounded-full transition-all duration-300 ${accent.bar}`}
                    />
                </div>
            )}
        </div>
    );
}