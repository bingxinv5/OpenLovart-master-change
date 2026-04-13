import type { MentionItem, SuggestionItem } from './ai-designer-panel-types';

export const quickCommands = [
    { label: '🎨 配色方案', prompt: '请为我推荐一套专业的配色方案，包含主色、辅色和强调色，说明每种颜色的用途和十六进制色值' },
    { label: '🖋 字体搭配', prompt: '请推荐 3 组适合现代设计的中英文字体搭配方案，说明标题和正文分别用什么字体' },
    { label: '📐 布局建议', prompt: '请为一个产品落地页提供专业的布局建议，包括首屏、特性展示、用户评价和CTA区域的设计要点' },
    { label: '✨ 设计评审', prompt: '请扮演高级设计评审员，我将发送设计稿，请从视觉层次、对齐、留白、一致性等方面给出专业评审意见' },
    { label: '📱 响应式设计', prompt: '请为一个SaaS产品提供桌面端、平板和手机端的响应式设计策略和断点建议' },
    { label: '🖼 故事板', prompt: '请帮我创建一个6帧的故事板大纲，用于展示一个产品从发现问题到解决方案的用户旅程' },
] as const;

export const aiModels = [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'Google', color: 'text-blue-600' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', provider: 'Google', color: 'text-blue-500' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', color: 'text-amber-600' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'Anthropic', color: 'text-amber-700' },
    { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'OpenAI', color: 'text-green-600' },
    { id: 'gpt-5.4-pro', label: 'GPT-5.4 Pro', provider: 'OpenAI', color: 'text-green-500' },
] as const;

export const mentionItems: MentionItem[] = [
    {
        id: 'design-review', label: '📝 设计评审', description: '让 AI 评审你的设计稿', insert: '@设计评审 ', type: 'tool-prompt',
        systemPrompt: '你现在是一位资深设计评审专家，请对以下设计进行专业评审。请从以下维度进行详细分析并给出改进建议：\n1. 视觉层次与信息架构\n2. 色彩搭配与对比度\n3. 字体选择与排版\n4. 对齐与间距\n5. 留白与呼吸感\n6. 一致性与统一性\n7. 可访问性\n\n用户的设计需求/描述：{prompt}',
    },
    {
        id: 'color-palette', label: '🎨 配色方案', description: '生成专业配色方案', insert: '@配色方案 ', type: 'tool-prompt',
        systemPrompt: '你是一位专业配色设计专家。请为以下需求生成一套完整的专业配色方案。请包含：\n1. 主色（Primary）- 品牌核心色，给出 HEX、RGB 值\n2. 辅色（Secondary）- 1-2 个辅助色\n3. 强调色（Accent）- 用于 CTA 和重点元素\n4. 中性色（Neutral）- 背景、文字等\n5. 语义色（Semantic）- 成功、警告、错误、信息\n6. 每种颜色的设计意图和使用场景说明\n7. 深色模式适配建议\n\n请用色块示例和具体的色值呈现方案。\n\n用户需求：{prompt}',
    },
    {
        id: 'font-pair', label: '📝 字体搭配', description: '推荐字体搭配方案', insert: '@字体搭配 ', type: 'tool-prompt',
        systemPrompt: '你是一位字体排版设计专家。请为以下需求推荐 3 组专业的字体搭配方案，每组需包含：\n1. 标题字体（中文 + 英文）- 名称、字重、推荐字号\n2. 正文字体（中文 + 英文）- 名称、字重、推荐字号\n3. 辅助字体 - 用于标注、说明文字\n4. 行高、字间距建议\n5. 字体搭配的设计理由和适用场景\n6. 免费/商用字体替代方案\n\n用户需求：{prompt}',
    },
    {
        id: 'layout', label: '📐 布局建议', description: '提供页面布局建议', insert: '@布局建议 ', type: 'tool-prompt',
        systemPrompt: '你是一位 UI 布局设计专家。请为以下需求提供详细的页面布局方案，包含：\n1. 整体布局结构（网格系统、栅格比例）\n2. 各功能区域的划分和尺寸建议\n3. 视觉动线和阅读顺序\n4. 间距和对齐规范\n5. 响应式断点策略\n6. 关键组件的位置和层级关系\n7. 如可能，请用 ASCII 或文字描述简易线框图\n\n用户需求：{prompt}',
    },
    {
        id: 'brand', label: '✨ 品牌设计', description: '品牌视觉识别系统', insert: '@品牌设计 ', type: 'tool-prompt',
        systemPrompt: '你是一位品牌设计顾问。请为以下需求提供完整的品牌视觉识别系统（VIS）方案，包含：\n1. 品牌定位与调性分析\n2. Logo 设计方向（3 个概念方向描述）\n3. 主色系与辅助色系（含色值）\n4. 标准字体规范（标题、正文、辅助）\n5. 图形元素与辅助图案\n6. 品牌应用规范（名片、信封、PPT 等）\n7. 品牌使用禁忌\n\n用户需求：{prompt}',
    },
    {
        id: 'ux-audit', label: '📱 UX 分析', description: '用户体验分析与建议', insert: '@UX分析 ', type: 'tool-prompt',
        systemPrompt: '你是一位资深 UX 设计专家。请对以下内容进行全面的用户体验分析，包含：\n1. 用户旅程分析（关键触点和情绪曲线）\n2. 交互设计评估（操作流程、反馈机制）\n3. 信息架构分析（导航、层级）\n4. 可用性问题识别与改进建议\n5. 无障碍设计检查\n6. 移动端适配评估\n7. 具体的优化建议和优先级排序\n\n用户需求/描述：{prompt}',
    },
];

export const suggestions: SuggestionItem[] = [
    { title: '酒单设计', description: '模仿这种效果生成一张海报，风格简约大气，配色以深色为主调，搭配金色点缀', color: 'bg-blue-50', imageColor: 'bg-blue-200' },
    { title: '咖啡品牌设计', description: '你是品牌设计专家，生成一套品牌方案，包含logo、配色、字体和包装设计', color: 'bg-orange-50', imageColor: 'bg-orange-200' },
    { title: '故事板', description: '我需要一个故事板来展示产品使用流程，包含6个场景，风格可爱卡通', color: 'bg-purple-50', imageColor: 'bg-purple-200' },
    { title: '科技产品海报', description: '为一款智能手表设计一张产品发布海报，未来感十足，背景用深蓝渐变', color: 'bg-cyan-50', imageColor: 'bg-cyan-200' },
    { title: '社交媒体素材', description: '为电商大促设计一组社交媒体宣传图，包含主图、轮播图和故事封面', color: 'bg-pink-50', imageColor: 'bg-pink-200' },
    { title: '品牌VI系统', description: '为一家新能源公司设计完整的品牌VI系统，包含Logo、名片、信封和PPT模板', color: 'bg-green-50', imageColor: 'bg-green-200' },
    { title: 'App界面设计', description: '为一款健身App设计首页和运动记录页面，风格现代简约，使用活力色彩', color: 'bg-yellow-50', imageColor: 'bg-yellow-200' },
    { title: '插画设计', description: '设计一组扁平风插画，主题是远程办公场景，包含4个不同的工作场景', color: 'bg-red-50', imageColor: 'bg-red-200' },
    { title: '包装设计', description: '为一款有机茶叶品牌设计产品包装，风格中式极简，融合传统水墨元素', color: 'bg-emerald-50', imageColor: 'bg-emerald-200' },
];
