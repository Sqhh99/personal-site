import { getCollection, type CollectionEntry } from 'astro:content';

export type Brief = CollectionEntry<'brief'>;

/** All briefs ordered newest first. */
export async function getBriefs(): Promise<Brief[]> {
  const briefs = await getCollection('brief');
  return briefs.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function getBriefSlug(briefOrId: Brief | string): string {
  return typeof briefOrId === 'string' ? briefOrId : briefOrId.id;
}

export function getBriefUrl(briefOrSlug: Brief | string): string {
  const slug = getBriefSlug(briefOrSlug);
  return `/brief/${slug}/`;
}
