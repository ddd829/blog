import { describe, it, expect } from 'vitest';
import { relatedPosts } from '../src/lib/related';

const mk = (id: string, tags: string[], date: string) => ({
  id, section: id.split('/')[0],
  data: { tags, date: new Date(date) },
});

describe('relatedPosts', () => {
  const cur = mk('tech/a', ['嵌入式', '调试'], '2026-06-01');
  const pool = [
    cur,
    mk('tech/b', ['嵌入式'], '2026-05-01'),       // 共享1标签+同栏目 = 3
    mk('news/c', ['嵌入式', '调试'], '2026-04-01'), // 共享2标签 = 4
    mk('reading/d', [], '2026-03-01'),             // 0 分,排除
    mk('tech/e', [], '2026-02-01'),                // 同栏目 = 1
  ];
  it('scores shared tags double and same section single, excludes self and zero-score', () => {
    const r = relatedPosts(cur, pool, 3);
    expect(r.map((p) => p.id)).toEqual(['news/c', 'tech/b', 'tech/e']);
  });
  it('limits to n', () => {
    expect(relatedPosts(cur, pool, 1)).toHaveLength(1);
  });
});
