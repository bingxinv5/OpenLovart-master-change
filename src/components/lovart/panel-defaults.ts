import type { CanvasElement } from './canvas-types';

export function buildDefaultNamePrefix(element: CanvasElement) {
  const raw = element.displayName?.trim()
    || element.annotationTitle?.trim()
    || element.frameName?.trim()
    || element.savedPrompt?.trim()
    || '';

  if (!raw) return '';
  return raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
}