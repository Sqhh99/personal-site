import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts are excluded from production builds only. */
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
 * Reading time from the raw Markdown body. Counts CJK characters individually,
 * since they carry roughly a word's worth of meaning each and would otherwise
 * collapse into a single "word".
 */
export function readingTime(body = ''): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`~\[\]()]/g, ' ');

  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, ' ').match(/\S+/g) ?? []).length;

  return `${Math.max(1, Math.round((cjk + latin) / 220))} min read`;
}

export function formatDate(date: Date): string {
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
