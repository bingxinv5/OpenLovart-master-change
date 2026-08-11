"use client";

import { useLayoutEffect, type RefObject } from 'react';
import { getCanvasElementRenderSize } from '@/lib/canvas-element-bounds';
import type { CanvasElement } from './canvas-types';
import {
    resolveFloatingPanelScreenPosition,
    type CanvasVisualViewport,
} from './floating-panel-position';

type FloatingPanelAnchorElement = Pick<CanvasElement, 'type' | 'x' | 'y' | 'width' | 'height'>;

function roundPanelPosition(value: number) {
    return Math.round(value * 100) / 100;
}

export function useCanvasFloatingPanelFollower({
    panelRef,
    anchorElement,
    visualViewportRef,
    enabled = true,
    panelScale = 1,
    fallbackPanelWidth,
    gap = 20,
    margin = 16,
}: {
    panelRef: RefObject<HTMLDivElement | null>;
    anchorElement: FloatingPanelAnchorElement | null | undefined;
    visualViewportRef: RefObject<CanvasVisualViewport> | null | undefined;
    enabled?: boolean;
    panelScale?: number;
    fallbackPanelWidth: number;
    gap?: number;
    margin?: number;
}) {
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!enabled || !panel || !anchorElement || !visualViewportRef) return;

        const renderSize = getCanvasElementRenderSize(anchorElement);
        const fallbackWidth = anchorElement.type === 'storyboard-planner' ? 560 : 400;
        const fallbackHeight = anchorElement.type === 'storyboard-planner' ? 320 : 400;
        const anchor = {
            x: anchorElement.x,
            y: anchorElement.y,
            width: Number.isFinite(renderSize.width) && renderSize.width > 0 ? renderSize.width : fallbackWidth,
            height: Number.isFinite(renderSize.height) && renderSize.height > 0 ? renderSize.height : fallbackHeight,
        };

        let animationFrame: number | null = null;
        let panelWidth = panel.offsetWidth || fallbackPanelWidth;
        let panelHeight = panel.offsetHeight;
        let viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
        let viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
        let originLeft = 0;
        let originTop = 0;
        let geometryVersion = 0;
        let appliedKey = '';
        let canvasRoot: HTMLElement | null = null;

        const measureGeometry = () => {
            canvasRoot = document.querySelector<HTMLElement>('[data-testid="canvas-area"]');
            panelWidth = panel.offsetWidth || fallbackPanelWidth;
            panelHeight = panel.offsetHeight;
            if (canvasRoot) {
                const canvasRect = canvasRoot.getBoundingClientRect();
                const offsetParent = panel.offsetParent as HTMLElement | null;
                const parentRect = offsetParent?.getBoundingClientRect();
                viewportWidth = canvasRect.width;
                viewportHeight = canvasRect.height;
                originLeft = canvasRect.left - (parentRect?.left ?? 0);
                originTop = canvasRect.top - (parentRect?.top ?? 0);
            }
            geometryVersion += 1;
        };

        const applyPosition = () => {
            const viewport = visualViewportRef.current;
            const key = [
                viewport.scale,
                viewport.pan.x,
                viewport.pan.y,
                geometryVersion,
            ].join(':');
            if (key !== appliedKey) {
                appliedKey = key;
                const position = resolveFloatingPanelScreenPosition({
                    anchor,
                    viewport,
                    panelWidth,
                    panelHeight,
                    panelScale,
                    viewportWidth,
                    viewportHeight,
                    gap,
                    margin,
                });
                const left = roundPanelPosition(position.left + originLeft);
                const top = roundPanelPosition(position.top + originTop);
                panel.style.left = '0px';
                panel.style.top = '0px';
                panel.style.transformOrigin = 'top left';
                panel.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${panelScale})`;
                panel.dataset.floatingPanelPlacement = position.placement;
                panel.dataset.floatingPanelX = String(left);
                panel.dataset.floatingPanelY = String(top);
            }
        };

        const schedulePosition = () => {
            if (animationFrame !== null) return;
            animationFrame = window.requestAnimationFrame(() => {
                animationFrame = null;
                applyPosition();
            });
        };

        measureGeometry();
        panel.style.willChange = 'transform';
        applyPosition();

        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(() => {
                measureGeometry();
                schedulePosition();
            });
        resizeObserver?.observe(panel);
        if (canvasRoot) resizeObserver?.observe(canvasRoot);
        const viewportObserver = canvasRoot && typeof MutationObserver !== 'undefined'
            ? new MutationObserver(schedulePosition)
            : null;
        viewportObserver?.observe(canvasRoot!, {
            attributes: true,
            attributeFilter: ['data-visual-scale', 'data-visual-pan-x', 'data-visual-pan-y'],
        });
        const handleWindowResize = () => {
            measureGeometry();
            schedulePosition();
        };
        window.addEventListener('resize', handleWindowResize);

        return () => {
            if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
            resizeObserver?.disconnect();
            viewportObserver?.disconnect();
            window.removeEventListener('resize', handleWindowResize);
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            panel.style.removeProperty('transform');
            panel.style.removeProperty('transform-origin');
            panel.style.removeProperty('will-change');
            delete panel.dataset.floatingPanelPlacement;
            delete panel.dataset.floatingPanelX;
            delete panel.dataset.floatingPanelY;
        };
    }, [
        anchorElement,
        enabled,
        fallbackPanelWidth,
        gap,
        margin,
        panelRef,
        panelScale,
        visualViewportRef,
    ]);
}
