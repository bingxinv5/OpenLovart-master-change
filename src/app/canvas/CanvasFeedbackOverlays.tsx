import { AlertTriangle, Check } from 'lucide-react';
import type { CanvasToast } from './canvas-feedback';

interface ShortcutFeedback {
    label: string;
    shortcut: string;
}

interface CanvasFeedbackOverlaysProps {
    shortcutFeedback: ShortcutFeedback | null;
    transcodingStatus: string | null;
    toast: CanvasToast | null;
    onClearToast: () => void;
}

export function CanvasFeedbackOverlays({
    shortcutFeedback,
    transcodingStatus,
    toast,
    onClearToast,
}: CanvasFeedbackOverlaysProps) {
    return (
        <>
            {shortcutFeedback && (
                <div className="shortcut-feedback-enter pointer-events-none fixed top-16 right-4 z-[250] flex items-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm xl:top-14">
                    <span className="text-[12px] font-medium text-slate-300">{shortcutFeedback.label}</span>
                    <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">{shortcutFeedback.shortcut}</kbd>
                </div>
            )}

            {transcodingStatus && (
                <div className="canvas-toast-enter pointer-events-none fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-slate-900/90 px-4 py-2.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/20 border-t-white" />
                    <span className="text-[13px] font-medium text-white">{transcodingStatus}</span>
                </div>
            )}

            {toast && (
                <div className={`canvas-toast-enter fixed top-16 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm xl:top-14 ${
                    toast.type === 'error' ? 'bg-rose-600/90 text-white shadow-rose-600/10' :
                    toast.type === 'success' ? 'bg-emerald-600/90 text-white shadow-emerald-600/10' :
                    'bg-slate-900/90 text-white shadow-slate-900/10'
                }`}>
                    {toast.type === 'success' && <Check size={14} className="text-emerald-200" />}
                    {toast.type === 'error' && <AlertTriangle size={14} className="text-rose-200" />}
                    <span className="text-[13px] font-medium">{toast.message}</span>
                    <button onClick={onClearToast} className="ml-1 flex h-5 w-5 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white">
                        <span className="text-xs leading-none">✕</span>
                    </button>
                </div>
            )}
        </>
    );
}
