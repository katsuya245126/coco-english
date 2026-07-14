import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("class workspace splits queue, assignments, and students into pages", () => {
  const review = source("src/app/teacher/classes/[id]/(workspace)/page.tsx");
  const layout = source("src/app/teacher/classes/[id]/(workspace)/layout.tsx");
  const policy = source("src/components/teacher/ClassReviewPolicyControl.tsx");
  const tabs = source("src/components/teacher/ClassWorkspaceTabs.tsx");
  expect(review).toContain("TeacherReviewTable");
  for (const label of ["Needs review", "Assignments", "Students", "Class settings"]) expect(tabs).toContain(label);
  expect(layout).toContain("ClassReviewPolicyControl");
  expect(layout).toContain("ownedClass.review_policy");
  expect(policy).toContain("Review every submission");
  expect(policy).toContain("Review flagged submissions only");
  expect(policy).toContain("Saving review setting…");
  expect(policy).toContain("Review setting updated.");
  expect(policy).toMatch(/if \(result\.ok\)[\s\S]*router\.refresh\(\)/);
});

test("assignment drill-down validates and highlights only an in-scope student", () => {
  const page = source("src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx");
  expect(page).toContain("entries.some((entry) => entry.id === requestedStudentId)");
  expect(page).toContain('aria-current={entry.id === selectedStudentId ? "true" : undefined}');
  expect(page).toContain('entry.id === selectedStudentId ? "#EFF6FF"');
});

test("review policy wiring covers both queue directions without filtering All activity", () => {
  const control = source("src/components/teacher/ClassReviewPolicyControl.tsx");
  const domain = source("src/domain/teacher/assignment-operations.ts");
  const service = source("src/server/teacher/assignment-operations.ts");

  expect(control).toContain('<option value="flagged_only">Review flagged submissions only</option>');
  expect(control).toContain('<option value="every_submission">Review every submission</option>');
  expect(control).toMatch(/setConfirmedValue\(nextValue\)[\s\S]*router\.refresh\(\)/);
  expect(domain).toContain(
    'input.reviewPolicy === "every_submission" || input.needsReviewReason !== null',
  );
  expect(service).toMatch(
    /listNeedsReviewForTeacher[\s\S]*filter\(\(row\) => isSubmissionPendingReview\(row\)\)/,
  );
  const activityStart = service.indexOf("export async function listActivityForTeacher");
  const nextExport = service.indexOf("\nexport ", activityStart + 1);
  const activity = service.slice(activityStart, nextExport);
  expect(activity).not.toContain("isSubmissionPendingReview");
});

test("evidence uses explicit view receipt and exactly two review actions", () => {
  const page = source("src/app/teacher/evidence/[attemptId]/page.tsx");
  const controls = source("src/components/teacher/SubmissionReviewControls.tsx");
  expect(page).toContain("markSubmissionViewed");
  expect(page).toContain("SubmissionReviewControls");
  expect(controls.match(/>Mark reviewed</g)).toHaveLength(1);
  expect(controls.match(/>Request retry</g)).toHaveLength(3); // incomplete/completed primary actions and confirmation
  expect(controls).toContain("/teacher?reviewed=${attemptId}");
  expect(controls).not.toMatch(/Mark complete|Keep in review|auto-next|bulk review/i);
});
