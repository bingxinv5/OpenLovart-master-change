import type { CanvasAreaDomains } from '@/components/lovart/canvas-area-domains';

export type BuildCanvasAreaDomainsParams = CanvasAreaDomains;

export function buildCanvasAreaDomains(params: BuildCanvasAreaDomainsParams): CanvasAreaDomains {
    return {
        selection: params.selection,
        view: params.view,
        elementCRUD: params.elementCRUD,
        clipboard: params.clipboard,
        layout: params.layout,
        generator: params.generator,
        media: params.media,
        editingTools: params.editingTools,
        export: params.export,
        canvasSelectMode: params.canvasSelectMode,
        storyboard: params.storyboard,
        misc: params.misc,
    };
}