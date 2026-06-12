import { SITE } from '../config';
import type { Post } from './posts';

export function blogPostingLd(post: Post): object {
  const d = post.data.date;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.data.title,
    datePublished: d.toISOString(),
    ...(post.data.updated && { dateModified: post.data.updated.toISOString() }),
    author: { '@type': 'Person', name: SITE.author, url: SITE.url },
    url: new URL(`/${post.id}/`, SITE.url).href,
  };
}
