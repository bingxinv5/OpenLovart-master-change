import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Focus, ChevronDown, ChevronUp, Scan } from 'lucide-react';
import type { CanvasElement } from './canvas-types';

interface CanvasMinimapProps {
    elements: CanvasElement[];
    scale: number;
    pan: { x: number; y: number };
    viewportSize: { width: number; height: number };
    selectedIds: string[];
    onPanChange: (pan: { x: number; y: number }) => void;
    onScaleChange?: (scale: number) => void;
    rightOffset?: number;
}

/* ─── Layout ─── */
const WORLD_PADDING = 250;
const MINIMAP_W = 218;
const MINIMAP_H = 148;

/*
 * Palette – derived from the app's existing design tokens:
 *   bg-white, border-gray-100/200, text-gray-400‒900
 *   accent: violet-500/600 (LayersPanel selection)
 *   action: blue-500/600 (buttons, links)
 */
const C = {
    // Canvas background (matches the workbench bg: #f8f8fa)
    canvasBg:       '#f2f2f5',
    // Grid dots
    gridDot:        'rgba(0,0,0,0.045)',
    // Elements
    elImage:        '#818cf8', // indigo-400 — matches violet family
    elVideo:        '#a78bfa', // violet-400
    elText:         '#fbbf24', // amber-400
    elShape:        '#34d399', // emerald-400
    elPath:         '#f472b6', // pink-400
    elFrame:        'rgba(139,92,246,0.08)',  // very faint violet
    elFrameStroke:  'rgba(139,92,246,0.25)',
    elMark:         '#f87171', // red-400
    elGenerator:    '#c084fc', // purple-400
    elSelected:     '#7c3aed', // violet-600 — consistent with LayersPanel
    elDefault:      'rgba(0,0,0,0.10)',
    // Viewport
    vpStroke:       'rgba(124,58,237,0.55)', // violet-600
    vpFill:         'rgba(124,58,237,0.04)',
    vpGlow:         'rgba(124,58,237,0.12)',
    dimOverlay:     'rgba(255,255,255,0.50)',
    // Crosshair
    crosshair:      'rgba(124,58,237,0.25)',
    crossDot:       '#7c3aed',
};

/**
 * Minimap – light-theme glass panel that matches the workbench's
 * white / gray-100 / violet-accent design system.
 */
