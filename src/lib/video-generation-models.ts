import type { AiProviderId } from './ai-providers';

export const VIDEO_DURATION_OPTIONS = ['4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s', '20s', '25s'] as const;
export type VideoDuration = typeof VIDEO_DURATION_OPTIONS[number];

export const VIDEO_MODEL_OPTIONS = [
  'veo3.1',
  'veo3.1-fast',
  'veo3.1-components',
  'doubao-seedance-2-0-260128',
  'sora-2',
  'grok-video-3-pro',
  'doubao-seed-2-0-pro-260215',
  'veo_3_1',
  'veo_3_1-fast',
  'veo_3_1-components',
  'jiekou-sora-2',
  'jiekou-veo-3.1',
  'sora-2_1280x720',
  'ssora-2-pro_1280x720',
  'sora-2-pro_1792x1024',
] as const;

export type VideoModel = (typeof VIDEO_MODEL_OPTIONS)[number];
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9';
export type VideoResolution = '480p' | '720p' | '1080p';
export type DomesticGenerationMode = 'first-last-frame' | 'omni-reference';

export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  'veo3.1': 'Veo 3.1',
  'veo3.1-fast': 'Veo 3.1 Fast',
  'veo3.1-components': 'Veo 3.1 Components',
  'doubao-seedance-2-0-260128': 'Doubao Seedance 2.0',
  'sora-2': 'Sora 2',
  'grok-video-3-pro': 'Grok Video 3 Pro',
  'doubao-seed-2-0-pro-260215': 'Doubao Seed 2.0 Pro',
  'veo_3_1': 'Veo 3.1 (GeekNow)',
  'veo_3_1-fast': 'Veo 3.1 Fast (GeekNow)',
  'veo_3_1-components': 'Veo 3.1 Components (GeekNow)',
  'jiekou-sora-2': 'Sora 2',
  'jiekou-veo-3.1': 'Veo 3.1',
  'sora-2_1280x720': 'V-API Sora 2 1280x720',
  'ssora-2-pro_1280x720': 'V-API Sora 2 Pro 1280x720',
  'sora-2-pro_1792x1024': 'V-API Sora 2 Pro 1792x1024',
};

export const VIDEO_MODEL_DESC: Record<VideoModel, string> = {
  'veo3.1': '支持首帧/尾帧图片',
  'veo3.1-fast': '支持首帧/尾帧图片，更便宜，质量低于 Veo 3.1',
  'veo3.1-components': '支持1-3张参考图',
  'doubao-seedance-2-0-260128': '国产多模态官方格式，支持首尾帧模式和全能参考模式',
  'sora-2': 'GeekNow Sora 2，支持文生视频和首帧参考',
  'grok-video-3-pro': 'GeekNow Grok Video Pro（10s），支持 720P/1080P 与参考图',
  'doubao-seed-2-0-pro-260215': '豆包 Seed 2.0 Pro，支持首尾帧/全能参考、480P/720P、音频与提示词增强',
  'veo_3_1': 'GeekNow Veo 3.1（支持5s/8s、首尾帧图片、当前渠道可能不可用）',
  'veo_3_1-fast': 'GeekNow Veo 3.1 Fast（支持5s/8s、首尾帧图片、更快更便宜）',
  'veo_3_1-components': 'GeekNow Veo 3.1 Components（支持5s/8s、多张参考图模式）',
  'jiekou-sora-2': 'JieKou AI Sora 2，支持文生视频和单图图生视频',
  'jiekou-veo-3.1': 'JieKou AI Veo 3.1，支持文生视频和首尾帧图生视频',
  'sora-2_1280x720': 'V-API Sora 2，固定 1280x720，支持文生视频和首帧参考',
  'ssora-2-pro_1280x720': 'V-API Sora 2 Pro，固定 1280x720，支持文生视频和首帧参考',
  'sora-2-pro_1792x1024': 'V-API Sora 2 Pro，固定 1792x1024，支持文生视频和首帧参考',
};

