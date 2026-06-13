import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { place, step, anyOverlap, type Box } from '../src/lib/constellation';

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
    items.push({ w: 120 + Math.random() * 80, h: 40 + Math.random() * 20, x: 0, y: 0, vx: 0, vy: 0 });
  }
  return items;
}

describe('constellation physics', () => {
  const W = 1100;
  const H = 560;
  const pad = 16;

  it('places items without overlap', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    expect(anyOverlap(items, 1)).toBe(false);
  });

  it('stays non-overlapping and in-bounds over many frames', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    for (let f = 0; f < 1500; f++) {
      step(items, W, H, pad, 1 / 60);
      if (f % 50 === 0) {
        expect(anyOverlap(items, 1)).toBe(false);
        for (const a of items) {
          expect(a.x).toBeGreaterThanOrEqual(-0.5);
          expect(a.y).toBeGreaterThanOrEqual(-0.5);
          expect(a.x + a.w).toBeLessThanOrEqual(W + 0.5);
          expect(a.y + a.h).toBeLessThanOrEqual(H + 0.5);
        }
      }
    }
  });

  it('keeps the small current post count non-overlapping over time', () => {
    const items = makeItems(5);
    place(items, W, H, pad);
    for (let f = 0; f < 800; f++) step(items, W, H, pad, 1 / 60);
    expect(anyOverlap(items, 1)).toBe(false);
  });
});
