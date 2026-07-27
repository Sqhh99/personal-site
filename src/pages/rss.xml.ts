import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../consts';
import { getPosts } from '../lib/posts';

export const GET: APIRoute = async (context) => {
  const posts = await getPosts();

  return rss({
    title: SITE.title,
    description: SITE.description,
    // `context.site` comes from `site` in astro.config.mjs.
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      categories: [post.data.tag],
      link: `/blog/${post.id}/`,
    })),
    customData: '<language>en</language>',
  });
};
