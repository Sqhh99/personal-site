import { getCollection, type CollectionEntry } from 'astro:content';
import { DATE_LOCALE, type Language } from '../i18n/ui';
import { langPrefix } from '../i18n/utils';
import { DEFAULT_PAGE_SIZE, getPagedListUrl, paginate } from './pagination';

export type Post = CollectionEntry<'blog'>;

export const BLOG_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function getPostSlug(postOrId: Post | string): string {
  return typeof postOrId === 'string' ? postOrId : postOrId.id;
}

/** The language the article itself is written in — not the language of the surrounding UI. */
export function getPostLang(post: Post): Language {
  return post.data.lang;
}

export function getPostUrl(postOrSlug: Post | string, lang: Language = 'en'): string {
  const slug = getPostSlug(postOrSlug);
  return `${langPrefix(lang)}/blog/${slug}/`;
}

export function getBlogListUrl(lang: Language = 'en', page = 1): string {
  return getPagedListUrl(`${langPrefix(lang)}/blog`, page);
}

export function paginatePosts(posts: Post[], page: number, pageSize = BLOG_PAGE_SIZE): Post[] {
  return paginate(posts, page, pageSize).items;
}

/**
 * Every published post, newest first. Drafts are excluded from production builds only.
 *
 * There is deliberately no per-locale filter: an article is written in one language
 * and listed in every locale, the same way the briefs already behave. Filtering by UI
 * locale would leave `/ja/blog/` empty the moment the archive is all English.
 */
export async function getPosts(): Promise<Post[]> {
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
  if (lang === 'zh') return `${mins} 分钟阅读`;
  if (lang === 'ja') return `${mins} 分で読めます`;
  return `${mins} min read`;
}

export function formatDate(date: Date, lang: Language = 'en'): string {
  if (lang === 'en') {
    return date.toLocaleDateString(DATE_LOCALE.en, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return date.toLocaleDateString(DATE_LOCALE[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
