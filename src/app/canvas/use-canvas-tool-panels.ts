import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    beginImageToolSubmission as startImageToolSubmission,
    endImageToolSubmission as finishImageToolSubmission,
    ensureImageToolSource as validateImageToolSource,
} from './image-tool-submission';
import type { CanvasToastType } from './canvas-feedback';
import {
    loadStoryboardOverviewPrefs,
    persistStoryboardOverviewPrefs,
} from './canvas-session-prefs';
import type {
    StoryboardAuditFilter,
    StoryboardNavigationScope,
} from './canvas-runtime-types';

export interface UseCanvasToolPanelsParams {
    currentProjectId: string | null;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasToolPanels({ currentProjectId, showToast }: UseCanvasToolPanelsParams) {
    const [storyboardPlannerSourceElementId, setStoryboardPlannerSourceElementId] = useState<string | null>(null);
    const [isStoryboardExportOpen, setIsStoryboardExportOpen] = useState(false);
    const [isStoryboardExportSubmitting, setIsStoryboardExportSubmitting] = useState(false);
    const [storyboardExportSubmitStatus, setStoryboardExportSubmitStatus] = useState('');
    const [annotateImageTargetId, setAnnotateImageTargetId] = useState<string | null>(null);
    const [isAnnotateImageSubmitting, setIsAnnotateImageSubmitting] = useState(false);
    const [annotateImageSubmitStatus, setAnnotateImageSubmitStatus] = useState('');
    const [cropImageTargetId, setCropImageTargetId] = useState<string | null>(null);
    const [isCropImageSubmitting, setIsCropImageSubmitting] = useState(false);
    const [cropImageSubmitStatus, setCropImageSubmitStatus] = useState('');
    const [splitStoryboardTargetId, setSplitStoryboardTargetId] = useState<string | null>(null);
    const [isSplitStoryboardSubmitting, setIsSplitStoryboardSubmitting] = useState(false);
    const [splitStoryboardSubmitStatus, setSplitStoryboardSubmitStatus] = useState('');
    const [autoAdvanceStoryboardIssues, setAutoAdvanceStoryboardIssues] = useState(false);
    const [autoAdvanceStoryboardScope, setAutoAdvanceStoryboardScope] = useState<StoryboardNavigationScope>('issues');
    const [storyboardAuditFilter, setStoryboardAuditFilter] = useState<StoryboardAuditFilter>('all');
    const [storyboardOverviewCollapsed, setStoryboardOverviewCollapsed] = useState(false);

    useEffect(() => {
        const prefs = loadStoryboardOverviewPrefs(currentProjectId);
        if (!prefs) {
            setStoryboardOverviewCollapsed(false);
            setAutoAdvanceStoryboardIssues(false);
            setAutoAdvanceStoryboardScope('issues');
            setStoryboardAuditFilter('all');
            return;
        }

        setStoryboardOverviewCollapsed(prefs.collapsed);
        setAutoAdvanceStoryboardIssues(prefs.autoAdvanceEnabled);
        setAutoAdvanceStoryboardScope(prefs.autoAdvanceScope);
        setStoryboardAuditFilter(prefs.auditFilter);
    }, [currentProjectId]);

    useEffect(() => {
        persistStoryboardOverviewPrefs(currentProjectId, {
            collapsed: storyboardOverviewCollapsed,
            autoAdvanceEnabled: autoAdvanceStoryboardIssues,
            autoAdvanceScope: autoAdvanceStoryboardScope,
            auditFilter: storyboardAuditFilter,
        });
    }, [autoAdvanceStoryboardIssues, autoAdvanceStoryboardScope, currentProjectId, storyboardAuditFilter, storyboardOverviewCollapsed]);

    const beginImageToolSubmission = useCallback((params: {
        setSubmitting: Dispatch<SetStateAction<boolean>>;
        setStatus: Dispatch<SetStateAction<string>>;
        loadingToast: string;
    }) => {
        startImageToolSubmission({
            ...params,
            showToast,
        });
    }, [showToast]);

    const endImageToolSubmission = useCallback((
        setSubmitting: Dispatch<SetStateAction<boolean>>,
        setStatus: Dispatch<SetStateAction<string>>,
    ) => {
        finishImageToolSubmission(setSubmitting, setStatus);
    }, []);

    const ensureImageToolSource = useCallback((
        element: CanvasElement,
        errorMessage: string,
    ): element is CanvasElement & { type: 'image'; content: string } => {
        return validateImageToolSource(element, errorMessage, showToast);
    }, [showToast]);

    return {
        storyboardPlannerSourceElementId,
        setStoryboardPlannerSourceElementId,
        isStoryboardExportOpen,
        setIsStoryboardExportOpen,
        isStoryboardExportSubmitting,
        setIsStoryboardExportSubmitting,
        storyboardExportSubmitStatus,
        setStoryboardExportSubmitStatus,
        annotateImageTargetId,
        setAnnotateImageTargetId,
        isAnnotateImageSubmitting,
        setIsAnnotateImageSubmitting,
        annotateImageSubmitStatus,
        setAnnotateImageSubmitStatus,
        cropImageTargetId,
        setCropImageTargetId,
        isCropImageSubmitting,
        setIsCropImageSubmitting,
        cropImageSubmitStatus,
        setCropImageSubmitStatus,
        splitStoryboardTargetId,
        setSplitStoryboardTargetId,
        isSplitStoryboardSubmitting,
        setIsSplitStoryboardSubmitting,
        splitStoryboardSubmitStatus,
        setSplitStoryboardSubmitStatus,
        autoAdvanceStoryboardIssues,
        setAutoAdvanceStoryboardIssues,
        autoAdvanceStoryboardScope,
        setAutoAdvanceStoryboardScope,
        storyboardAuditFilter,
        setStoryboardAuditFilter,
        storyboardOverviewCollapsed,
        setStoryboardOverviewCollapsed,
        beginImageToolSubmission,
        endImageToolSubmission,
        ensureImageToolSource,
    };
}