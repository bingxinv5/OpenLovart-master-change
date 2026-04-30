"use client";

import type React from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { StoryboardExportPanel } from '@/components/lovart/StoryboardExportPanel';
import { getElementBaseName, sanitizeFilenameStem } from './canvas-element-naming';

type StoryboardExportPanelProps = React.ComponentProps<typeof StoryboardExportPanel>;

interface StoryboardExportSelectionProps {
    isOpen: boolean;
    selectedElements: CanvasElement[];
    isSubmitting: boolean;
    submitStatusText: string;
    onApplyToCanvas: NonNullable<StoryboardExportPanelProps['onApplyToCanvas']>;
    onLocateItem: NonNullable<StoryboardExportPanelProps['onLocateItem']>;
    onCancelSubmit: NonNullable<StoryboardExportPanelProps['onCancelSubmit']>;
    onClose: StoryboardExportPanelProps['onClose'];
    onSubmit: StoryboardExportPanelProps['onSubmit'];
}

export function StoryboardExportSelection({
    isOpen,
    selectedElements,
    isSubmitting,
    submitStatusText,
    onApplyToCanvas,
    onLocateItem,
    onCancelSubmit,
    onClose,
    onSubmit,
}: StoryboardExportSelectionProps) {
    if (!isOpen || selectedElements.length < 2) {
        return null;
    }

    return (
        <StoryboardExportPanel
            selectedCount={selectedElements.length}
            defaultFileName={sanitizeFilenameStem(
                `${getElementBaseName(selectedElements[0])} 分镜表 ${selectedElements.length}张`,
                'lovart-storyboard',
            )}
            items={selectedElements.map((item) => ({
                id: item.id,
                content: item.content || '',
                displayName: item.displayName || '',
                prompt: item.savedPrompt || '',
                annotationTitle: item.annotationTitle || '',
                annotationNote: item.annotationNote || '',
                storyboardShotCode: item.storyboardShotCode || '',
                storyboardSceneType: item.storyboardSceneType || '',
                storyboardCameraMove: item.storyboardCameraMove || '',
                storyboardDuration: item.storyboardDuration || '',
                storyboardNote: item.storyboardNote || '',
            }))}
            isSubmitting={isSubmitting}
            submitStatusText={submitStatusText}
            onApplyToCanvas={onApplyToCanvas}
            onLocateItem={onLocateItem}
            onCancelSubmit={onCancelSubmit}
            onClose={onClose}
            onSubmit={onSubmit}
        />
    );
}