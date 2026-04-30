import type { CanvasShortcutSection } from '@/components/lovart/CanvasShortcutHelp';

export const CANVAS_SHORTCUT_SECTIONS: CanvasShortcutSection[] = [
    {
        title: '工作台',
        items: [
            { keys: 'Ctrl+K', label: '打开命令面板' },
            { keys: '?', label: '打开快捷键总览' },
            { keys: 'Ctrl+S', label: '保存项目' },
            { keys: 'Shift+1', label: '适应屏幕' },
        ],
    },
    {
        title: '工具',
        items: [
            { keys: 'V', label: '选择工具' },
            { keys: 'H', label: '拖动画布' },
            { keys: 'M', label: '标记工具' },
            { keys: 'F', label: '智能画板' },
            { keys: 'B', label: '自由绘制' },
            { keys: 'T', label: '插入文本' },
            { keys: 'A', label: '图像生成器' },
        ],
    },
    {
        title: '编辑',
        items: [
            { keys: 'Ctrl+Z', label: '撤销' },
            { keys: 'Ctrl+Shift+Z', label: '重做' },
            { keys: 'Ctrl+D', label: '复制所选元素' },
            { keys: 'Ctrl+C / Ctrl+V', label: '复制与粘贴' },
            { keys: 'Delete', label: '删除所选元素' },
        ],
    },
    {
        title: '视图',
        items: [
            { keys: 'Ctrl++', label: '放大' },
            { keys: 'Ctrl+-', label: '缩小' },
            { keys: 'Ctrl+0', label: '重置缩放' },
            { keys: 'Ctrl+A', label: '全选画布元素' },
        ],
    },
];