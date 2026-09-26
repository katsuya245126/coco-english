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

type FilterableReviewRow = { className: string; firstViewedAt: string | null; needsReviewReason: string | null };

// Counts describe the chosen class before the unread/flagged filter, so the
// filter tiles keep showing every bucket while one of them is selected.
export function filterTeacherReviewRows<T extends FilterableReviewRow>(
  rows: T[],
  query: { className?: string; filter?: string },
) {
  const classRows = query.className ? rows.filter((row) => row.className === query.className) : rows;
  const unread = classRows.filter((row) => row.firstViewedAt === null);
  const flagged = classRows.filter((row) => row.needsReviewReason !== null);
  const filtered = query.filter === "unread" ? unread : query.filter === "flagged" ? flagged : classRows;
  return { rows: filtered, counts: { total: classRows.length, unread: unread.length, flagged: flagged.length } };
}
