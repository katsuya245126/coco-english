import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("teacher workspace source contract", () => {
  it("polls one snapshot without moving inbox rows until the banner is clicked", () => {
    const shell = source("src/components/teacher/TeacherWorkspaceShell.tsx");
    expect(shell).toContain("30000");
    expect(shell).toContain("visibilitychange");
    expect(shell).toContain('addEventListener("focus"');
    expect(shell).toContain("new submissions");
    expect(shell).toMatch(/onClick=\{applyInboxRefresh\}/);
    expect(shell.match(/router\.refresh\(\)/g)).toHaveLength(1);
    expect(shell).toMatch(
      /applyInboxRefresh = \(\) => \{[^}]*router\.refresh\(\)/,
    );
  });

  it("keeps the authenticated snapshot minimal and uncached", () => {
    const route = source("src/app/api/teacher/queue-snapshot/route.ts");
    expect(route).toContain("requireTeacherProfile");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("getTeacherQueueSnapshot");
    expect(route).not.toMatch(
      /teacherId.*searchParams|transcript|audio|notes/i,
    );
  });

  it("contains the approved navigation and accessible mobile controls", () => {
    const shell = source("src/components/teacher/TeacherWorkspaceShell.tsx");
    for (const label of [
      "Needs review",
      "Incomplete",
      "All activity",
      "Create class",
      "Missions",
    ])
      expect(shell).toContain(label);
    expect(shell).toContain("aria-expanded");
    expect(shell).not.toMatch(
      /email|push|sms|digest|notification-settings|realtime/i,
    );
  });

  it("applies prototype shell styles globally so Next links stay styled", () => {
    const layout = source("src/app/teacher/layout.tsx");
    const styles = source("src/components/teacher/TeacherWorkspaceStyles.tsx");
    expect(layout).toContain("<TeacherWorkspaceStyles/>");
    expect(styles).toContain("<style jsx global>");
    expect(styles).toContain("grid-template-columns: 210px minmax(0, 1fr)");
    expect(styles).toContain(".teacher-shell .nav.active");
    expect(styles).toContain(".teacher-shell .count");
    expect(styles).toContain("@media (max-width: 800px)");
  });

  it("reveals overflowing class names and uses notification badges", () => {
    const shell = source("src/components/teacher/TeacherWorkspaceShell.tsx");
    const classLink = source("src/components/teacher/TeacherClassNavLink.tsx");
    const styles = source("src/components/teacher/TeacherWorkspaceStyles.tsx");

    expect(shell).toContain("<TeacherClassNavLink");
    expect(classLink).toContain("title={name}");
    expect(classLink).toContain('className="count"');
    expect(classLink).toContain("ResizeObserver");
    expect(classLink).toContain("scrollWidth");
    expect(classLink).toContain('data-overflow={overflowing ? "true" : "false"}');
    expect(classLink).toContain("--class-name-travel");
    expect(styles).toContain(".class-name-window");
    expect(styles).toContain("text-overflow: ellipsis");
    expect(styles).toContain("teacher-class-name-reveal");
    expect(styles).toContain('[data-overflow="true"]');
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("renders the three approved operational queues and action boundaries", () => {
    const views = source("src/components/teacher/TeacherQueueViews.tsx");
    const evidence = source("src/app/teacher/evidence/[attemptId]/page.tsx");
    for (const label of [
      "Needs review",
      "Incomplete",
      "All activity",
      "Move back to Needs review",
      "Missed",
      "Due soon",
      "Later",
      "Not started",
      "Started",
    ])
      expect(views).toContain(label);
    expect(views).toContain("?student=${item.id}");
    expect(views).toMatch(/<details[^>]*>/);
    expect(views).not.toMatch(/<details[^>]*open/);
    expect(views).not.toMatch(/type="checkbox"|bulk-select/i);
    expect(evidence).not.toContain("Move back to Needs review");
  });

  it("renders bounded review pagination and a safe invalid-date fallback", () => {
    const page = source("src/app/teacher/page.tsx");
    const views = source("src/components/teacher/TeacherQueueViews.tsx");
    expect(page).toContain("paginateTeacherReviewRows");
    expect(page).toContain("page={paginated.page}");
    expect(views).toContain("Previous");
    expect(views).toContain("Next");
    expect(views).toContain("Page {page} of {totalPages}");
    expect(views).toMatch(
      /Number\.isFinite\([^)]*Date\.parse|Number\.isFinite\(parsed/,
    );
    expect(views).toContain('return "Recently"');
  });
});
