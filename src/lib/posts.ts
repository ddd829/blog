import { getCollection, type CollectionEntry } from 'astro:content';
import type { SectionKey } from '../config';

export type Post = CollectionEntry<'posts'> & { section: SectionKey };

export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts
    .map((p) => Object.assign(p, { section: p.id.split('/')[0] as SectionKey }))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
