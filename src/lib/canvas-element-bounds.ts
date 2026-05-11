export interface CanvasBoundsSource {
  id?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  connectorFrom?: string;
  connectorTo?: string;
  strokeWidth?: number;
}

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const IMAGE_FALLBACK_SIZE = { width: 400, height: 400 };
const VIDEO_FALLBACK_SIZE = { width: 400, height: 300 };

function positiveDimension(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value as number : fallback;
}

export function getCanvasElementRenderSize(element: Pick<CanvasBoundsSource, 'type' | 'width' | 'height'>) {
  if (element.type === 'image') {
    return {
      width: positiveDimension(element.width, IMAGE_FALLBACK_SIZE.width),
      height: positiveDimension(element.height, IMAGE_FALLBACK_SIZE.height),
    };
  }

  if (element.type === 'video') {
    return {
      width: positiveDimension(element.width, VIDEO_FALLBACK_SIZE.width),
      height: positiveDimension(element.height, VIDEO_FALLBACK_SIZE.height),
    };
  }

  return {
    width: positiveDimension(element.width, 0),
    height: positiveDimension(element.height, 0),
  };
}

export function getCanvasElementBounds(element: CanvasBoundsSource): CanvasBounds {
  const { width, height } = getCanvasElementRenderSize(element);
  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + width,
    maxY: element.y + height,
  };
}

export function getCanvasElementCenter(element: CanvasBoundsSource) {
  const { width, height } = getCanvasElementRenderSize(element);
  return {
    x: element.x + width / 2,
    y: element.y + height / 2,
  };
}

export function getCanvasConnectorBounds(
  connector: CanvasBoundsSource,
  elementById: Map<string, CanvasBoundsSource>,
): CanvasBounds | null {
  const fromElement = connector.connectorFrom ? elementById.get(connector.connectorFrom) : null;
  const toElement = connector.connectorTo ? elementById.get(connector.connectorTo) : null;

  if (!fromElement || !toElement) {
    return null;
  }

  const fromCenter = getCanvasElementCenter(fromElement);
  const toCenter = getCanvasElementCenter(toElement);
  const strokePadding = Math.max(1, positiveDimension(connector.strokeWidth, 2) / 2);

  return {
    minX: Math.min(fromCenter.x, toCenter.x) - strokePadding,
    minY: Math.min(fromCenter.y, toCenter.y) - strokePadding,
    maxX: Math.max(fromCenter.x, toCenter.x) + strokePadding,
    maxY: Math.max(fromCenter.y, toCenter.y) + strokePadding,
  };
}

export function boundsIntersect(left: CanvasBounds, right: CanvasBounds) {
  return left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}