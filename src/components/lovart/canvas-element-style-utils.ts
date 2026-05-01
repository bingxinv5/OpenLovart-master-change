export function toCanvasElementPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

export function sanitizeElementCssColor(value: string | undefined, fallback = '#FFFFFF') {
    const color = (value || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}
