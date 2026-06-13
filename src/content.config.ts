import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';
import { validateTags } from './lib/tags';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    summary: z.string().optional(),
    tags: z
      .array(z.string())
      .default([])
      .superRefine((tags, ctx) => {
        // 构建期强制标签体系规范（见 src/lib/tags.ts 与标签系统设计文档）
        for (const message of validateTags(tags)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        }
      }),
    cover: z.string().optional(),
    draft: z.boolean().default(false),
    pinned: z.boolean().default(false),
    layout: z.enum(['essay', 'tech']).optional(),
    number: z.number().optional(),
  }),
});

export const collections = { posts };
