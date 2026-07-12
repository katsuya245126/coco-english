import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("class workspace exposes the focused queue and exact review policy", () => {
  const page = source("src/app/teacher/classes/[id]/page.tsx");
  const workspace = source("src/components/teacher/ClassReviewWorkspace.tsx");
  const policy = source("src/components/teacher/ClassReviewPolicyControl.tsx");
  expect(page).toContain("ClassReviewWorkspace");
  expect(workspace).toContain("TeacherReviewTable");
  for (const label of ["Needs review", "All activity", "Assignments", "Students", "Class settings"]) expect(workspace).toContain(label);
  expect(policy).toContain("Review every submission");
  expect(policy).toContain("Review flagged submissions only");
});

test("assignment drill-down validates and highlights only an in-scope student", () => {
  const page = source("src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx");
  expect(page).toContain("entries.some((entry) => entry.id === requestedStudentId)");
  expect(page).toContain('aria-current={entry.id === selectedStudentId ? "true" : undefined}');
  expect(page).toContain('entry.id === selectedStudentId ? "#EFF6FF"');
});

test("evidence uses explicit view receipt and exactly two review actions", () => {
  const page = source("src/app/teacher/evidence/[attemptId]/page.tsx");
  const controls = source("src/components/teacher/SubmissionReviewControls.tsx");
  expect(page).toContain("markSubmissionViewed");
  expect(page).toContain("SubmissionReviewControls");
  expect(controls.match(/>Mark reviewed</g)).toHaveLength(1);
  expect(controls.match(/>Request retry</g)).toHaveLength(2); // primary action and confirmation
  expect(controls).toContain("/teacher?reviewed=${attemptId}");
  expect(controls).not.toMatch(/Mark complete|Keep in review|auto-next|bulk review/i);
});
