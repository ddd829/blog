// 标题星图的布点核心：一次性计算无重叠的基准位置（含漂浮余量）。
// 漂浮本身由 CSS 合成器动画完成（丝滑、不占主线程），这里只负责"摆放不重叠"。
// 纯函数、不依赖 DOM，便于本地单元测试（见 tests/constellation.test.ts）。

export interface Box {
  w: number;
  h: number;
  x: number;
  y: number;
}

function overlapAt(a: { w: number; h: number }, ax: number, ay: number, b: Box, pad: number): boolean {
  return ax < b.x + b.w + pad && b.x < ax + a.w + pad && ay < b.y + b.h + pad && b.y < ay + a.h + pad;
}

/** 在 W×H 区域内为每个 box 找一个互不重叠的位置（随机 + 拒绝重叠）。 */
export function place(items: Box[], W: number, H: number, pad: number): void {
  const placed: Box[] = [];
  for (const a of items) {
    const maxX = Math.max(1, W - a.w);
    const maxY = Math.max(1, H - a.h);
    let ok = false;
    for (let t = 0; t < 800 && !ok; t++) {
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
    placed.push(a);
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
