export const CANVAS_SELECTED_MODEL_STORAGE_KEY = 'lovart_selected_model';
export const DEFAULT_CANVAS_SELECTED_MODEL = 'gemini-3.1-pro-preview';

export function loadCanvasSelectedModel() {
    if (typeof window === 'undefined') return DEFAULT_CANVAS_SELECTED_MODEL;

    try {
        return window.localStorage.getItem(CANVAS_SELECTED_MODEL_STORAGE_KEY) || DEFAULT_CANVAS_SELECTED_MODEL;
    } catch {
        return DEFAULT_CANVAS_SELECTED_MODEL;
    }
}

export function saveCanvasSelectedModel(model: string) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(CANVAS_SELECTED_MODEL_STORAGE_KEY, model);
    } catch {
        // Ignore storage quota / privacy mode failures.
    }
}
