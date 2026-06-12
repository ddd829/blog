import { describe, it, expect } from 'vitest';
import { countWords, readingTime } from '../src/lib/reading-time';

describe('countWords', () => {
  it('counts CJK chars individually', () => {
    expect(countWords('硬件不会说谎')).toBe(6);
  });
  it('counts latin words as one each', () => {
    expect(countWords('page wrap around')).toBe(3);
  });
  it('mixes CJK and latin', () => {
    expect(countWords('使用 DMA 接收')).toBe(5); // 4 CJK + 1 word
  });
  it('ignores fenced code blocks', () => {
    expect(countWords('前文\n```c\nint a = 1;\n```\n后文')).toBe(4);
  });
});

describe('readingTime', () => {
  it('rounds up to at least 1 minute', () => {
    expect(readingTime('短').minutes).toBe(1);
  });
  it('computes minutes at 350 wpm', () => {
    const text = '字'.repeat(1400);
    expect(readingTime(text).minutes).toBe(4);
  });
});
