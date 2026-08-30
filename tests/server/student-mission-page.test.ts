import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(__dirname, "../../src/app/student/missions/[assignmentStudentId]/page.tsx"),
  "utf8",
);
const stylesSource = readFileSync(
  resolve(__dirname, "../../src/components/student/styles.ts"),
  "utf8",
);
const shellSource = readFileSync(
  resolve(__dirname, "../../src/components/student/MissionFlowShell.tsx"),
  "utf8",
);
const transitionSource = readFileSync(
  resolve(__dirname, "../../src/domain/flow/mission-transitions.ts"),
  "utf8",
);

describe("student mission resume state", () => {
  it("requires a complete interpreted snapshot before live work", () => {
    // Snapshot interpretation happens inside the owned-assignment seam;
    // the page redirects when the seam returns no complete snapshot.
    expect(pageSource).toContain(
      'import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";',
    );
    expect(pageSource).toContain("const snapshot = asRow.snapshot;");
    expect(pageSource).toContain("if (!snapshot) {");
    expect(pageSource).not.toContain("missionSnapshotSchema");
    expect(pageSource).not.toContain('from("assignment_students")');
    expect(pageSource.indexOf("requireOwnedAssignmentStudent")).toBeLessThan(
      pageSource.indexOf("after(() => warmEvaluators"),
    );
    expect(pageSource.indexOf("if (!snapshot) {")).toBeLessThan(
      pageSource.indexOf("<MissionFlowShell"),
    );
  });

  it("loads evaluation and persisted feedback fields", () => {
    expect(pageSource).toContain("evaluation");
    expect(pageSource).toContain("improved_sentence");
    expect(pageSource).toContain("getPendingTurnReview");
  });

  it("rechecks unlocked-student ownership on every resume query", () => {
    const attemptStart = pageSource.indexOf('.from("attempts")');
    const turnStart = pageSource.indexOf('.from("attempt_turns")');
    const clipStart = pageSource.indexOf('.from("audio_clips")');
    expect(attemptStart).toBeGreaterThanOrEqual(0);
    expect(turnStart).toBeGreaterThan(attemptStart);
    expect(clipStart).toBeGreaterThan(turnStart);

    const attemptQuery = pageSource.slice(attemptStart, turnStart);
    const turnQuery = pageSource.slice(turnStart, clipStart);
    const clipQuery = pageSource.slice(clipStart);

    expect(attemptQuery).toMatch(
      /assignment_students![^\s(]*!inner\([\s\S]*student_id/,
    );
    expect(attemptQuery).toContain('.eq("assignment_student_id", assignmentStudentId)');
    expect(attemptQuery).toContain('.eq("assignment_students.student_id", unlock.studentId)');

    expect(turnQuery).toMatch(
      /attempts!inner\([\s\S]*assignment_students![^\s(]*!inner\([\s\S]*student_id/,
    );
    expect(turnQuery).toContain('.eq("attempts.assignment_student_id", assignmentStudentId)');
    expect(turnQuery).toContain('.eq("attempts.assignment_students.student_id", unlock.studentId)');

    expect(clipQuery).toMatch(
      /attempt_turns!inner\([\s\S]*attempts!inner\([\s\S]*assignment_students![^\s(]*!inner\([\s\S]*student_id/,
    );
    expect(clipQuery).toMatch(
      /\.eq\(\s*"attempt_turns\.attempts\.assignment_student_id",\s*assignmentStudentId\s*,?\s*\)/,
    );
    expect(clipQuery).toMatch(
      /\.eq\(\s*"attempt_turns\.attempts\.assignment_students\.student_id",\s*unlock\.studentId\s*,?\s*\)/,
    );
  });

  it("restores the saved feedback screen and its recording URL", () => {
    expect(pageSource).toContain("initialReview");
    expect(pageSource).toContain("createSignedUrl");
    expect(shellSource).toContain("initialReview");
    expect(shellSource).toContain("reconstructMissionFlow");
    expect(transitionSource).toContain("initialReview.step");
  });

  it("allows assigned and started missions to launch after their due date", () => {
    expect(pageSource).not.toContain("assignment.due_at");
    expect(pageSource).not.toContain('asRow.status !== "needs_retry"');
  });

  it("restores the pending Coco line for a resumed correction or repeat review (D-11.1)", () => {
    expect(pageSource).toContain("coco_line: t.coco_line");
    expect(shellSource).toContain("initialReview");
    expect(transitionSource).toContain("cocoLine: initialReview.cocoLine");
  });

  it("uses a fluid mission column without the shared white panel", () => {
    expect(pageSource).toContain("missionPageStyle");
    expect(pageSource).toContain("missionContentStyle");
    expect(pageSource).not.toContain("panelStyle");
    expect(stylesSource).toContain("export const MISSION_CONTENT_MAX_WIDTH = 640");
    expect(stylesSource).toContain('padding: "clamp(16px, 3vw, 32px)"');
    expect(stylesSource).toMatch(
      /missionContentStyle[\s\S]*maxWidth: MISSION_CONTENT_MAX_WIDTH/,
    );
    expect(stylesSource).toMatch(
      /mascotStageStyle[\s\S]*maxWidth: MISSION_CONTENT_MAX_WIDTH/,
    );
  });

  it("does not render retired scene-premise metadata", () => {
    expect(pageSource).not.toContain("scenePremise");
    expect(shellSource).not.toContain("scenePremise");
    expect(shellSource).not.toContain("ScenePremiseCard");
  });

  it("keeps completed assignments out of the recorder on reload", () => {
    expect(pageSource).toMatch(
      /const RECORDABLE_STATUSES = new Set\(\[[\s\S]*?"assigned"[\s\S]*?"started"[\s\S]*?"missed"[\s\S]*?"needs_retry"[\s\S]*?\]\)/,
    );
    expect(pageSource.indexOf("RECORDABLE_STATUSES")).toBeLessThan(
      pageSource.indexOf("<MissionFlowShell"),
    );
  });
});
