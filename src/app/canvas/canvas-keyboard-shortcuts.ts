import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';

type EditableTargetLike = {
    tagName?: string | null;
    isContentEditable?: boolean;
    parentElement?: EditableTargetLike | null;
    getAttribute?: (name: string) => string | null;
};

interface UseCanvasKeyboardShortcutsOptions {
    elements: CanvasElement[];
    selectedIds: string[];
    clipboardRef: React.MutableRefObject<CanvasElement[]>;
    openImageGeneratorRef: React.MutableRefObject<() => void>;
    cloneCanvasElement: (element: CanvasElement) => CanvasElement;
    addElements: (elements: CanvasElement[]) => void;
    setSelectedIds: (ids: string[]) => void;
    setActiveTool: (tool: string) => void;
    handleAddText: () => void;
    handleElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    handleFitToScreen: () => void;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    handleZoomTo: (value: number) => void;
    removeElementsByIds: (ids: string[]) => void;
    onOpenCommandPalette?: () => void;
    onOpenShortcutHelp?: () => void;
    onShortcutTriggered?: (label: string, shortcut: string) => void;
    redo: () => void;
    saveProject: () => void;
    undo: () => void;
}

function toEditableTargetLike(target: EventTarget | null | undefined): EditableTargetLike | null {
    if (!target || typeof target !== 'object') {
        return null;
    }

    return target as EditableTargetLike;
}

function isEditableElementLike(target: EditableTargetLike | null): boolean {
    let current = target;
    while (current) {
        const tagName = typeof current.tagName === 'string' ? current.tagName.toUpperCase() : '';
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return true;
        }

        if (current.isContentEditable) {
            return true;
        }

        const contentEditableAttr = current.getAttribute?.('contenteditable')?.toLowerCase();
        if (contentEditableAttr && contentEditableAttr !== 'false') {
            return true;
        }

        current = current.parentElement ?? null;
    }

    return false;
}

export function isEditableShortcutTarget(target: EventTarget | null, activeElement?: EventTarget | null): boolean {
    return isEditableElementLike(toEditableTargetLike(target)) || isEditableElementLike(toEditableTargetLike(activeElement));
}

