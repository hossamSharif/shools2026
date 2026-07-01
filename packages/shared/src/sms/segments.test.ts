import { describe, it, expect } from 'vitest';
import { countSmsSegments, UCS2_SINGLE_SEGMENT, UCS2_MULTI_SEGMENT } from './segments.js';

const arabic = (n: number) => 'ا'.repeat(n);

describe('countSmsSegments (Arabic / UCS-2)', () => {
  it('treats empty string as a single segment', () => {
    expect(countSmsSegments('')).toBe(1);
  });

  it('counts a short Arabic message as one segment', () => {
    expect(countSmsSegments('تذكير بالقسط')).toBe(1);
  });

  it('counts exactly 70 Arabic chars as one segment', () => {
    expect(countSmsSegments(arabic(UCS2_SINGLE_SEGMENT))).toBe(1);
  });

  it('counts 71 Arabic chars as two segments', () => {
    expect(countSmsSegments(arabic(UCS2_SINGLE_SEGMENT + 1))).toBe(2);
  });

  it('uses 67-char segments once multi-part', () => {
    expect(countSmsSegments(arabic(UCS2_MULTI_SEGMENT * 2))).toBe(2);
    expect(countSmsSegments(arabic(UCS2_MULTI_SEGMENT * 2 + 1))).toBe(3);
  });

  it('counts a surrogate-pair char as one code point', () => {
    expect(countSmsSegments('😀')).toBe(1);
  });
});
