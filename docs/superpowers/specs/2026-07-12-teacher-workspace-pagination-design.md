# Teacher Workspace Styling and Pagination Design

## Goal

Restore the Phase 10.1 teacher workspace to the approved prototype appearance and keep long review queues usable with server-driven pagination.

## Scope

- Make the shared teacher shell match the approved prototype: a 210px desktop sidebar, styled navigation rows and count badges, top header, and the existing responsive mobile drawer.
- Show at most 10 Needs Review submissions per page.
- Add prototype-compatible Previous and Next controls plus a `Page X of Y` status below the queue.
- Preserve the active class/filter query when moving between pages.
- Clamp missing, invalid, negative, and out-of-range page values to a valid page.
- Display `Recently` when a submission timestamp is missing or invalid instead of rendering the Unix epoch.

## Approach

Use global component CSS for the shell because Next.js `Link` output does not receive the scoped `styled-jsx` selector marker when the class is passed through the component boundary. Keep the existing class names and prototype values rather than introducing a new styling system.

Paginate after applying the existing class and Unread/Flagged filters. The server page owns page parsing and slicing, while the queue component renders pagination metadata and links. Ten rows is the fixed page size for this view.

## Components and Data Flow

1. `TeacherHome` reads `class`, `filter`, and `page` from `searchParams`.
2. It loads and filters the owned review queue, calculates `totalPages`, clamps `page`, and slices 10 rows.
3. `TeacherReviewTable` receives the current page, total pages, and active query values.
4. Pagination links rebuild the query string while retaining class and filter values.
5. `relativeTime` validates the timestamp before calculating elapsed time.

## Verification

- Source regression test proves shell styles are global and retain prototype layout values.
- Behavioral/source tests cover 10-row slicing, valid-page clamping, and filter-preserving pagination links.
- Date formatting test or source contract proves invalid timestamps render `Recently` and never `1/1/1970`.
- Run focused teacher workspace tests, typecheck, lint, and build. Existing Phase 10.1 lint gaps must remain visible if not directly resolved by this fix.

## Non-goals

- No pagination changes to Incomplete or All Activity.
- No redesign of the approved prototype.
- No new client-side data fetching or infinite scrolling.
