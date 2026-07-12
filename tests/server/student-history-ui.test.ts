import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/student/home/page.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/components/student/StudentHomeShell.tsx"), "utf8");
const item = fs.readFileSync(path.join(root, "src/components/student/AssignmentListItem.tsx"), "utf8");

describe("student history UI source contracts", () => {
  it("requests an exact five-item URL-addressable page", () => {
    expect(page).toContain("pageSize: 5"); expect(page).toContain('query.tab === "past"');
    expect(page).toContain("assignmentPage={page}"); expect(page).not.toContain("assignments={assignments}");
  });
  it("renders accessible Current/Past missions and page links", () => {
    expect(shell).toContain("Current"); expect(shell).toContain("Past missions");
    expect(shell).toContain('aria-label="Mission pages"'); expect(shell).toContain("Previous"); expect(shell).toContain("Next");
  });
  it("launches Late but keeps review nonlaunchable and Past read-only", () => {
    expect(item).toContain('item.displayStatus === "late"'); expect(item).not.toContain('item.displayStatus === "review" ||');
    expect(item).toContain("View what I said"); expect(item).toContain("/student/history/");
    expect(item.indexOf('item.displayStatus === "done"')).toBeLessThan(item.indexOf("const isLaunchable"));
  });
});
