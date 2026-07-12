import { describe, expect, it } from "vitest";
import {
  buildTeacherReviewPageHref,
  paginateTeacherReviewRows,
} from "@/domain/teacher/review-pagination";

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
