'use client';

export type ProjectThumbnailCandidate = {
  type?: string;
  hidden?: boolean;
  content?: string;
};

export function pickProjectThumbnailCandidate(
  elements: ProjectThumbnailCandidate[],
): { kind: 'image' | 'video'; content: string } | null {
  for (const element of elements) {
    if (element.hidden || !element.content) continue;
    if (element.type === 'image') {
      return { kind: 'image', content: element.content };
    }
  }

  for (const element of elements) {
    if (element.hidden || !element.content) continue;
    if (element.type === 'video') {
      return { kind: 'video', content: element.content };
    }
  }

  return null;
}

export async function captureVideoThumbnailDataUrl(
  videoUrl: string,
  options?: { maxWidth?: number; quality?: number; seekTime?: number },
): Promise<string | null> {
  if (typeof window === 'undefined' || !videoUrl) return null;

  const maxWidth = options?.maxWidth ?? 640;
  const quality = options?.quality ?? 0.82;
  const seekTime = options?.seekTime ?? 0.1;

  return await new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    let seekScheduled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const renderFrame = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          finish(null);
          return;
        }

        const scale = Math.min(1, maxWidth / width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', quality));
      } catch {
        finish(null);
      }
    };

    const scheduleSeekOrRender = () => {
      if (seekScheduled) return;
      seekScheduled = true;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const targetTime = duration > 0 ? Math.min(seekTime, Math.max(duration - 0.05, 0)) : 0;

      if (targetTime > 0.01) {
        const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          renderFrame();
        };
        video.addEventListener('seeked', handleSeeked, { once: true });
        try {
          video.currentTime = targetTime;
        } catch {
          video.removeEventListener('seeked', handleSeeked);
          renderFrame();
        }
        return;
      }

      renderFrame();
    };

    const timeoutId = window.setTimeout(() => finish(null), 4000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      video.crossOrigin = 'anonymous';
    }
    video.addEventListener('loadeddata', scheduleSeekOrRender, { once: true });
    video.addEventListener('error', () => finish(null), { once: true });
    video.src = videoUrl;
  });
}
