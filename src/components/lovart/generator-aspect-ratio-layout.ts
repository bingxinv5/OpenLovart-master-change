type GeneratorAspectRatioElement = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    selectedAspectRatio?: string;
};

type GeneratorAspectRatioLayoutOptions = {
    fallbackWidth: number;
    fallbackHeight: number;
};

type GeneratorAspectRatioBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

function parseGeneratorAspectRatio(value: string | undefined | null) {
    if (!value || value === 'auto') {
        return null;
    }

    const matched = value.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (!matched) {
        return null;
    }

    const width = Number.parseInt(matched[1], 10);
    const height = Number.parseInt(matched[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }

    return { width, height };
}

function sameNumber(left: number | undefined, right: number) {
    return Math.abs((left ?? 0) - right) < 0.5;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(value, max));
}

export function resolveGeneratorAspectRatioBounds(
    aspectRatio: string | undefined | null,
    element: GeneratorAspectRatioElement | undefined | null,
    options: GeneratorAspectRatioLayoutOptions,
): GeneratorAspectRatioBounds | null {
    const parsed = parseGeneratorAspectRatio(aspectRatio);
    if (!parsed) {
        return null;
    }

    const currentX = Number.isFinite(element?.x) ? element?.x ?? 0 : 0;
    const currentY = Number.isFinite(element?.y) ? element?.y ?? 0 : 0;
    const currentWidth = Number.isFinite(element?.width) && (element?.width ?? 0) > 0
        ? element?.width ?? options.fallbackWidth
        : options.fallbackWidth;
    const currentHeight = Number.isFinite(element?.height) && (element?.height ?? 0) > 0
        ? element?.height ?? options.fallbackHeight
        : options.fallbackHeight;
    const targetRatio = parsed.width / parsed.height;
    const fallbackShortSide = Math.max(1, Math.min(options.fallbackWidth, options.fallbackHeight));
    const fallbackLongSide = Math.max(fallbackShortSide, Math.max(options.fallbackWidth, options.fallbackHeight));
    const baseShortSide = clampNumber(Math.min(currentWidth, currentHeight), fallbackShortSide, fallbackLongSide);
    const nextWidth = targetRatio >= 1
        ? Math.max(1, Math.round(baseShortSide * targetRatio))
        : baseShortSide;
    const nextHeight = targetRatio >= 1
        ? baseShortSide
        : Math.max(1, Math.round(baseShortSide / targetRatio));

    return {
        x: Math.round(currentX + (currentWidth - nextWidth) / 2),
        y: Math.round(currentY + (currentHeight - nextHeight) / 2),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
    };
}

export function buildGeneratorAspectRatioPatch(
    aspectRatio: string | undefined | null,
    element: GeneratorAspectRatioElement | undefined | null,
    options: GeneratorAspectRatioLayoutOptions,
): Record<string, unknown> | null {
    if (!element) {
        return null;
    }

    const patch: Record<string, unknown> = {};
    if (aspectRatio && element.selectedAspectRatio !== aspectRatio) {
        patch.selectedAspectRatio = aspectRatio;
    }

    const bounds = resolveGeneratorAspectRatioBounds(aspectRatio, element, options);
    if (bounds) {
        if (!sameNumber(element.x, bounds.x)) patch.x = bounds.x;
        if (!sameNumber(element.y, bounds.y)) patch.y = bounds.y;
        if (!sameNumber(element.width, bounds.width)) patch.width = bounds.width;
        if (!sameNumber(element.height, bounds.height)) patch.height = bounds.height;
    }

    return Object.keys(patch).length > 0 ? patch : null;
}