import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { getImageBlobUrl, getImageDataUrl, isImageRef } from '@/lib/editor-kernel';
import type { CanvasElement } from './canvas-types';
import type { ElementHandlers } from './CanvasElementRenderer';

async function resolveRenderableImageSource(content: string): Promise<string | null> {
    if (!content) return null;
    if (!isImageRef(content)) return content;
    return getImageBlobUrl(content);
}

async function renderFrameImagesToCanvas(
    ctx: CanvasRenderingContext2D,
    frame: CanvasElement,
    children: CanvasElement[],
): Promise<void> {
    const sources = await Promise.all(children.map(child => resolveRenderableImageSource(child.content || '')));

    await Promise.all(sources.map((src, index) => new Promise<void>((resolve) => {
        if (!src) {
            resolve();
            return;
        }

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        const child = children[index];
        img.onload = () => {
            ctx.drawImage(
                img,
                child.x - frame.x,
                child.y - frame.y,
                child.width || img.naturalWidth,
                child.height || img.naturalHeight,
            );
            resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
    })));
}

export function FrameExportMenu({
    el,
    handlersRef,
}: {
    el: CanvasElement;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;
    const frameW = el.width || 400;
    const frameH = el.height || 300;

    const exportAsPng = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const children = h.getElements().filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const doDownload = () => {
            const link = document.createElement('a');
            link.download = `${el.frameName || 'Frame'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(doDownload);
            return;
        }
        doDownload();
    }, [el, frameW, frameH, h]);

    const exportAsPptImage = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const children = h.getElements().filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const buildPptx = () => {
            const dataUrl = canvas.toDataURL('image/png');
            const pptHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:p="urn:schemas-microsoft-com:office:powerpoint">
<head><meta charset="utf-8"><xml><o:DocumentProperties><o:Slides>1</o:Slides></o:DocumentProperties></xml></head>
<body>
<div style="width:${frameW}px;height:${frameH}px;margin:0;padding:0;">
<img src="${dataUrl}" style="width:100%;height:100%;" />
</div>
</body></html>`;
            const blob = new Blob([pptHtml], { type: 'application/vnd.ms-powerpoint' });
            const link = document.createElement('a');
            link.download = `${el.frameName || 'Frame'}.ppt`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(buildPptx);
            return;
        }
        buildPptx();
    }, [el, frameW, frameH, h]);

    const exportAsPptEditable = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const allElements = h.getElements();
        const textChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'text');
        const imgChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        let slideContent = '';
        for (const child of imgChildren) {
            const dx = child.x - el.x;
            const dy = child.y - el.y;
            const src = isImageRef(child.content) ? await getImageDataUrl(child.content!) : child.content;
            slideContent += `<div style="position:absolute;left:${dx}px;top:${dy}px;width:${child.width || 200}px;height:${child.height || 200}px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" /></div>\n`;
        }
        textChildren.forEach(child => {
            const dx = child.x - el.x;
            const dy = child.y - el.y;
            slideContent += `<div style="position:absolute;left:${dx}px;top:${dy}px;font-size:${child.fontSize || 24}px;font-family:${child.fontFamily || 'Arial'};color:${child.color || '#000000'};">${child.content || ''}</div>\n`;
        });
        const pptHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:p="urn:schemas-microsoft-com:office:powerpoint">
<head><meta charset="utf-8"><xml><o:DocumentProperties><o:Slides>1</o:Slides></o:DocumentProperties></xml></head>
<body>
<div style="position:relative;width:${frameW}px;height:${frameH}px;background:${el.frameBgColor || '#FFFFFF'};margin:0;padding:0;overflow:hidden;">
${slideContent}
</div>
</body></html>`;
        const blob = new Blob([pptHtml], { type: 'application/vnd.ms-powerpoint' });
        const link = document.createElement('a');
        link.download = `${el.frameName || 'Frame'}-editable.ppt`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }, [el, frameW, frameH, h]);

    const exportAsPdf = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const allElements = h.getElements();
        const children = allElements.filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const textChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'text');
        const buildPdf = () => {
            textChildren.forEach(child => {
                const dx = child.x - el.x;
                const dy = child.y - el.y;
                ctx.font = `${child.fontSize || 24}px ${child.fontFamily || 'sans-serif'}`;
                ctx.fillStyle = child.color || '#000000';
                ctx.textBaseline = 'top';
                ctx.fillText(child.content || '', dx, dy);
            });
            const dataUrl = canvas.toDataURL('image/png');
            const printWin = window.open('', '_blank');
            if (!printWin) return;
            printWin.document.write(`
<!DOCTYPE html>
<html><head><title>${el.frameName || 'Frame'}</title>
<style>
@page { size: ${frameW}px ${frameH}px; margin: 0; }
@media print { body { margin: 0; } }
body { margin: 0; padding: 0; width: ${frameW}px; height: ${frameH}px; }
img { width: 100%; height: 100%; display: block; }
</style></head>
<body><img src="${dataUrl}" /></body></html>`);
            printWin.document.close();
            const imgEl = printWin.document.querySelector('img');
            if (imgEl) {
                imgEl.onload = () => { printWin.print(); };
            } else {
                setTimeout(() => printWin.print(), 500);
            }
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(buildPdf);
            return;
        }
        buildPdf();
    }, [el, frameW, frameH, h]);

    return (
        <div className="absolute bottom-full right-0 mb-1.5 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 min-w-[180px] z-[200] animate-in fade-in zoom-in-95 duration-150" onMouseDown={(e) => e.stopPropagation()}>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPng}><Download size={14} className="text-gray-400" />下载</button>
            <div className="h-px bg-gray-100 my-1" />
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPptImage}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>导出 PPT（图片）</button>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPptEditable}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>导出 PPT（可编辑文本）</button>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPdf}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>导出 PDF</button>
        </div>
    );
}