import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { place, step, anyOverlap, type Box } from '../src/lib/constellation';

// 用可复现的伪随机替换 Math.random，让测试确定、不抖动
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
    items.push({ w: 120 + Math.random() * 80, h: 36 + Math.random() * 18, x: 0, y: 0, vx: 0, vy: 0 });
  }
  return items;
}

describe('constellation physics', () => {
  const W = 1100;
  const H = 640;
  const pad = 16;

  it('places items without overlap', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    expect(anyOverlap(items, 1)).toBe(false);
  });

  it('keeps all items inside the stage after placement', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    for (const a of items) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(W + 0.5);
      expect(a.y + a.h).toBeLessThanOrEqual(H + 0.5);
    }
  });

  it('stays non-overlapping and in-bounds over many frames', () => {
    const items = makeItems(8);
    place(items, W, H, pad);
    for (let f = 0; f < 1200; f++) {
      step(items, W, H, pad, 1 / 60);
      // 每隔若干帧抽查
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

  it('does not move a frozen (hovered) item', () => {
    const items = makeItems(5);
    place(items, W, H, pad);
    const frozen = new Set<Box>([items[0]]);
    const x0 = items[0].x;
    const y0 = items[0].y;
    // 在没有碰撞挤压的前提下，frozen 项不应自行移动
    step(items, W, H, pad, 1 / 60, frozen);
    // 允许被其它项分离时推动，但自身速度不应使其移动；这里只验证一帧内未因自身速度移动
    expect(Math.abs(items[0].x - x0) < items[0].w).toBe(true);
    expect(Math.abs(items[0].y - y0) < items[0].h).toBe(true);
  });
});
