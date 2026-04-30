import type React from 'react';
import { CanvasHistorySidebar } from '@/components/lovart/CanvasHistorySidebar';
import { LayersPanel } from '@/components/lovart/LayersPanel';
import { ProjectMediaPanel } from '@/components/lovart/ProjectMediaPanel';
import { ProjectReferencePanel } from '@/components/lovart/ProjectReferencePanel';

type LayersPanelProps = React.ComponentProps<typeof LayersPanel>;
type CanvasHistorySidebarProps = React.ComponentProps<typeof CanvasHistorySidebar>;
type ProjectMediaPanelProps = React.ComponentProps<typeof ProjectMediaPanel>;
type ProjectReferencePanelProps = React.ComponentProps<typeof ProjectReferencePanel>;

interface CanvasSideDockPanelsProps {
    showLayers: boolean;
    showHistory: boolean;
    showMedia: boolean;
    showReferences: boolean;
    sideDockOffset: number;
    layersProps: LayersPanelProps;
    historyProps: CanvasHistorySidebarProps;
    mediaProps: ProjectMediaPanelProps;
    referenceProps: ProjectReferencePanelProps;
}

export function CanvasSideDockPanels({
    showLayers,
    showHistory,
    showMedia,
    showReferences,
    sideDockOffset,
    layersProps,
    historyProps,
    mediaProps,
    referenceProps,
}: CanvasSideDockPanelsProps) {
    const sidePanelStyleSheet = `
.canvas-side-panel-layers { right: ${sideDockOffset}px; }
.canvas-side-panel-history { right: ${sideDockOffset + (showLayers ? 328 : 0)}px; }
.canvas-side-panel-media { right: ${sideDockOffset + (showLayers ? 328 : 0) + (showHistory ? 328 : 0)}px; }
.canvas-side-panel-references { right: ${sideDockOffset + (showLayers ? 328 : 0) + (showHistory ? 328 : 0) + (showMedia ? 328 : 0)}px; }
`;

    return (
        <>
            <style>{sidePanelStyleSheet}</style>
            {showLayers && (
                <div className="canvas-side-panel-layers absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300">
                    <LayersPanel {...layersProps} />
                </div>
            )}
            {showHistory && (
                <div className="canvas-side-panel-history absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300">
                    <CanvasHistorySidebar {...historyProps} />
                </div>
            )}
            {showMedia && (
                <div className="canvas-side-panel-media absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300">
                    <ProjectMediaPanel {...mediaProps} />
                </div>
            )}
            {showReferences && (
                <div className="canvas-side-panel-references absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300">
                    <ProjectReferencePanel {...referenceProps} />
                </div>
            )}
        </>
    );
}
