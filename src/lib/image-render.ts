export interface DecodedCanvasImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export async function decodeCanvasImageFromBlob(blob: Blob): Promise<DecodedCanvasImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // fall through to HTMLImageElement fallback
    }
  }

  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The source image could not be decoded.'));
    };

    image.src = url;
  });
}