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

  it("renders the approved class review workspace without a nested legacy shell", () => {
    const page = source("src/app/teacher/classes/[id]/page.tsx");
    const workspace = source("src/components/teacher/ClassReviewWorkspace.tsx");
    const policy = source("src/components/teacher/ClassReviewPolicyControl.tsx");
    expect(page).toContain("<ClassReviewWorkspace");
    expect(page).not.toContain('minHeight: "100dvh"');
    expect(page).not.toContain("<header");
    for (const label of ["Assignment Review", "Needs review", "Assignments", "Students", "Class settings"]) expect(workspace).toContain(label);
    expect(workspace).not.toContain("All activity");
    expect(workspace).toContain("class-review-header");
    expect(workspace).toContain("class-workspace-tabs");
    expect(workspace).toContain("class-assignment-card");
    expect(workspace).toContain("class-student-card");
    expect(policy).toContain("review-policy-control");
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

    expect(controls).toMatch(
      /const markDone[\s\S]*?dismissAssignmentStudentByIdAction[\s\S]*?catch[\s\S]*?setError\(true\)/,
    );
    expect(controls).toMatch(
      /const undo[\s\S]*?undoDismissByAssignmentStudentIdAction[\s\S]*?catch[\s\S]*?setError\(true\)/,
    );
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
