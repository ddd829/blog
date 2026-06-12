import { describe, it, expect } from 'vitest';
import { postNumber } from '../src/lib/numbering';

const mk = (id: string, date: string, number?: number) => ({
  id, data: { date: new Date(date), number },
});

describe('postNumber', () => {
  const all = [mk('a', '2026-01-01'), mk('b', '2026-02-01'), mk('c', '2026-03-01', 99)];
  it('numbers by chronological order starting at 1', () => {
    expect(postNumber(all[0], all)).toBe(1);
    expect(postNumber(all[1], all)).toBe(2);
  });
  it('frontmatter number overrides', () => {
    expect(postNumber(all[2], all)).toBe(99);
  });
});
