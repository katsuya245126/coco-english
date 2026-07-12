const DEFAULT_PAGE_SIZE = 10;

export function paginateTeacherReviewRows<T>(
  rows: T[],
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const normalizedPage = Number.isFinite(requestedPage)
    ? Math.floor(requestedPage)
    : 1;
  const page = Math.min(totalPages, Math.max(1, normalizedPage));
  const start = (page - 1) * pageSize;

  return { rows: rows.slice(start, start + pageSize), page, totalPages };
}

export function buildTeacherReviewPageHref(
  page: number,
  query: { className?: string; filter?: string },
) {
  const params = new URLSearchParams();
  if (query.className) params.set("class", query.className);
  if (query.filter) params.set("filter", query.filter);
  params.set("page", String(page));
  return `/teacher?${params.toString()}`;
}