const ALL_VIDEO_MODELS = new Set<string>(VIDEO_MODEL_OPTIONS);

export function isVideoModel(value: unknown): value is VideoModel {
  return typeof value === 'string' && ALL_VIDEO_MODELS.has(value);
}

export function isComponentsVideoModel(model: string): boolean {
  return model === 'veo3.1-components';
}

export function isDomesticMultimodalVideoModel(model: string): boolean {
  return model === 'doubao-seedance-2-0-260128' || model === 'doubao-seed-2-0-pro-260215';
}

export function isVApiSoraVideoModel(model: string): boolean {
  return model === 'sora-2_1280x720'
    || model === 'ssora-2-pro_1280x720'
    || model === 'sora-2-pro_1792x1024';
}

export function resolveVApiSoraModelAndSize(model: string): { model: 'sora-2' | 'sora-2-pro'; size: '1280x720' | '1792x1024' } {
  if (model === 'sora-2_1280x720') {
    return { model: 'sora-2', size: '1280x720' };
  }

  if (model === 'sora-2-pro_1792x1024') {
    return { model: 'sora-2-pro', size: '1792x1024' };
  }

  return { model: 'sora-2-pro', size: '1280x720' };
}

export function isMagicApiSoraVideoModel(model: string): boolean {
  return model.startsWith('sora-') && !isVApiSoraVideoModel(model);
}

export function isMagicApiVeoVideoModel(model: string): boolean {
  return model.startsWith('veo_');
}

export function isMagicApiVeoFirstLastFrameVideoModel(model: string): boolean {
  return model === 'veo_3_1' || model === 'veo_3_1-fast';
}

export function isMagicApiVeoComponentsVideoModel(model: string): boolean {
  return model === 'veo_3_1-components';
}

export function isJieKouSoraVideoModel(model: string): boolean {
  return model === 'jiekou-sora-2';
}

export function isJieKouVeoVideoModel(model: string): boolean {
  return model === 'jiekou-veo-3.1';
}

export function isJieKouVideoModel(model: string): boolean {
  return isJieKouSoraVideoModel(model) || isJieKouVeoVideoModel(model);
}

export function isMagicApiGrokVideoModel(model: string): boolean {
  return model.startsWith('grok-video-');
}

export function isMagicApiDoubaoVideoModel(model: string): boolean {
  return model.startsWith('doubao-seedance-') || model.startsWith('doubao-seed-');
}

export function isMagicApiDoubaoUrlVideoModel(model: string): boolean {
  return model === 'doubao-seedance-2-0-260128' || model === 'doubao-seed-2-0-pro-260215';
}

export function isMagicApiDoubaoMultipartVideoModel(model: string): boolean {
  return model.startsWith('doubao-seedance-1-5-pro_');
}

export function isMagicApiWanVideoModel(model: string): boolean {
  return model.startsWith('wan2.6-');
}

export function isMagicApiWanImageToVideoModel(model: string): boolean {
  return model.startsWith('wan2.6-i2v');
}

export function isMagicApiViduVideoModel(model: string): boolean {
  return model.startsWith('Vidu-');
}

export function isMagicApiKlingVideoModel(model: string): boolean {
  return model.startsWith('Kling-');
}

export function isMagicApiHailuoVideoModel(model: string): boolean {
  return model.startsWith('Hailuo-');
}

export function isMagicApiJsonVideoModel(model: string): boolean {
  return isMagicApiWanVideoModel(model)
    || isMagicApiViduVideoModel(model)
    || isMagicApiKlingVideoModel(model)
    || isMagicApiHailuoVideoModel(model);
}

export function supportsVideoAudioGeneration(model: string): boolean {
  return isDomesticMultimodalVideoModel(model)
    || isMagicApiSoraVideoModel(model)
    || isMagicApiVeoVideoModel(model)
    || isJieKouVeoVideoModel(model)
    || isMagicApiWanVideoModel(model)
    || isMagicApiKlingVideoModel(model);
}

