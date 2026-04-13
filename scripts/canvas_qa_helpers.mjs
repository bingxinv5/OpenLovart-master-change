import layersPanelTestEvents from '../src/lib/testing/layers-panel-test-events.json' with { type: 'json' };
import canvasTestEvents from '../src/lib/testing/canvas-test-events.json' with { type: 'json' };

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function createCanvasQaHelpers(page, layersPanel) {
  const clickContextMenuItem = async (label) => {
    await sleep(250);
    const item = page.getByText(label, { exact: true }).last();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    await item.click({ force: true, timeout: 10000 });
  };

  const drawFrame = async (startX, startY, endX, endY) => {
    const canvasArea = page.locator('[data-testid="canvas-area"]').first();
    await canvasArea.evaluate((node, payload) => {
      node.dispatchEvent(new CustomEvent(payload.eventName, {
        detail: payload.detail,
      }));
    }, {
      eventName: canvasTestEvents.addFrameEvent,
      detail: {
        centerX: Math.round((startX + endX) / 2),
        centerY: Math.round((startY + endY) / 2),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
      },
    });
    await sleep(300);
  };

  const dispatchLayerMoveToParent = async (draggedIdOrIds, parentId) => {
    const draggedIds = Array.isArray(draggedIdOrIds) ? draggedIdOrIds : [draggedIdOrIds];
    await layersPanel.evaluate((node, payload) => {
      node.dispatchEvent(new CustomEvent(payload.eventName, {
        detail: payload.detail,
      }));
    }, {
      eventName: layersPanelTestEvents.moveToParentEvent,
      detail: {
        draggedId: draggedIds[0],
        draggedIds,
        parentId: parentId ?? null,
      },
    });
  };

  const dispatchLayerReorder = async (draggedIdOrIds, targetId, placement) => {
    const draggedIds = Array.isArray(draggedIdOrIds) ? draggedIdOrIds : [draggedIdOrIds];
    await layersPanel.evaluate((node, payload) => {
      node.dispatchEvent(new CustomEvent(payload.eventName, {
        detail: payload.detail,
      }));
    }, {
      eventName: layersPanelTestEvents.reorderEvent,
      detail: {
        draggedId: draggedIds[0],
        draggedIds,
        targetId,
        placement,
      },
    });
  };

  const dispatchCanvasMoveToFrame = async (elementId, targetFrameId) => {
    const canvasArea = page.locator('[data-testid="canvas-area"]').first();
    await canvasArea.evaluate((node, payload) => {
      node.dispatchEvent(new CustomEvent(payload.eventName, {
        detail: payload.detail,
      }));
    }, {
      eventName: canvasTestEvents.moveElementToFrameEvent,
      detail: {
        elementId,
        targetFrameId: targetFrameId ?? null,
      },
    });
  };

  const dispatchFrameAutoLayout = async (frameId, detail = {}) => {
    const canvasArea = page.locator('[data-testid="canvas-area"]').first();
    await canvasArea.evaluate((node, payload) => {
      node.dispatchEvent(new CustomEvent(payload.eventName, {
        detail: payload.detail,
      }));
    }, {
      eventName: canvasTestEvents.setFrameAutoLayoutEvent,
      detail: {
        frameId,
        ...detail,
      },
    });
  };

  const previewLayerDropTargets = async (draggedId, parentId) => {
    const source = page.locator(`[data-testid="layer-drag-${draggedId}"]`).first();
    const parentTarget = page.locator(`[data-testid="layer-nest-target-${parentId}"]`).first();
    const rootTarget = page.locator('[data-testid="layers-root-drop-zone"]');
    const dragHint = page.locator('[data-testid="layers-drag-hint"]');
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    await source.dispatchEvent('dragstart', { dataTransfer });
    await page.waitForTimeout(120);

    const parentVisible = await parentTarget.isVisible().catch(() => false);
    const rootVisible = await rootTarget.isVisible().catch(() => false);
    const hintVisible = await dragHint.isVisible().catch(() => false);

    await source.dispatchEvent('dragend', { dataTransfer }).catch(() => {});
    await dataTransfer.dispose();

    return { parentVisible, rootVisible, hintVisible };
  };

  return {
    clickContextMenuItem,
    drawFrame,
    dispatchLayerMoveToParent,
    dispatchLayerReorder,
    dispatchCanvasMoveToFrame,
    dispatchFrameAutoLayout,
    previewLayerDropTargets,
  };
}