export const CanvasMinimap = React.memo(function CanvasMinimap({
    elements,
    scale,
    pan,
    viewportSize,
    selectedIds,
    onPanChange,
    onScaleChange,
    rightOffset,
}: CanvasMinimapProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDraggingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef(0);

    /* ── World bounds ── */
    const worldBounds = useMemo(() => {
        const vis = elements.filter(el => !el.hidden && el.type !== 'connector');
        if (vis.length === 0) return { minX: -500, minY: -500, maxX: 500, maxY: 500 };
        let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
        for (const el of vis) {
            const r = el.x + (el.width || 100), b = el.y + (el.height || 100);
            if (el.x < mnX) mnX = el.x;
            if (el.y < mnY) mnY = el.y;
            if (r > mxX) mxX = r;
            if (b > mxY) mxY = b;
        }
        return { minX: mnX - WORLD_PADDING, minY: mnY - WORLD_PADDING, maxX: mxX + WORLD_PADDING, maxY: mxY + WORLD_PADDING };
    }, [elements]);

    /* ── Expanded bounds (always include viewport) ── */
    const expandedBounds = useMemo(() => {
        const vl = -pan.x / scale, vt = -pan.y / scale;
        const vr = (viewportSize.width - pan.x) / scale, vb = (viewportSize.height - pan.y) / scale;
        return {
            minX: Math.min(worldBounds.minX, vl - WORLD_PADDING),
            minY: Math.min(worldBounds.minY, vt - WORLD_PADDING),
            maxX: Math.max(worldBounds.maxX, vr + WORLD_PADDING),
            maxY: Math.max(worldBounds.maxY, vb + WORLD_PADDING),
        };
    }, [worldBounds, pan, scale, viewportSize]);

    const worldW = expandedBounds.maxX - expandedBounds.minX || 1;
    const worldH = expandedBounds.maxY - expandedBounds.minY || 1;
    const mapScale = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);

    const toMX = useCallback((wx: number) => (wx - expandedBounds.minX) * mapScale, [expandedBounds.minX, mapScale]);
    const toMY = useCallback((wy: number) => (wy - expandedBounds.minY) * mapScale, [expandedBounds.minY, mapScale]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    /* ── Element color resolver ── */
    const elColor = useCallback((el: CanvasElement, sel: boolean): string => {
        if (sel) return C.elSelected;
        switch (el.type) {
            case 'image': return C.elImage;
            case 'video': return C.elVideo;
            case 'text': return C.elText;
            case 'shape': return C.elShape;
            case 'path': return C.elPath;
            case 'frame': return C.elFrame;
            case 'mark': return C.elMark;
            case 'image-generator': case 'video-generator': return C.elGenerator;
            default: return C.elDefault;
        }
    }, []);

    /* ── Canvas rendering ── */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || collapsed) return;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.width = MINIMAP_W * dpr;
            canvas.height = MINIMAP_H * dpr;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

            /* Background */
            ctx.fillStyle = C.canvasBg;
            ctx.beginPath();
            ctx.roundRect(0, 0, MINIMAP_W, MINIMAP_H, 4);
            ctx.fill();

            /* Dot grid */
            ctx.fillStyle = C.gridDot;
            const step = 20 * mapScale;
            if (step > 3) {
                for (let gx = step; gx < MINIMAP_W; gx += step) {
                    for (let gy = step; gy < MINIMAP_H; gy += step) {
                        ctx.beginPath();
                        ctx.arc(gx, gy, 0.6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            /* ── Draw elements ── */
            const vis = elements.filter(el => !el.hidden && el.type !== 'connector');
            const frames = vis.filter(el => el.type === 'frame');
            const rest = vis.filter(el => el.type !== 'frame');

            // Frames
            for (const el of frames) {
                const mx = toMX(el.x), my = toMY(el.y);
                const mw = Math.max(3, (el.width || 100) * mapScale);
                const mh = Math.max(3, (el.height || 100) * mapScale);
                const sel = selectedSet.has(el.id);
                ctx.fillStyle = sel ? 'rgba(124,58,237,0.12)' : C.elFrame;
                ctx.strokeStyle = sel ? C.elSelected : C.elFrameStroke;
                ctx.lineWidth = sel ? 1 : 0.6;
                ctx.beginPath();
                ctx.roundRect(mx, my, mw, mh, 2);
                ctx.fill();
                ctx.stroke();
            }

            // Other elements
            for (const el of rest) {
                const mx = toMX(el.x), my = toMY(el.y);
                const mw = Math.max(2.5, (el.width || 60) * mapScale);
                const mh = Math.max(2.5, (el.height || 60) * mapScale);
                const sel = selectedSet.has(el.id);
                const color = elColor(el, sel);

                ctx.save();
                if (sel) {
                    ctx.shadowColor = C.elSelected;
                    ctx.shadowBlur = 5;
                }
                ctx.fillStyle = color;

                if (el.type === 'shape' && el.shapeType === 'circle') {
                    ctx.beginPath();
                    ctx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else if (el.type === 'mark') {
                    const cx = mx + mw / 2, cy = my + mh / 2, r = Math.max(2, Math.min(mw, mh) / 2);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - r);
                    ctx.lineTo(cx + r, cy);
                    ctx.lineTo(cx, cy + r);
                    ctx.lineTo(cx - r, cy);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    const rad = Math.min(1.5, mw / 3, mh / 3);
                    ctx.roundRect(mx, my, mw, mh, rad);
                    ctx.fill();
                }
                ctx.restore();
            }

            /* ── Viewport ── */
            const vl = -pan.x / scale, vt = -pan.y / scale;
            const vW = viewportSize.width / scale, vH = viewportSize.height / scale;
            const vx = toMX(vl), vy = toMY(vt), vw = vW * mapScale, vh = vH * mapScale;

            // Dim area outside viewport
            ctx.save();
            ctx.fillStyle = C.dimOverlay;
            ctx.beginPath();
            ctx.roundRect(0, 0, MINIMAP_W, MINIMAP_H, 4);
            ctx.moveTo(vx, vy);
            ctx.lineTo(vx, vy + vh);
            ctx.lineTo(vx + vw, vy + vh);
            ctx.lineTo(vx + vw, vy);
            ctx.closePath();
            ctx.fill('evenodd');
            ctx.restore();

            // Viewport glow + stroke
            ctx.save();
            ctx.shadowColor = C.vpGlow;
            ctx.shadowBlur = 6;
            ctx.strokeStyle = C.vpStroke;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.roundRect(vx, vy, vw, vh, 2);
            ctx.stroke();
            ctx.restore();

            // Viewport fill
            ctx.fillStyle = C.vpFill;
            ctx.beginPath();
            ctx.roundRect(vx, vy, vw, vh, 2);
            ctx.fill();

            // Corner handles
            ctx.fillStyle = '#7c3aed';
            for (const [cx, cy] of [[vx, vy], [vx + vw, vy], [vx, vy + vh], [vx + vw, vy + vh]]) {
                ctx.beginPath();
                ctx.arc(cx, cy, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            /* ── Hover crosshair ── */
            if (hoverPos && hovered && !isDragging) {
                ctx.save();
                ctx.strokeStyle = C.crosshair;
                ctx.lineWidth = 0.8;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(hoverPos.x, 0);
                ctx.lineTo(hoverPos.x, MINIMAP_H);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, hoverPos.y);
                ctx.lineTo(MINIMAP_W, hoverPos.y);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = C.crossDot;
                ctx.beginPath();
                ctx.arc(hoverPos.x, hoverPos.y, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [elements, pan, scale, viewportSize, selectedSet, collapsed, toMX, toMY, mapScale, elColor, hoverPos, hovered, isDragging]);

    /* ── Navigation ── */
    const navigateTo = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (clientX - rect.left) * (MINIMAP_W / rect.width);
        const my = (clientY - rect.top) * (MINIMAP_H / rect.height);
        const wx = mx / mapScale + expandedBounds.minX;
        const wy = my / mapScale + expandedBounds.minY;
        onPanChange({ x: -(wx * scale - viewportSize.width / 2), y: -(wy * scale - viewportSize.height / 2) });
    }, [expandedBounds.minX, expandedBounds.minY, mapScale, onPanChange, scale, viewportSize]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        isDraggingRef.current = true;
        setIsDragging(true);
        navigateTo(e.clientX, e.clientY);
    }, [navigateTo]);

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setHoverPos({ x: (e.clientX - rect.left) * (MINIMAP_W / rect.width), y: (e.clientY - rect.top) * (MINIMAP_H / rect.height) });
        if (isDraggingRef.current) { e.stopPropagation(); e.preventDefault(); navigateTo(e.clientX, e.clientY); }
    }, [navigateTo]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        isDraggingRef.current = false;
        setIsDragging(false);
    }, []);

    useEffect(() => {
        const up = () => {
            isDraggingRef.current = false;
            setIsDragging(false);
        };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, []);

    useEffect(() => {
        const move = (e: MouseEvent) => { if (isDraggingRef.current) navigateTo(e.clientX, e.clientY); };
        window.addEventListener('mousemove', move);
        return () => window.removeEventListener('mousemove', move);
    }, [navigateTo]);

    /* ── Fit All ── */
    const fitAll = useCallback(() => {
        const vis = elements.filter(el => !el.hidden && el.type !== 'connector');
        if (vis.length === 0) return;
        let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
        for (const el of vis) {
            mnX = Math.min(mnX, el.x); mnY = Math.min(mnY, el.y);
            mxX = Math.max(mxX, el.x + (el.width || 100)); mxY = Math.max(mxY, el.y + (el.height || 100));
        }
        const cw = mxX - mnX, ch = mxY - mnY, pad = 80;
        const s = Math.min((viewportSize.width - pad * 2) / cw, (viewportSize.height - pad * 2) / ch, 2);
        onScaleChange?.(s);
        onPanChange({ x: viewportSize.width / 2 - (mnX + cw / 2) * s, y: viewportSize.height / 2 - (mnY + ch / 2) * s });
    }, [elements, viewportSize, onPanChange, onScaleChange]);

    const elementCount = useMemo(() => elements.filter(el => !el.hidden && el.type !== 'connector').length, [elements]);

    /* ═══ Collapsed ═══ */
    if (collapsed) {
        return (
            <div className="absolute bottom-4 z-[25] transition-all duration-300" style={{ right: `${(rightOffset ?? 0) + 4}px` }} ref={containerRef}>
                <button
                    onClick={() => setCollapsed(false)}
                    className="group flex items-center gap-1 px-2 py-[5px]
                               bg-white hover:bg-white
                               border border-gray-100 hover:border-gray-200
                               rounded-2xl
                               shadow-xl
                               transition-all duration-200"
                    title="展开小地图"
                >
                    <Scan size={12} strokeWidth={1.8} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
                    <ChevronUp size={10} strokeWidth={2} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                    {elementCount > 0 && (
                        <span className="text-[9px] font-semibold text-gray-400 tabular-nums ml-px">
                            {elementCount}
                        </span>
                    )}
                </button>
            </div>
        );
    }

    /* ═══ Expanded ═══ */
    return (
        <div
            ref={containerRef}
            className="absolute bottom-4 z-[25] select-none group/map flex flex-col items-end transition-all duration-300"
            style={{ right: `${(rightOffset ?? 0) + 4}px` }}
            onMouseDown={e => e.stopPropagation()}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setHoverPos(null); }}
        >
            {/* ── Map canvas ── */}
            <div
                className="rounded-2xl overflow-hidden
                           bg-white
                           border border-gray-100
                           shadow-xl
                           transition-shadow duration-200
                           group-hover/map:shadow-2xl
                           relative"
                style={{ width: MINIMAP_W }}
            >
                <canvas
                    ref={canvasRef}
                    width={MINIMAP_W}
                    height={MINIMAP_H}
                    style={{ width: MINIMAP_W, height: MINIMAP_H, display: 'block',
                             cursor: isDragging ? 'grabbing' : 'crosshair' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleMouseUp}
                />
                {/* Subtle inset shadow */}
                <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)' }} />
            </div>

            {/* ── Control strip below canvas (slides up on hover) ── */}
            <div
                className="overflow-hidden transition-all duration-200 ease-out
                           max-h-0 opacity-0 group-hover/map:max-h-8 group-hover/map:opacity-100"
                style={{ width: MINIMAP_W }}
            >
                <div className="flex items-center justify-between mt-[3px] px-[2px]">
                    {/* Left: legend dots */}
                    <div className="flex items-center gap-[6px]">
                        {([
                            ['#818cf8', '图'],
                            ['#a78bfa', '视'],
                            ['#fbbf24', '文'],
                            ['#34d399', '形'],
                        ] as const).map(([color, label]) => (
                            <div key={label} className="flex items-center gap-[2px]">
                                <div className="w-[4px] h-[4px] rounded-[1px]" style={{ backgroundColor: color }} />
                                <span className="text-[8px] text-gray-400">{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-0">
                        <span className="text-[9px] tabular-nums text-gray-400 mr-[2px]">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); fitAll(); }}
                            className="p-[2px] rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="适配全部"
                        >
                            <Focus size={10} strokeWidth={1.8} />
                        </button>
                        {onScaleChange && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onScaleChange(Math.max(0.1, scale - 0.1)); }}
                                    className="p-[2px] rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="缩小"
                                >
                                    <Minus size={10} strokeWidth={1.8} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onScaleChange(Math.min(5, scale + 0.1)); }}
                                    className="p-[2px] rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="放大"
                                >
                                    <Plus size={10} strokeWidth={1.8} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
                            className="p-[2px] rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="收起"
                        >
                            <ChevronDown size={10} strokeWidth={2} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