export function isMagicApiMultipartVideoModel(model: string): boolean {
  return isMagicApiSoraVideoModel(model)
    || isMagicApiVeoVideoModel(model)
    || isMagicApiGrokVideoModel(model)
    || isMagicApiDoubaoMultipartVideoModel(model);
}

export function getMaxImagesForVideoModel(model: string): number {
  if (isVApiSoraVideoModel(model)) {
    return 1;
  }

  if (isJieKouSoraVideoModel(model)) {
    return 1;
  }

  if (isJieKouVeoVideoModel(model)) {
    return 2;
  }

  if (isComponentsVideoModel(model)) {
    return 3;
  }

  if (isMagicApiVeoComponentsVideoModel(model)) {
    return 3;
  }

  if (isDomesticMultimodalVideoModel(model)) {
    return 9;
  }

  if (isMagicApiDoubaoMultipartVideoModel(model)) {
    return 2;
  }

  if (isMagicApiWanVideoModel(model)) {
    return isMagicApiWanImageToVideoModel(model) ? 1 : 0;
  }

  if (isMagicApiHailuoVideoModel(model)) {
    return 1;
  }

  if (isMagicApiViduVideoModel(model)) {
    return 3;
  }

  if (isMagicApiGrokVideoModel(model)) {
    return 6;
  }

  if (isMagicApiVeoFirstLastFrameVideoModel(model)) {
    return 2;
  }

  return 2;
}

export function getMaxVideosForVideoModel(model: string): number {
  return isDomesticMultimodalVideoModel(model) ? 3 : 0;
}

export function getMaxAudiosForVideoModel(model: string): number {
  return isDomesticMultimodalVideoModel(model) ? 3 : 0;
}

export function getVideoAspectRatioOptions(model: string): VideoAspectRatio[] {
  if (isVApiSoraVideoModel(model)) {
    return ['16:9'];
  }

  if (isJieKouVideoModel(model)) {
    return ['16:9', '9:16'];
  }

  if (isDomesticMultimodalVideoModel(model)) {
    return ['16:9', '9:16', '1:1', '4:3', '3:4'];
  }

  if (isMagicApiGrokVideoModel(model)) {
    return ['16:9', '9:16', '1:1', '3:2', '2:3'];
  }

  if (isMagicApiWanVideoModel(model) || isMagicApiViduVideoModel(model) || isMagicApiKlingVideoModel(model)) {
    return ['16:9', '9:16', '1:1'];
  }

  return ['16:9', '9:16'];
}

export function getVideoDurationOptions(model: string): VideoDuration[] {
  if (isVApiSoraVideoModel(model)) {
    return ['4s', '8s', '12s'];
  }

  if (isJieKouSoraVideoModel(model)) {
    return ['4s', '8s', '12s'];
  }

  if (isJieKouVeoVideoModel(model)) {
    return ['4s', '6s', '8s'];
  }

  if (isDomesticMultimodalVideoModel(model)) {
    return ['4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s'];
  }

  if (model === 'grok-video-3-pro') {
    return ['10s'];
  }

  if (isMagicApiSoraVideoModel(model)) {
    return ['5s', '10s', '15s'];
  }

  if (isMagicApiVeoVideoModel(model)) {
    return ['5s', '8s'];
  }

  if (isMagicApiWanVideoModel(model) || isMagicApiViduVideoModel(model) || isMagicApiKlingVideoModel(model) || isMagicApiHailuoVideoModel(model)) {
    return ['5s', '10s', '15s', '20s', '25s'];
  }

  return ['5s', '8s'];
}

export function getVideoResolutionOptions(model: string): VideoResolution[] {
  if (isVApiSoraVideoModel(model)) {
    return model === 'sora-2-pro_1792x1024' ? ['1080p'] : ['720p'];
  }

  if (isJieKouVideoModel(model)) {
    return ['720p', '1080p'];
  }

  if (isMagicApiGrokVideoModel(model)) {
    return ['720p', '1080p'];
  }

  if (model.endsWith('_480p')) return ['480p'];
  if (model.endsWith('_1080p') || model.includes('1920*1080')) return ['1080p'];
  if (model.endsWith('_720p') || model.includes('1280*720')) return ['720p'];

  return isDomesticMultimodalVideoModel(model) ? ['480p', '720p'] : ['720p'];
}

