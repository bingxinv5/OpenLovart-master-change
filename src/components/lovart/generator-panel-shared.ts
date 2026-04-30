"use client";

import { useEffect } from 'react';

export type GeneratorCanvasElement = {
	id: string;
	type: string;
	content?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	referenceImageId?: string;
	selectedModel?: string;
	selectedAspectRatio?: string;
	selectedGenerateCount?: number;
	selectedImageSize?: string;
	selectedImageQuality?: string;
	selectedDuration?: string;
	selectedEnhancePrompt?: boolean;
	selectedDomesticMode?: string;
	selectedResolution?: string;
	selectedGenerateAudio?: boolean;
	generationResultIndex?: number;
	savedPrompt?: string;
	savedPromptMentionBindings?: string;
	savedPromptMentionIds?: string;
	savedReferenceImage?: string;
	savedReferenceImages?: string;
	savedFrameImages?: string;
	savedReferenceVideos?: string;
	savedReferenceAudios?: string;
	generatingTaskId?: string;
	generatingProgress?: number;
	generatingError?: string;
	sourceGenerationTaskId?: string;
	sourceGenerationTaskType?: 'image' | 'video';
	legacyMigrationVersion?: number;
};

export type ElementChangeHandler = (id: string, attrs: Record<string, unknown>) => void;

type CanvasImageSelectedDetail = {
	generatorId?: string;
	imageContent?: string;
	imageType?: 'first_frame' | 'last_frame' | 'reference';
};

export function findGeneratorElement(
	canvasElements: GeneratorCanvasElement[] | undefined,
	elementId: string,
) {
	return canvasElements?.find((element) => element.id === elementId);
}

export function getCanvasImageElements(canvasElements: GeneratorCanvasElement[] | undefined) {
	if (!canvasElements) return [];
	return canvasElements.filter((element) => element.type === 'image' && !!element.content);
}

export function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export function useCanvasImageSelectionEvent(
	elementId: string,
	onSelect: (detail: CanvasImageSelectedDetail) => void,
) {
	useEffect(() => {
		const handler = (event: Event) => {
			const detail = (event as CustomEvent<CanvasImageSelectedDetail>).detail;
			if (detail?.generatorId === elementId && detail.imageContent) {
				onSelect(detail);
			}
		};

		window.addEventListener('canvas-image-selected', handler);
		return () => window.removeEventListener('canvas-image-selected', handler);
	}, [elementId, onSelect]);
}
