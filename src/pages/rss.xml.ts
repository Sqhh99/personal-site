import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../consts';
import { getAllPosts, getPostLang, getPostUrl } from '../lib/posts';

export const GET: APIRoute = async (context) => {
  const posts = await getAllPosts();

  return rss({
    title: SITE.title,
    description: SITE.description,
    // `context.site` comes from `site` in astro.config.mjs.
    site: context.site!,
    items: posts.map((post) => {
      const lang = getPostLang(post);
      return {
        title: lang === 'zh' ? `[中文] ${post.data.title}` : post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        categories: [post.data.tag],
        link: getPostUrl(post, lang),
      };
    }),
    customData: '<language>en-us</language>',
  });
};
