export type CanvasImageToolId = 'annotate-image' | 'crop-image' | 'split-storyboard';

export interface CanvasImageToolDefinition {
  id: CanvasImageToolId;
  title: string;
  description: string;
}

export const canvasImageTools: Record<CanvasImageToolId, CanvasImageToolDefinition> = {
  'annotate-image': {
    id: 'annotate-image',
    title: '标注图片',
    description: '给图片增加标题、备注和序号说明。',
  },
  'crop-image': {
    id: 'crop-image',
    title: '裁剪图片',
    description: '按比例和焦点快速裁剪出一张新的图片。',
  },
  'split-storyboard': {
    id: 'split-storyboard',
    title: '分镜切割',
    description: '将一张分镜图按行列切割为多张独立图片。',
  },
};

export function getCanvasImageTool(id: CanvasImageToolId) {
  return canvasImageTools[id];
}

export function listCanvasImageTools() {
  return Object.values(canvasImageTools);
}