export function useCanvasKeyboardShortcuts(options: UseCanvasKeyboardShortcutsOptions) {
    const latestRef = useRef(options);

    useEffect(() => {
        latestRef.current = options;
    }, [options]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const latest = latestRef.current;
            const key = typeof e.key === 'string' ? e.key : '';
            const lowerKey = key.toLowerCase();
            const announce = (label: string, shortcut: string) => {
                latest.onShortcutTriggered?.(label, shortcut);
            };

            if (!key) {
                return;
            }

            if (isEditableShortcutTarget(e.target, document.activeElement)) {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (lowerKey) {
                    case 'k':
                        e.preventDefault();
                        latest.onOpenCommandPalette?.();
                        announce('打开命令面板', 'Ctrl+K');
                        return;
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            latest.redo();
                            announce('重做', 'Ctrl+Shift+Z');
                        } else {
                            latest.undo();
                            announce('撤销', 'Ctrl+Z');
                        }
                        return;
                    case 'y':
                        e.preventDefault();
                        latest.redo();
                        announce('重做', 'Ctrl+Y');
                        return;
                    case 'a':
                        e.preventDefault();
                        latest.setSelectedIds(latest.elements.map((element) => element.id));
                        announce('全选元素', 'Ctrl+A');
                        return;
                    case 's':
                        e.preventDefault();
                        latest.saveProject();
                        announce('保存项目', 'Ctrl+S');
                        return;
                    case 'd':
                        e.preventDefault();
                        if (latest.selectedIds.length > 0) {
                            const copies = latest.elements
                                .filter((element) => latest.selectedIds.includes(element.id))
                                .map((element) => ({
                                    ...latest.cloneCanvasElement(element),
                                    id: uuidv4(),
                                    x: element.x + 20,
                                    y: element.y + 20,
                                }));
                            latest.addElements(copies);
                            latest.setSelectedIds(copies.map((copy) => copy.id));
                            announce('复制所选元素', 'Ctrl+D');
                        }
                        return;
                    case 'c':
                        e.preventDefault();
                        if (latest.selectedIds.length > 0) {
                            latest.clipboardRef.current = latest.elements
                                .filter((element) => latest.selectedIds.includes(element.id))
                                .map(latest.cloneCanvasElement);
                            announce('复制到剪贴板', 'Ctrl+C');
                        }
                        return;
                    case 'x':
                        e.preventDefault();
                        if (latest.selectedIds.length > 0) {
                            latest.clipboardRef.current = latest.elements
                                .filter((element) => latest.selectedIds.includes(element.id))
                                .map(latest.cloneCanvasElement);
                            latest.removeElementsByIds(latest.selectedIds);
                            announce('剪切所选元素', 'Ctrl+X');
                        }
                        return;
                    case 'v':
                        e.preventDefault();
                        if (latest.clipboardRef.current.length > 0) {
                            const copies = latest.clipboardRef.current.map((element) => ({
                                ...latest.cloneCanvasElement(element),
                                id: uuidv4(),
                                x: element.x + 30,
                                y: element.y + 30,
                            }));
                            latest.addElements(copies);
                            latest.setSelectedIds(copies.map((copy) => copy.id));
                            latest.clipboardRef.current = copies.map(latest.cloneCanvasElement);
                            announce('粘贴元素', 'Ctrl+V');
                        }
                        return;
                }

                if (key === '=' || key === '+') {
                    e.preventDefault();
                    latest.handleZoomIn();
                    announce('放大画布', 'Ctrl++');
                    return;
                }
                if (key === '-' || key === '_') {
                    e.preventDefault();
                    latest.handleZoomOut();
                    announce('缩小画布', 'Ctrl+-');
                    return;
                }
                if (key === '0') {
                    e.preventDefault();
                    latest.handleZoomTo(1);
                    announce('重置缩放', 'Ctrl+0');
                    return;
                }
            }

            if ((key === '?' || (e.shiftKey && key === '/')) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                latest.onOpenShortcutHelp?.();
                announce('打开快捷键总览', '?');
                return;
            }

            if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
                if (key === '!' || key === '1') {
                    e.preventDefault();
                    latest.handleFitToScreen();
                    announce('适应屏幕', 'Shift+1');
                    return;
                }
            }

            if (e.altKey && latest.selectedIds.length >= 2) {
                const selectedElements = latest.elements.filter((element) => latest.selectedIds.includes(element.id) && element.type !== 'connector');
                if (selectedElements.length >= 2) {
                    const getBounds = () => {
                        const minX = Math.min(...selectedElements.map((element) => element.x));
                        const minY = Math.min(...selectedElements.map((element) => element.y));
                        const maxX = Math.max(...selectedElements.map((element) => element.x + (element.width || 0)));
                        const maxY = Math.max(...selectedElements.map((element) => element.y + (element.height || 0)));
                        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
                    };

                    switch (lowerKey) {
                        case 'a': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { x: bounds.minX }));
                            return;
                        }
                        case 'd': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { x: bounds.maxX - (element.width || 0) }));
                            return;
                        }
                        case 'w': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { y: bounds.minY }));
                            return;
                        }
                        case 's': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { y: bounds.maxY - (element.height || 0) }));
                            return;
                        }
                        case 'e': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { x: bounds.minX + (bounds.width - (element.width || 0)) / 2 }));
                            return;
                        }
                        case 'q': {
                            e.preventDefault();
                            const bounds = getBounds();
                            selectedElements.forEach((element) => latest.handleElementChange(element.id, { y: bounds.minY + (bounds.height - (element.height || 0)) / 2 }));
                            return;
                        }
                    }

                    if (selectedElements.length >= 3 && lowerKey === 'h') {
                        e.preventDefault();
                        const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
                        const totalWidth = sorted.reduce((sum, element) => sum + (element.width || 0), 0);
                        const first = sorted[0];
                        const last = sorted[sorted.length - 1];
                        const totalSpace = (last.x + (last.width || 0)) - first.x;
                        const gap = (totalSpace - totalWidth) / (sorted.length - 1);
                        let currentX = first.x;
                        sorted.forEach((element, index) => {
                            if (index === 0) {
                                currentX += (element.width || 0) + gap;
                                return;
                            }
                            latest.handleElementChange(element.id, { x: currentX });
                            currentX += (element.width || 0) + gap;
                        });
                        return;
                    }
                }
            }

            switch (lowerKey) {
                case 'v':
                    latest.setActiveTool('select');
                    announce('切换选择工具', 'V');
                    return;
                case 'h':
                    latest.setActiveTool('hand');
                    announce('切换拖动工具', 'H');
                    return;
                case 'm':
                    latest.setActiveTool('mark');
                    announce('切换标记工具', 'M');
                    return;
                case 't':
                    latest.handleAddText();
                    announce('插入文本', 'T');
                    return;
                case 'b':
                    latest.setActiveTool('draw');
                    announce('切换画笔', 'B');
                    return;
                case 'f':
                    latest.setActiveTool('frame');
                    announce('切换画板工具', 'F');
                    return;
                case 'a':
                    latest.openImageGeneratorRef.current();
                    announce('打开图像生成器', 'A');
                    return;
            }

            if ((key === 'Delete' || key === 'Backspace') && latest.selectedIds.length > 0) {
                latest.removeElementsByIds(latest.selectedIds);
                announce('删除所选元素', 'Delete');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
