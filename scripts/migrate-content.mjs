import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const SRC = 'hugo-legacy/content';
const DST = 'src/content/posts';
const SECTIONS = ['tech', 'research', 'workshop', 'news', 'reading'];

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

let count = 0;
for (const section of SECTIONS) {
  const dir = path.join(SRC, section);
  if (!fs.existsSync(dir)) continue;
  fs.mkdirSync(path.join(DST, section), { recursive: true });
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md') || file === '_index.md') continue;
    const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
    const out = {
      title: data.title ?? slugify(file),
      date: data.date ?? data.created ?? new Date().toISOString().slice(0, 10),
      ...(data.lastmod ?? data.updated ? { updated: data.lastmod ?? data.updated } : {}),
      ...((data.summary ?? data.description) && { summary: data.summary ?? data.description }),
      ...(data.tags?.length && { tags: data.tags }),
      ...(data.draft && { draft: true }),
    };
    const dst = path.join(DST, section, `${slugify(file)}.md`);
    fs.writeFileSync(dst, matter.stringify(content, out));
    console.log(`${path.join(dir, file)} -> ${dst}`);
    count++;
  }
}
console.log(`migrated ${count} posts`);
