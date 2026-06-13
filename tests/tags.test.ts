import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { validateTags } from '../src/lib/tags';

describe('validateTags rules', () => {
  it('accepts a well-formed namespaced set', () => {
    expect(validateTags(['subject/EEPROM', 'topic/usb', 'type/case-study'])).toEqual([]);
  });
  it('rejects a tag without a namespace', () => {
    expect(validateTags(['usb']).length).toBeGreaterThan(0);
  });
  it('rejects an unknown namespace', () => {
    expect(validateTags(['foo/bar']).length).toBeGreaterThan(0);
  });
  it('rejects chinese / spaces / underscores in the value', () => {
    expect(validateTags(['topic/测试']).length).toBeGreaterThan(0);
    expect(validateTags(['topic/a b']).length).toBeGreaterThan(0);
    expect(validateTags(['topic/a_b']).length).toBeGreaterThan(0);
  });
  it('allows PascalCase proper nouns with digits and hyphens', () => {
    expect(validateTags(['subject/Cortex-M0', 'subject/I2C'])).toEqual([]);
  });
  it('enforces the closed type enum', () => {
    expect(validateTags(['type/whatever']).length).toBeGreaterThan(0);
    expect(validateTags(['type/case-study'])).toEqual([]);
  });
  it('caps subject at 2 per post', () => {
    expect(validateTags(['subject/A', 'subject/B', 'subject/C']).length).toBeGreaterThan(0);
  });
  it('rejects known synonyms in favour of canonical tags', () => {
    expect(validateTags(['rag']).some((m) => m.includes('subject/RAG'))).toBe(true);
  });
  it('flags duplicates', () => {
    expect(validateTags(['topic/usb', 'topic/usb']).length).toBeGreaterThan(0);
  });
});

// 全量内容守卫：所有文章（含草稿）的标签都必须符合体系
function collectPosts(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectPosts(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

describe('all content tags conform to the system', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '../src/content/posts');
  const files = fs.existsSync(root) ? collectPosts(root) : [];

  it('finds posts to check', () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    const { data } = matter(fs.readFileSync(file, 'utf8'));
    const tags = (data.tags as string[] | undefined) ?? [];
    it(path.relative(root, file).replace(/\\/g, '/'), () => {
      expect(validateTags(tags)).toEqual([]);
    });
  }
});
