import rss from '@astrojs/rss';
import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';
import { getCollection } from 'astro:content';
import { SITE } from '../config';

const parser = new MarkdownIt();

export async function GET(context) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/${post.id}/`,
      content: sanitizeHtml(parser.render(post.body ?? ''), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
      }),
    })),
  });
}
