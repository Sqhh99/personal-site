import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { TAGS } from './consts';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tag: z.enum(TAGS),
    // Each article is written in exactly one language; there are no translated
    // pairs. This only labels the prose — the UI chrome is localised separately.
    lang: z.enum(['en', 'zh']).default('en'),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const brief = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/brief' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default(['AI', '新闻']),
    source: z.string().default('每日 AI 新闻简报'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, brief };
