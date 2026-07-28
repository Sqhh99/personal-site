export const DEFAULT_PAGE_SIZE = 10;

export type PageSlice<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

function assertPageSize(pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive integer');
  }

  return pageSize;
}

export function paginate<T>(
  all: T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): PageSlice<T> {
  const validPageSize = assertPageSize(pageSize);
  const totalItems = all.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / validPageSize));
  const requestedPage = Number.isFinite(page) ? Math.trunc(page) : 1;
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * validPageSize;

  return {
    items: all.slice(start, start + validPageSize),
    page: currentPage,
    pageSize: validPageSize,
    totalItems,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/** Page 1 uses the collection root; later pages use `/page/N/`. */
export function getPagedListUrl(basePath: string, page: number): string {
  const normalizedBase = `/${basePath}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  const currentPage = Math.max(1, Math.trunc(page) || 1);

  return currentPage === 1
    ? `${normalizedBase}/`
    : `${normalizedBase}/page/${currentPage}/`;
}

/** Parameters for static list pages 2 through N. */
export function pagedListStaticPaths(
  totalItems: number,
  pageSize = DEFAULT_PAGE_SIZE,
): { page: number }[] {
  const validPageSize = assertPageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / validPageSize));

  return Array.from({ length: totalPages - 1 }, (_, index) => ({
    page: index + 2,
  }));
}
