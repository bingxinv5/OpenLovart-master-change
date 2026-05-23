export interface CanvasBoundsSource {
  id?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  connectorFrom?: string;
  connectorTo?: string;
  connectorKind?: string;
  connectorFromPort?: string;
  connectorToPort?: string;
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
const REFERENCE_CONNECTOR_KIND = 'reference-image';
const HORIZONTAL_DIRECT_THRESHOLD = 10;
const MIN_CURVE_CONTROL = 72;
const MAX_CURVE_CONTROL = 240;

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

function isReferenceConnectorEndpointPair(fromElement: CanvasBoundsSource, toElement: CanvasBoundsSource) {
  if (fromElement.type === 'image') {
    return toElement.type === 'image-generator' || toElement.type === 'video-generator' || toElement.type === 'storyboard-planner';
  }

  return fromElement.type === 'video' && toElement.type === 'video-generator';
}

function getReferenceOutputPortPoint(element: CanvasBoundsSource) {
  const { width, height } = getCanvasElementRenderSize(element);
  return {
    x: element.x + width,
    y: element.y + height / 2,
  };
}

function getReferenceInputPortPoint(element: CanvasBoundsSource) {
  const { height } = getCanvasElementRenderSize(element);
  return {
    x: element.x,
    y: element.y + height / 2,
  };
}

function getConnectorPortPoint(element: CanvasBoundsSource, port: string) {
  if (port === 'image-output' || port === 'generator-flow-output') {
    return getReferenceOutputPortPoint(element);
  }

  return getReferenceInputPortPoint(element);
}

function getPortTangentDirection(port: string | undefined) {
  if (!port) return null;
  return port === 'generator-reference-input' ? -1 : 1;
}

function getConnectorEndpointPoints(
  connector: CanvasBoundsSource,
  fromElement: CanvasBoundsSource,
  toElement: CanvasBoundsSource,
) {
  if (connector.connectorKind === REFERENCE_CONNECTOR_KIND || isReferenceConnectorEndpointPair(fromElement, toElement)) {
    return {
      from: getConnectorPortPoint(fromElement, connector.connectorFromPort || 'image-output'),
      to: getConnectorPortPoint(toElement, connector.connectorToPort || 'generator-reference-input'),
    };
  }

  if (connector.connectorFromPort && connector.connectorToPort) {
    return {
      from: getConnectorPortPoint(fromElement, connector.connectorFromPort),
      to: getConnectorPortPoint(toElement, connector.connectorToPort),
    };
  }

  return {
    from: getCanvasElementCenter(fromElement),
    to: getCanvasElementCenter(toElement),
  };
}

function getConnectorControlPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromPort?: string,
  toPort?: string,
) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaY) <= HORIZONTAL_DIRECT_THRESHOLD) {
    return [from, to];
  }

  const direction = deltaX >= 0 ? 1 : -1;
  const horizontalDistance = Math.abs(deltaX);
  const verticalEase = Math.min(Math.abs(deltaY) * 0.12, 48);
  const control = Math.min(MAX_CURVE_CONTROL, Math.max(MIN_CURVE_CONTROL, horizontalDistance * 0.52 + verticalEase));
  const firstControlDirection = getPortTangentDirection(fromPort) ?? direction;
  const secondControlDirection = getPortTangentDirection(toPort) ?? -direction;
  return [
    from,
    { x: from.x + firstControlDirection * control, y: from.y },
    { x: to.x + secondControlDirection * control, y: to.y },
    to,
  ];
}

export function getCanvasConnectorControlPoints(
  connector: CanvasBoundsSource,
  elementById: Map<string, CanvasBoundsSource>,
): { x: number; y: number }[] | null {
  const fromElement = connector.connectorFrom ? elementById.get(connector.connectorFrom) : null;
  const toElement = connector.connectorTo ? elementById.get(connector.connectorTo) : null;

  if (!fromElement || !toElement) {
    return null;
  }

  const { from, to } = getConnectorEndpointPoints(connector, fromElement, toElement);
  const isReferenceConnector = connector.connectorKind === REFERENCE_CONNECTOR_KIND || isReferenceConnectorEndpointPair(fromElement, toElement);
  const fromPort = connector.connectorFromPort || (isReferenceConnector ? 'image-output' : undefined);
  const toPort = connector.connectorToPort || (isReferenceConnector ? 'generator-reference-input' : undefined);
  return getConnectorControlPoints(from, to, fromPort, toPort);
}

export function getCanvasConnectorBounds(
  connector: CanvasBoundsSource,
  elementById: Map<string, CanvasBoundsSource>,
): CanvasBounds | null {
  const controlPoints = getCanvasConnectorControlPoints(connector, elementById);

  if (!controlPoints) {
    return null;
  }

  const strokePadding = Math.max(1, positiveDimension(connector.strokeWidth, 2) / 2);

  return {
    minX: Math.min(...controlPoints.map((point) => point.x)) - strokePadding,
    minY: Math.min(...controlPoints.map((point) => point.y)) - strokePadding,
    maxX: Math.max(...controlPoints.map((point) => point.x)) + strokePadding,
    maxY: Math.max(...controlPoints.map((point) => point.y)) + strokePadding,
  };
}

export function boundsIntersect(left: CanvasBounds, right: CanvasBounds) {
  return left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}