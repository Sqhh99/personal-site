import type { Language, UiKey } from '../i18n/ui';
import { langPrefix } from '../i18n/utils';
import { getBriefs } from './briefs';
import { DEFAULT_PAGE_SIZE } from './pagination';
import { getPosts } from './posts';

/**
 * Adding a column should require only a registry entry, its content collection
 * and card, plus thin per-locale index and paged route shells.
 */
export type ColumnId = 'blog' | 'brief';

export type ColumnConfig = {
  id: ColumnId;
  /** URL segment without a language prefix. */
  segment: string;
  pageSize: number;
  i18n: {
    nav: UiKey;
    title: UiKey;
    heading: UiKey;
    description: UiKey;
    empty: UiKey;
    paginationLabel: UiKey;
  };
};

type ColumnDefinition = ColumnConfig & {
  /** Neither collection is filtered per locale — every item is listed in both. */
  getTotalItems: () => Promise<number>;
};

const COLUMNS = {
  blog: {
    id: 'blog',
    segment: 'blog',
    pageSize: DEFAULT_PAGE_SIZE,
    i18n: {
      nav: 'nav.writing',
      title: 'blog.title',
      heading: 'blog.heading',
      description: 'blog.description',
      empty: 'blog.empty',
      paginationLabel: 'pager.label',
    },
    getTotalItems: async () => (await getPosts()).length,
  },
  brief: {
    id: 'brief',
    segment: 'brief',
    pageSize: DEFAULT_PAGE_SIZE,
    i18n: {
      nav: 'nav.briefs',
      title: 'briefs.title',
      heading: 'briefs.heading',
      description: 'briefs.description',
      empty: 'briefs.empty',
      paginationLabel: 'pager.label',
    },
    getTotalItems: async () => (await getBriefs()).length,
  },
} as const satisfies Record<ColumnId, ColumnDefinition>;

export function getColumn(id: ColumnId): ColumnConfig {
  return COLUMNS[id];
}

export function listColumns(): ColumnConfig[] {
  return Object.values(COLUMNS);
}

export function getColumnBasePath(id: ColumnId, lang: Language = 'en'): string {
  return `${langPrefix(lang)}/${getColumn(id).segment}/`;
}

export function getColumnItemCount(id: ColumnId): Promise<number> {
  return COLUMNS[id].getTotalItems();
}
