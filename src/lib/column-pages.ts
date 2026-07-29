import type { Language } from '../i18n/ui';
import type { ColumnId } from './columns';
import { getColumn, getColumnItemCount } from './columns';
import { pagedListStaticPaths } from './pagination';

export async function columnPageStaticPaths(column: ColumnId, _lang: Language) {
  const totalItems = await getColumnItemCount(column);
  const { pageSize } = getColumn(column);

  return pagedListStaticPaths(totalItems, pageSize).map(({ page }) => ({
    params: { page: String(page) },
    props: { page },
  }));
}
