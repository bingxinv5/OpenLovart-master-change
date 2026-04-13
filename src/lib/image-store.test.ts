import { describe, it, expect } from 'vitest';
import { isImageRef, getRefId, makeRef, IMAGE_REF_PREFIX, getImageLookupCandidateKeys } from './image-store';

describe('image-store ref utilities', () => {
  it('IMAGE_REF_PREFIX is the expected value', () => {
    expect(IMAGE_REF_PREFIX).toBe('imgref://');
  });

  it('isImageRef returns true for valid refs', () => {
    expect(isImageRef('imgref://abc123')).toBe(true);
    expect(isImageRef('imgref://x')).toBe(true);
  });

  it('isImageRef returns false for non-refs', () => {
    expect(isImageRef(null)).toBe(false);
    expect(isImageRef(undefined)).toBe(false);
    expect(isImageRef('')).toBe(false);
    expect(isImageRef('data:image/png;base64,...')).toBe(false);
    expect(isImageRef('https://example.com/img.png')).toBe(false);
    expect(isImageRef('blob:http://localhost/xyz')).toBe(false);
  });

  it('getRefId extracts the ID', () => {
    expect(getRefId('imgref://abc123')).toBe('abc123');
    expect(getRefId('imgref://')).toBe('');
  });

  it('makeRef creates a valid ref', () => {
    expect(makeRef('abc123')).toBe('imgref://abc123');
    expect(isImageRef(makeRef('test'))).toBe(true);
  });

  it('roundtrip: makeRef → getRefId', () => {
    const id = 'my-image-id';
    expect(getRefId(makeRef(id))).toBe(id);
  });

  it('prefers original blob first when no target LOD is specified', () => {
    expect(getImageLookupCandidateKeys('abc', null)).toEqual([
      'abc',
      'abc__lod_2048',
      'abc__lod_1024',
      'abc__lod_512',
      'abc__lod_256',
      'abc__lod_64',
    ]);
  });

  it('falls back across larger then smaller LODs around a preferred level', () => {
    expect(getImageLookupCandidateKeys('abc', 512)).toEqual([
      'abc__lod_512',
      'abc__lod_1024',
      'abc__lod_2048',
      'abc',
      'abc__lod_256',
      'abc__lod_64',
    ]);
  });

  it('keeps original blob as a fallback when only high-detail render is requested', () => {
    expect(getImageLookupCandidateKeys('abc', 2048)).toEqual([
      'abc__lod_2048',
      'abc',
      'abc__lod_1024',
      'abc__lod_512',
      'abc__lod_256',
      'abc__lod_64',
    ]);
  });
});
