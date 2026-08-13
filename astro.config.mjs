// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Canonical origin. Sitemap, RSS and OG tags all derive from this via `Astro.site`,
// so it is deliberately the only place the domain is written down.
export default defineConfig({
  site: 'https://sqhh99.dev',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh', 'ja'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [mdx(), react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // Math is typeset to HTML at build time, so no KaTeX JS reaches the browser —
    // only its stylesheet, imported from BaseLayout.
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
