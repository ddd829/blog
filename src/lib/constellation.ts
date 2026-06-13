// 标题星图的物理核心：自主漂移 + 边界反弹 + 相互碰撞弹回（防重叠）。
// 纯函数、不依赖 DOM，便于本地单元测试（见 tests/constellation.test.ts）。

export interface Box {
  w: number;
  h: number;
  x: number; // 左上角
  y: number;
  vx: number; // px/秒
  vy: number;
}

function overlapAt(a: { w: number; h: number }, ax: number, ay: number, b: Box, pad: number): boolean {
  return ax < b.x + b.w + pad && b.x < ax + a.w + pad && ay < b.y + b.h + pad && b.y < ay + a.h + pad;
}

/** 初始无重叠放置（随机 + 拒绝重叠），并赋随机速度。 */
export function place(items: Box[], W: number, H: number, pad: number): void {
  const placed: Box[] = [];
  for (const a of items) {
    const maxX = Math.max(1, W - a.w);
    const maxY = Math.max(1, H - a.h);
    let ok = false;
    for (let t = 0; t < 600 && !ok; t++) {
      const x = Math.random() * maxX;
      const y = Math.random() * maxY;
      if (placed.every((b) => !overlapAt(a, x, y, b, pad))) {
        a.x = x;
        a.y = y;
        ok = true;
      }
    }
    if (!ok) {
      a.x = Math.random() * maxX;
      a.y = Math.random() * maxY;
    }
    const ang = Math.random() * Math.PI * 2;
    const speed = 13 + Math.random() * 15; // px/秒
    a.vx = Math.cos(ang) * speed;
    a.vy = Math.sin(ang) * speed;
    placed.push(a);
  }
}

/** 推进一帧：移动、撞边界反弹、相互碰撞弹回并分离。 */
export function step(items: Box[], W: number, H: number, pad: number, dt: number): void {
  for (const a of items) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.x < 0) { a.x = 0; a.vx = Math.abs(a.vx); }
    if (a.x > W - a.w) { a.x = W - a.w; a.vx = -Math.abs(a.vx); }
    if (a.y < 0) { a.y = 0; a.vy = Math.abs(a.vy); }
    if (a.y > H - a.h) { a.y = H - a.h; a.vy = -Math.abs(a.vy); }
  }

  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad;
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1;
          a.x -= (dir * ox) / 2;
          b.x += (dir * ox) / 2;
          if (iter === 0) { a.vx = -Math.abs(a.vx) * dir; b.vx = Math.abs(b.vx) * dir; }
        } else {
          const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1;
          a.y -= (dir * oy) / 2;
          b.y += (dir * oy) / 2;
          if (iter === 0) { a.vy = -Math.abs(a.vy) * dir; b.vy = Math.abs(b.vy) * dir; }
        }
      }
    }
    if (!moved) break;
  }

  for (const a of items) {
    a.x = Math.max(0, Math.min(W - a.w, a.x));
    a.y = Math.max(0, Math.min(H - a.h, a.y));
  }
}

/** 是否存在重叠（gap 为容差像素）。 */
export function anyOverlap(items: Box[], gap = 0): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > gap && oy > gap) return true;
    }
  }
  return false;
}