export function getVideoAddImageTitle(model: string, domesticMode?: DomesticGenerationMode): string {
  if (isVApiSoraVideoModel(model)) {
    return '添加首帧图片';
  }

  if (isJieKouSoraVideoModel(model)) {
    return '添加首帧图片';
  }

  if (isJieKouVeoVideoModel(model)) {
    return '添加首帧/尾帧图片';
  }

  if (isComponentsVideoModel(model)) {
    return '添加参考图 (1-3张)';
  }

  if (isMagicApiVeoComponentsVideoModel(model)) {
    return '添加参考图 (1-3张)';
  }

  if (isDomesticMultimodalVideoModel(model)) {
    return domesticMode === 'first-last-frame' ? '添加首尾帧图片' : '添加全能参考素材';
  }

  if (isMagicApiWanVideoModel(model)) {
    return isMagicApiWanImageToVideoModel(model) ? '添加首帧图片' : '文生视频无需参考图';
  }

  if (isMagicApiDoubaoMultipartVideoModel(model)) {
    return '添加首帧/尾帧图片';
  }

  if (isMagicApiViduVideoModel(model)) {
    return '添加参考图 (最多3张)';
  }

  if (isMagicApiHailuoVideoModel(model)) {
    return '添加首帧图片';
  }

  if (isMagicApiVeoFirstLastFrameVideoModel(model)) {
    return '添加首帧/尾帧图片';
  }

  if (isMagicApiGrokVideoModel(model)) {
    return '添加参考图 (最多6张)';
  }

  return '添加首帧/尾帧图片';
}

export function getDefaultVideoModelForProvider(providerId: AiProviderId): VideoModel {
  if (providerId === 'vapi') {
    return 'sora-2_1280x720';
  }

  if (providerId === 'jiekou') {
    return 'jiekou-sora-2';
  }

  return providerId === 'magicapi' ? 'sora-2' : 'veo3.1';
}

export function getFixedVideoSeconds(model: string): number | undefined {
  if (model === 'grok-video-3-pro') return 10;
  return undefined;
}

export function getFallbackVideoSeconds(model: string): number {
  const fixed = getFixedVideoSeconds(model);
  if (fixed !== undefined) return fixed;
  if (isVApiSoraVideoModel(model)) return 8;
  if (isJieKouVideoModel(model)) return 8;
  if (isMagicApiVeoVideoModel(model)) return 8;
  if (isMagicApiSoraVideoModel(model)) return 10;
  if (isMagicApiDoubaoVideoModel(model)) return 5;
  if (isMagicApiWanVideoModel(model) || isMagicApiViduVideoModel(model) || isMagicApiKlingVideoModel(model) || isMagicApiHailuoVideoModel(model)) return 15;
  return 5;
}

export function resolveMagicApiVideoSeconds(model: string, duration: number | undefined): number {
  const fixed = getFixedVideoSeconds(model);
  if (fixed !== undefined) {
    return fixed;
  }

  const fallback = getFallbackVideoSeconds(model);
  if (!Number.isFinite(duration) || duration === undefined || duration <= 0) {
    return fallback;
  }

  if (isMagicApiDoubaoMultipartVideoModel(model)) {
    return Math.max(4, Math.min(11, Math.trunc(duration)));
  }

  if (isMagicApiDoubaoUrlVideoModel(model)) {
    return Math.max(4, Math.min(15, Math.trunc(duration)));
  }

  return Math.trunc(duration);
}

export function resolveMagicApiVideoPixelSize(aspectRatio: string | undefined): string {
  if (aspectRatio === '9:16') return '720x1280';
  if (aspectRatio === '1:1') return '720x720';
  return '1280x720';
}

export function resolveMagicApiGrokResolution(resolution: string | undefined): string {
  return resolution === '720p' ? '720P' : '1080P';
}
