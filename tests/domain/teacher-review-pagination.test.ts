import { describe, expect, it } from "vitest";
import {
  buildTeacherReviewPageHref,
  filterTeacherReviewRows,
  paginateTeacherReviewRows,
} from "@/domain/teacher/review-pagination";

describe("teacher review filters", () => {
  const rows = [
    { className: "A", firstViewedAt: null, needsReviewReason: null },
    { className: "A", firstViewedAt: "2026-09-27", needsReviewReason: "low_confidence" },
    { className: "A", firstViewedAt: null, needsReviewReason: "low_confidence" },
    { className: "B", firstViewedAt: null, needsReviewReason: null },
  ];

  it("counts the class's rows before the unread/flagged filter narrows them", () => {
    const result = filterTeacherReviewRows(rows, { className: "A", filter: "unread" });
    expect(result.rows).toEqual([rows[0], rows[2]]);
    expect(result.counts).toEqual({ total: 3, unread: 2, flagged: 2 });
  });

  it("keeps every class and treats unknown filters as no filter", () => {
    const result = filterTeacherReviewRows(rows, { filter: "bogus" });
    expect(result.rows).toEqual(rows);
    expect(result.counts).toEqual({ total: 4, unread: 3, flagged: 2 });
    expect(filterTeacherReviewRows(rows, { filter: "flagged" }).rows).toEqual([rows[1], rows[2]]);
  });
});

describe("teacher review pagination", () => {
  it("shows ten rows per page and clamps the requested page", () => {
    const rows = Array.from({ length: 21 }, (_, index) => index + 1);

    expect(paginateTeacherReviewRows(rows, 1)).toMatchObject({
      rows: rows.slice(0, 10),
      page: 1,
      totalPages: 3,
    });
    expect(paginateTeacherReviewRows(rows, 2)).toMatchObject({
      rows: rows.slice(10, 20),
      page: 2,
      totalPages: 3,
    });
    expect(paginateTeacherReviewRows(rows, 99)).toMatchObject({
      rows: [21],
      page: 3,
      totalPages: 3,
    });
    expect(paginateTeacherReviewRows(rows, Number.NaN)).toMatchObject({
      rows: rows.slice(0, 10),
      page: 1,
      totalPages: 3,
    });
    expect(paginateTeacherReviewRows(rows, -4)).toMatchObject({
      rows: rows.slice(0, 10),
      page: 1,
      totalPages: 3,
    });
  });

  it("preserves active filters in page links", () => {
    expect(
      buildTeacherReviewPageHref(2, {
        className: "John's Speaking Class",
        filter: "unread",
      }),
    ).toBe("/teacher?class=John%27s+Speaking+Class&filter=unread&page=2");
    expect(buildTeacherReviewPageHref(1, {})).toBe("/teacher?page=1");
  });
});
