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

  it("ships shell styles as a real stylesheet in the layout (no styled-jsx FOUC)", () => {
    const layout = source("src/app/teacher/layout.tsx");
    const styles = source("src/app/teacher/teacher-workspace.css");
    expect(layout).toContain('import "./teacher-workspace.css"');
    expect(layout).not.toContain("TeacherWorkspaceStyles");
    expect(styles).toContain("grid-template-columns: 210px minmax(0, 1fr)");
    expect(styles).toContain(".teacher-shell .nav.active");
    expect(styles).toContain(".teacher-shell .count");
    expect(styles).toContain("@media (max-width: 800px)");
    expect(styles).not.toContain("review-policy-control");
  });

  it("reveals overflowing class names and uses notification badges", () => {
    const shell = source("src/components/teacher/TeacherWorkspaceShell.tsx");
    const classLink = source("src/components/teacher/TeacherClassNavLink.tsx");
    const styles = source("src/app/teacher/teacher-workspace.css");

    expect(shell).toContain("<TeacherClassNavLink");
    expect(classLink).toContain("title={name}");
    expect(classLink).not.toContain('className="count"');
    expect(classLink).toContain("ResizeObserver");
    expect(classLink).toContain("scrollWidth");
    expect(classLink).toContain("windowRef");
    expect(classLink).toContain("nameElement.scrollWidth - windowElement.clientWidth");
    expect(classLink).toContain("observer.observe(windowElement)");
    expect(classLink).not.toContain("observer.observe(nameElement)");
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

  it("renders the class workspace as separate pages under a shared tabbed layout", () => {
    const layout = source("src/app/teacher/classes/[id]/(workspace)/layout.tsx");
    const tabs = source("src/components/teacher/ClassWorkspaceTabs.tsx");
    const review = source("src/app/teacher/classes/[id]/(workspace)/page.tsx");
    const assignments = source("src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx");
    const students = source("src/app/teacher/classes/[id]/(workspace)/students/page.tsx");
    expect(layout).toContain("class-review-header");
    expect(layout).toContain("<ClassWorkspaceTabs");
    expect(layout).not.toContain("review_policy");
    for (const label of ["Needs review", "Assignments", "Students", "Class settings"]) expect(tabs).toContain(label);
    expect(tabs).toContain("usePathname");
    expect(review).toContain("TeacherReviewTable");
    expect(review).toContain("row.classId === classId");
    expect(assignments).toContain("class-assignment-card");
    expect(students).toContain("class-student-card");
  });
});

describe("SubmissionReviewControls source", () => {
  const src = source("src/components/teacher/SubmissionReviewControls.tsx");

  it("offers Mark as done for incomplete attempts and Mark reviewed otherwise", () => {
    expect(src).toContain("Mark as done");
    expect(src).toContain("Removes this from your incomplete list. You can undo this.");
    expect(src).toContain("Mark reviewed");
    expect(src).toContain("dismissAssignmentStudentAction");
    expect(src).toContain("undoDismissAction");
    expect(src).toContain("/teacher/incomplete?class=");
  });

  it("shows the submission error when Mark as done rejects", () => {
    const markDoneStart = src.indexOf("const markDone");
    const undoStart = src.indexOf("const undoDone");
    const markDone = src.slice(markDoneStart, undoStart);

    expect(markDoneStart).toBeGreaterThan(-1);
    expect(undoStart).toBeGreaterThan(markDoneStart);
    expect(markDone).toContain("dismissAssignmentStudentAction");
    expect(markDone).toMatch(/try[\s\S]*catch[\s\S]*setError\(true\)/);
  });

  it("shows the submission error when Undo rejects", () => {
    const undoStart = src.indexOf("const undoDone");
    const retryStart = src.indexOf("const requestRetry");
    const undo = src.slice(undoStart, retryStart);

    expect(undoStart).toBeGreaterThan(-1);
    expect(retryStart).toBeGreaterThan(undoStart);
    expect(undo).toContain("undoDismissAction");
    expect(undo).toMatch(/try[\s\S]*catch[\s\S]*setError\(true\)/);
  });
});

describe("no-attempt assignment evidence source", () => {
  it("shows truthful assignment details with dismissal actions before metadata", () => {
    const page = source(
      "src/app/teacher/assignment-students/[assignmentStudentId]/page.tsx",
    );

    for (const value of [
      "Student",
      "Mission",
      "Status",
      "Submitted",
      "Attempts",
      "Highest hint used",
      "studentName",
      "missionTitle",
      "statusLabel",
      "submittedLabel",
      "attemptCount",
      "highestHintLabel",
    ]) {
      expect(page).toContain(value);
    }
    expect(page.indexOf("AssignmentStudentDismissControls")).toBeLessThan(
      page.indexOf('aria-label="Assignment summary"'),
    );
    expect(page).not.toMatch(
      /Request retry|transcript|AudioClipPlayer|PronunciationDiagnosticPanel/,
    );
  });

  it("offers only dismissal and undo controls for a no-attempt assignment", () => {
    const controls = source(
      "src/components/teacher/AssignmentStudentDismissControls.tsx",
    );

    expect(controls).toContain("Mark as done");
    expect(controls).toContain(
      "Removes this from your incomplete list. You can undo this.",
    );
    expect(controls).toContain("Undo");
    expect(controls).toContain(
      "/teacher/incomplete?class=${encodeURIComponent(className)}",
    );
    expect(controls).not.toContain("Request retry");
  });

  it("shows the assignment error when either dismiss action rejects", () => {
    const controls = source(
      "src/components/teacher/AssignmentStudentDismissControls.tsx",
    );
    const markDoneStart = controls.indexOf("const markDone");
    const undoStart = controls.indexOf("const undo");
    const renderStart = controls.indexOf("return (");
    const markDone = controls.slice(markDoneStart, undoStart);
    const undo = controls.slice(undoStart, renderStart);

    expect(markDoneStart).toBeGreaterThan(-1);
    expect(undoStart).toBeGreaterThan(markDoneStart);
    expect(renderStart).toBeGreaterThan(undoStart);
    expect(markDone).toContain("dismissAssignmentStudentByIdAction");
    expect(markDone).toMatch(/try[\s\S]*catch[\s\S]*setError\(true\)/);
    expect(markDone).not.toContain("undoDismissByAssignmentStudentIdAction");
    expect(undo).toContain("undoDismissByAssignmentStudentIdAction");
    expect(undo).toMatch(/try[\s\S]*catch[\s\S]*setError\(true\)/);
  });

  it("keeps attempt evidence navigation and links no-attempt rows to assignment details", () => {
    const review = source(
      "src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx",
    );

    expect(review).toContain("/teacher/evidence/${entry.latestAttemptId}");
    expect(review).toContain("Review evidence");
    expect(review).toContain("/teacher/assignment-students/${entry.id}");
    expect(review).toContain("View assignment");
  });
});
