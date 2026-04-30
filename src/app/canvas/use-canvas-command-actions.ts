import { useMemo } from 'react';
import type { CanvasCommandAction } from '@/components/lovart/CanvasCommandPalette';

interface UseCanvasCommandActionsOptions {
    activeTool: string;
    setActiveTool: (tool: string) => void;
    saveProject: () => Promise<unknown> | unknown;
    showLayers: boolean;
    showHistory: boolean;
    showMedia: boolean;
    showChat: boolean;
    toggleLayers: () => void;
    toggleHistory: () => void;
    toggleMedia: () => void;
    toggleChat: () => void;
    handleFitToScreen: () => void;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    historySummary: {
        canUndo: boolean;
        canRedo: boolean;
        lastAction?: string;
    };
    undo: () => void;
    redo: () => void;
    handleAddText: () => void;
    handleOpenImageGenerator: () => void;
    handleOpenVideoGenerator: () => void;
    handleOpenStoryboardPlanner: () => void;
}

export function useCanvasCommandActions({
    activeTool,
    setActiveTool,
    saveProject,
    showLayers,
    showHistory,
    showMedia,
    showChat,
    toggleLayers,
    toggleHistory,
    toggleMedia,
    toggleChat,
    handleFitToScreen,
    handleZoomIn,
    handleZoomOut,
    historySummary,
    undo,
    redo,
    handleAddText,
    handleOpenImageGenerator,
    handleOpenVideoGenerator,
    handleOpenStoryboardPlanner,
}: UseCanvasCommandActionsOptions) {
    return useMemo<CanvasCommandAction[]>(() => [
        {
            id: 'save-project',
            label: '保存当前项目',
            description: '立即将标题、元素和本地缓存状态落盘。',
            shortcut: 'Ctrl+S',
            section: '工作台',
            keywords: ['保存', 'save', 'project'],
            perform: () => { void saveProject(); },
        },
        {
            id: 'open-layers',
            label: showLayers ? '关闭图层面板' : '打开图层面板',
            description: '查看图层结构、批量改名和分镜字段。',
            section: '面板',
            keywords: ['图层', 'layers', '侧栏'],
            active: showLayers,
            perform: toggleLayers,
        },
        {
            id: 'open-history',
            label: showHistory ? '关闭历史侧栏' : '打开历史侧栏',
            description: '查看撤销时间线、运行态分块和固定激活区。',
            section: '面板',
            keywords: ['历史', 'undo', 'redo'],
            active: showHistory,
            perform: toggleHistory,
        },
        {
            id: 'open-media',
            label: showMedia ? '关闭媒体历史' : '打开媒体历史',
            description: '查看当前项目沉淀的图片与视频结果，并快速回流到画布。',
            section: '面板',
            keywords: ['media', 'history', 'library', '媒体', '素材'],
            active: showMedia,
            perform: toggleMedia,
        },
        {
            id: 'open-chat',
            label: showChat ? '关闭 AI 工作台' : '打开 AI 工作台',
            description: '在侧栏或底部与 AI 设计助手联动。',
            section: '面板',
            keywords: ['chat', 'ai', 'sparkles', '对话'],
            active: showChat,
            perform: toggleChat,
        },
        {
            id: 'fit-to-screen',
            label: '适应屏幕',
            description: '根据当前画布内容重置视图，回到舒适查看区。',
            shortcut: 'Shift+1',
            section: '视图',
            keywords: ['fit', 'screen', '适应'],
            perform: handleFitToScreen,
        },
        {
            id: 'zoom-in',
            label: '放大画布',
            description: '提升当前视图缩放比例。',
            shortcut: 'Ctrl++',
            section: '视图',
            keywords: ['zoom', '放大'],
            perform: handleZoomIn,
        },
        {
            id: 'zoom-out',
            label: '缩小画布',
            description: '降低当前视图缩放比例。',
            shortcut: 'Ctrl+-',
            section: '视图',
            keywords: ['zoom', '缩小'],
            perform: handleZoomOut,
        },
        {
            id: 'undo',
            label: '撤销上一步',
            description: historySummary.canUndo ? `最近动作：${historySummary.lastAction}` : '当前没有可撤销记录。',
            shortcut: 'Ctrl+Z',
            section: '编辑',
            keywords: ['undo', '撤销'],
            active: historySummary.canUndo,
            perform: undo,
        },
        {
            id: 'redo',
            label: '重做下一步',
            description: historySummary.canRedo ? '恢复刚刚撤销的动作。' : '当前已经是最新状态。',
            shortcut: 'Ctrl+Shift+Z',
            section: '编辑',
            keywords: ['redo', '重做'],
            active: historySummary.canRedo,
            perform: redo,
        },
        {
            id: 'set-select-tool',
            label: '切换到选择工具',
            description: '恢复常规选取与拖拽编辑。',
            shortcut: 'V',
            section: '工具',
            keywords: ['select', '选择'],
            active: activeTool === 'select',
            perform: () => setActiveTool('select'),
        },
        {
            id: 'set-hand-tool',
            label: '切换到拖动工具',
            description: '快速平移大画布。',
            shortcut: 'H',
            section: '工具',
            keywords: ['hand', 'pan', '拖动'],
            active: activeTool === 'hand',
            perform: () => setActiveTool('hand'),
        },
        {
            id: 'set-mark-tool',
            label: '切换到标记工具',
            description: '在画布上快速布点和标记。',
            shortcut: 'M',
            section: '工具',
            keywords: ['mark', '标记'],
            active: activeTool === 'mark',
            perform: () => setActiveTool('mark'),
        },
        {
            id: 'set-frame-tool',
            label: '切换到智能画板工具',
            description: '创建或布局新的画板容器。',
            shortcut: 'F',
            section: '工具',
            keywords: ['frame', '画板'],
            active: activeTool === 'frame',
            perform: () => setActiveTool('frame'),
        },
        {
            id: 'set-draw-tool',
            label: '切换到画笔工具',
            description: '进入自由绘制模式。',
            shortcut: 'B',
            section: '工具',
            keywords: ['draw', '画笔'],
            active: activeTool === 'draw',
            perform: () => setActiveTool('draw'),
        },
        {
            id: 'add-text',
            label: '插入文本',
            description: '在当前视图中心附近添加一个文本元素。',
            shortcut: 'T',
            section: '内容',
            keywords: ['text', '文本'],
            perform: handleAddText,
        },
        {
            id: 'open-image-generator',
            label: '打开图像生成器',
            description: '在画布中心生成一个新的图片生成器面板。',
            shortcut: 'A',
            section: '生成',
            keywords: ['image generator', '生成器', '图片'],
            perform: handleOpenImageGenerator,
        },
        {
            id: 'open-video-generator',
            label: '打开视频生成器',
            description: '在画布中心生成一个新的视频生成器面板。',
            section: '生成',
            keywords: ['video generator', '视频'],
            perform: handleOpenVideoGenerator,
        },
        {
            id: 'open-storyboard-planner',
            label: '打开分镜规划器',
            description: '用多参考图生成结构化分镜草稿，并导入画布。',
            section: '生成',
            keywords: ['storyboard', 'planner', '分镜', '规划'],
            perform: handleOpenStoryboardPlanner,
        },
    ], [
        activeTool,
        handleAddText,
        handleFitToScreen,
        handleOpenImageGenerator,
        handleOpenStoryboardPlanner,
        handleOpenVideoGenerator,
        handleZoomIn,
        handleZoomOut,
        historySummary.canRedo,
        historySummary.canUndo,
        historySummary.lastAction,
        redo,
        saveProject,
        showChat,
        showHistory,
        showLayers,
        showMedia,
        setActiveTool,
        toggleChat,
        toggleHistory,
        toggleMedia,
        toggleLayers,
        undo,
    ]);
}