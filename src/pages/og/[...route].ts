import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

const posts = await getCollection('posts', ({ data }) => !data.draft);

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'route',
  pages: Object.fromEntries(posts.map((p) => [p.id, p.data])),
  getImageOptions: (_path, data) => ({
    title: data.title,
    description: data.summary ?? 'dingfanx.com',
    bgGradient: [[246, 244, 239]],
    border: { color: [168, 70, 45], width: 14, side: 'inline-start' },
    padding: 72,
    font: {
      title: {
        size: 56,
        lineHeight: 1.35,
        color: [23, 21, 17],
        weight: 'SemiBold',
        families: ['Noto Serif SC'],
      },
      description: {
        size: 26,
        lineHeight: 1.6,
        color: [92, 89, 80],
        families: ['Noto Serif SC'],
      },
    },
    fonts: ['./src/assets/fonts/noto-serif-sc.ttf'],
  }),
});
