export interface CanvasPointWithTime {
    x: number;
    y: number;
    t: number;
}

export interface PanVelocity {
    vx: number;
    vy: number;
}

export interface InertiaStepResult {
    pan: { x: number; y: number };
    velocity: PanVelocity;
    shouldContinue: boolean;
}

export function trimPanVelocityPoints(points: CanvasPointWithTime[], maxPoints: number): CanvasPointWithTime[] {
    return points.length > maxPoints ? points.slice(points.length - maxPoints) : points;
}

export function calculatePanInertiaVelocity(points: CanvasPointWithTime[], options: {
    sampleBackCount?: number;
    frameMs?: number;
    maxSampleMs?: number;
    maxVelocity?: number;
    minSpeed?: number;
} = {}): PanVelocity | null {
    if (points.length < 2) {
        return null;
    }

    const sampleBackCount = options.sampleBackCount ?? 4;
    const frameMs = options.frameMs ?? 16;
    const maxSampleMs = options.maxSampleMs ?? 200;
    const maxVelocity = options.maxVelocity ?? 15;
    const minSpeed = options.minSpeed ?? 1;
    const latest = points[points.length - 1];
    const earlier = points[Math.max(0, points.length - sampleBackCount)];
    const deltaMs = latest.t - earlier.t;

    if (deltaMs <= 0 || deltaMs >= maxSampleMs) {
        return null;
    }

    let vx = (latest.x - earlier.x) / deltaMs * frameMs;
    let vy = (latest.y - earlier.y) / deltaMs * frameMs;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed <= minSpeed) {
        return null;
    }

    if (speed > maxVelocity) {
        vx = vx / speed * maxVelocity;
        vy = vy / speed * maxVelocity;
    }

    return { vx, vy };
}

export function stepPanInertia(pan: { x: number; y: number }, velocity: PanVelocity, options: {
    friction?: number;
    minVelocity?: number;
} = {}): InertiaStepResult {
    const friction = options.friction ?? 0.82;
    const minVelocity = options.minVelocity ?? 0.5;
    const nextVelocity = {
        vx: velocity.vx * friction,
        vy: velocity.vy * friction,
    };
    const shouldContinue = Math.abs(nextVelocity.vx) >= minVelocity || Math.abs(nextVelocity.vy) >= minVelocity;

    return {
        pan: shouldContinue
            ? { x: pan.x + nextVelocity.vx, y: pan.y + nextVelocity.vy }
            : pan,
        velocity: nextVelocity,
        shouldContinue,
    };
}