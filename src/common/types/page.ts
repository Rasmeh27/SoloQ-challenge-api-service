export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

const FIRST_PAGE = 1;

/** Slices an already ordered collection. Pagination never reorders the input. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const safePage = Math.max(FIRST_PAGE, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const offset = (safePage - FIRST_PAGE) * safePageSize;

  return {
    items: items.slice(offset, offset + safePageSize),
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(items.length / safePageSize),
  };
}
