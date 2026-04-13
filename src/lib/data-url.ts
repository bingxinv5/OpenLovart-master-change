export interface ParsedDataUrl {
  mime: string;
  data: string;
  isBase64: boolean;
}

const BASE64_MARKER = /;base64(?=;|$)/i;
const DEFAULT_MIME = 'text/plain;charset=US-ASCII';

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const commaIndex = dataUrl.indexOf(',');
  if (!isDataUrl(dataUrl) || commaIndex === -1) {
    throw new Error('Invalid data URL');
  }

  const meta = dataUrl.slice(5, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);

  return {
    mime: meta.replace(BASE64_MARKER, '') || DEFAULT_MIME,
    data,
    isBase64: BASE64_MARKER.test(meta),
  };
}

export function decodePercentEncodedData(data: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < data.length; i += 1) {
    if (data[i] === '%' && i + 2 < data.length) {
      const value = Number.parseInt(data.slice(i + 1, i + 3), 16);
      if (!Number.isNaN(value)) {
        bytes.push(value);
        i += 2;
        continue;
      }
    }

    bytes.push(data.charCodeAt(i) & 0xff);
  }

  return Uint8Array.from(bytes);
}

export function decodeDataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const { data, mime, isBase64 } = parseDataUrl(dataUrl);

  if (!isBase64) {
    return { bytes: decodePercentEncodedData(data), mime };
  }

  const normalized = data.replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return { bytes: Uint8Array.from(Buffer.from(normalized, 'base64')), mime };
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mime };
}

export function decodeDataUrlArrayBuffer(dataUrl: string): { buffer: ArrayBuffer; mime: string } {
  const { bytes, mime } = decodeDataUrlBytes(dataUrl);
  const normalizedBytes = new Uint8Array(bytes.byteLength);
  normalizedBytes.set(bytes);
  return {
    buffer: normalizedBytes.buffer,
    mime,
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function extractDataUrlBase64(dataUrl: string): string {
  const parsed = parseDataUrl(dataUrl);
  if (parsed.isBase64) {
    return parsed.data.replace(/\s+/g, '');
  }
  return bytesToBase64(decodePercentEncodedData(parsed.data));
}

export function normalizeDataUrlToBase64(dataUrl: string): string {
  const { mime } = parseDataUrl(dataUrl);
  return `data:${mime};base64,${extractDataUrlBase64(dataUrl)}`;
}
