import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { place, anyOverlap, type Box } from '../src/lib/constellation';

// 可复现的伪随机，让测试确定、不抖动
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const realRandom = Math.random;
beforeEach(() => {
  Math.random = seeded(12345);
});
afterEach(() => {
  Math.random = realRandom;
});

function makeItems(n: number): Box[] {
  const items: Box[] = [];
  for (let i = 0; i < n; i++) {
    // 含漂浮余量后的盒子
    items.push({ w: 170 + Math.random() * 90, h: 88 + Math.random() * 24, x: 0, y: 0 });
  }
  return items;
}

describe('constellation placement', () => {
  const W = 1100;
  const H = 620;
  const pad = 14;

  it('places items without overlap', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    expect(anyOverlap(items, 1)).toBe(false);
  });

  it('keeps every item inside the stage', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    for (const a of items) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(W + 0.5);
      expect(a.y + a.h).toBeLessThanOrEqual(H + 0.5);
    }
  });

  it('handles the current small post count cleanly', () => {
    const items = makeItems(5);
    place(items, W, H, pad);
    expect(anyOverlap(items, 1)).toBe(false);
  });
});
