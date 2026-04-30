export interface DecodedWorkerImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export function bufferToBlob(buffer: ArrayBuffer, mime: string): Blob {
  return new Blob([buffer], { type: mime });
}

export async function decodeWorkerImage(
  buffer: ArrayBuffer,
  mime: string,
): Promise<DecodedWorkerImage> {
  const DecoderCtor = (globalThis as { ImageDecoder?: new (input: { data: Uint8Array; type: string }) => {
    decode: () => Promise<{ image: { codedWidth?: number; codedHeight?: number; displayWidth?: number; displayHeight?: number; close?: () => void } }>;
    close?: () => void;
  } }).ImageDecoder;

  if (DecoderCtor) {
    const decoder = new DecoderCtor({
      data: new Uint8Array(buffer),
      type: mime || 'image/png',
    });
    const { image } = await decoder.decode();
    return {
      source: image as CanvasImageSource,
      width: image.displayWidth ?? image.codedWidth ?? 0,
      height: image.displayHeight ?? image.codedHeight ?? 0,
      release: () => {
        image.close?.();
        decoder.close?.();
      },
    };
  }

  const blob = bufferToBlob(buffer, mime);
  const bitmap = await createImageBitmap(blob);
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close(),
  };
}
