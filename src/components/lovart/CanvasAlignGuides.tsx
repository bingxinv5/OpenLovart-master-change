import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlignGuide } from './canvas-alignment';

export function areAlignGuidesEqual(left: AlignGuide[], right: AlignGuide[]) {
    if (left === right) return true;
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index += 1) {
        const leftGuide = left[index];
        const rightGuide = right[index];
        if (
            leftGuide.type !== rightGuide.type
            || !Object.is(leftGuide.pos, rightGuide.pos)
            || !Object.is(leftGuide.start, rightGuide.start)
            || !Object.is(leftGuide.end, rightGuide.end)
        ) {
            return false;
        }
    }

    return true;
}

export function useCanvasAlignGuides(flashDurationMs: number) {
    const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
    const alignGuidesRef = useRef<AlignGuide[]>([]);
    const alignGuidesTimeoutRef = useRef<number | null>(null);

    const setAlignGuidesIfChanged = useCallback((next: AlignGuide[]) => {
        if (areAlignGuidesEqual(alignGuidesRef.current, next)) {
            return;
        }

        alignGuidesRef.current = next;
        setAlignGuides(next);
    }, []);

    const flashAlignGuides = useCallback((guides: AlignGuide[]) => {
        setAlignGuidesIfChanged(guides);
        if (alignGuidesTimeoutRef.current !== null) {
            window.clearTimeout(alignGuidesTimeoutRef.current);
        }
        alignGuidesTimeoutRef.current = window.setTimeout(() => {
            setAlignGuidesIfChanged([]);
            alignGuidesTimeoutRef.current = null;
        }, flashDurationMs);
    }, [flashDurationMs, setAlignGuidesIfChanged]);

    useEffect(() => () => {
        if (alignGuidesTimeoutRef.current !== null) {
            window.clearTimeout(alignGuidesTimeoutRef.current);
        }
    }, []);

    return {
        alignGuides,
        flashAlignGuides,
        setAlignGuidesIfChanged,
    };
}

export function CanvasAlignGuides({ guides }: { guides: AlignGuide[] }) {
    if (guides.length === 0) {
        return null;
    }

    return (
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-[100]">
            {guides.map((guide, index) => {
                if (guide.type === 'v') {
                    return (
                        <g key={`guide-${index}`}>
                            <line
                                x1={guide.pos}
                                y1={guide.start - 20}
                                x2={guide.pos}
                                y2={guide.end + 20}
                                stroke="#F24822"
                                strokeWidth={0.5}
                                strokeDasharray="4 2"
                            />
                            <polygon
                                points={`${guide.pos},${guide.start - 20 - 3} ${guide.pos + 3},${guide.start - 20} ${guide.pos},${guide.start - 20 + 3} ${guide.pos - 3},${guide.start - 20}`}
                                fill="#F24822"
                            />
                            <polygon
                                points={`${guide.pos},${guide.end + 20 - 3} ${guide.pos + 3},${guide.end + 20} ${guide.pos},${guide.end + 20 + 3} ${guide.pos - 3},${guide.end + 20}`}
                                fill="#F24822"
                            />
                        </g>
                    );
                }

                return (
                    <g key={`guide-${index}`}>
                        <line
                            x1={guide.start - 20}
                            y1={guide.pos}
                            x2={guide.end + 20}
                            y2={guide.pos}
                            stroke="#F24822"
                            strokeWidth={0.5}
                            strokeDasharray="4 2"
                        />
                        <polygon
                            points={`${guide.start - 20 - 3},${guide.pos} ${guide.start - 20},${guide.pos - 3} ${guide.start - 20 + 3},${guide.pos} ${guide.start - 20},${guide.pos + 3}`}
                            fill="#F24822"
                        />
                        <polygon
                            points={`${guide.end + 20 - 3},${guide.pos} ${guide.end + 20},${guide.pos - 3} ${guide.end + 20 + 3},${guide.pos} ${guide.end + 20},${guide.pos + 3}`}
                            fill="#F24822"
                        />
                    </g>
                );
            })}
        </svg>
    );
}