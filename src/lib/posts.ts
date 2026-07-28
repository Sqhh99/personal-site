import { getCollection, type CollectionEntry } from 'astro:content';
import type { Language } from '../i18n/ui';

export type Post = CollectionEntry<'blog'>;

export const BLOG_PAGE_SIZE = 10;

export function getPostSlug(postOrId: Post | string): string {
  const id = typeof postOrId === 'string' ? postOrId : postOrId.id;
  return id.replace(/^(en|zh)\//, '');
}

export function getPostLang(post: Post): Language {
  return post.id.startsWith('zh/') ? 'zh' : 'en';
}

export function getPostUrl(postOrSlug: Post | string, lang: Language = 'en'): string {
  const slug = getPostSlug(postOrSlug);
  return lang === 'zh' ? `/zh/blog/${slug}/` : `/blog/${slug}/`;
}

export function getBlogListUrl(lang: Language = 'en', page = 1): string {
  const root = lang === 'zh' ? '/zh/blog/' : '/blog/';
  return page <= 1 ? root : `${root}page/${page}/`;
}

export function paginatePosts(posts: Post[], page: number, pageSize = BLOG_PAGE_SIZE): Post[] {
  const start = (page - 1) * pageSize;
  return posts.slice(start, start + pageSize);
}

/** Published posts for a given locale, newest first. Drafts are excluded from production builds only. */
export async function getPosts(lang: Language = 'en'): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data, id }) => {
    const isDev = import.meta.env.DEV || !data.draft;
    const postLang = id.startsWith('zh/') ? 'zh' : 'en';
    return isDev && postLang === lang;
  });
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Get all posts regardless of language */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/**
 * The post that gets the large card: whichever is flagged `featured`, falling
 * back to the newest one so a list is never without a lead.
 */
export function leadPostId(posts: Post[]): string | undefined {
  return (posts.find((post) => post.data.featured) ?? posts[0])?.id;
}

/**
 * Reading time from the raw Markdown body. Counts CJK characters individually.
 */
export function readingTime(body = '', lang: Language = 'en'): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`~\[\]()]/g, ' ');

  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, ' ').match(/\S+/g) ?? []).length;

  const mins = Math.max(1, Math.round((cjk + latin) / 220));
  return lang === 'zh' ? `${mins} 分钟阅读` : `${mins} min read`;
}

export function formatDate(date: Date, lang: Language = 'en'): string {
  if (lang === 'zh') {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
