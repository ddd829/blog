import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import { remarkCallouts } from './src/lib/remark-callouts.mjs';
import { transformerFileName } from './src/lib/shiki-filename.mjs';

export default defineConfig({
  site: 'https://dingfanx.com',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, remarkDirective, remarkCallouts],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      theme: 'github-dark-dimmed',
      transformers: [transformerFileName()],
    },
  },
});
