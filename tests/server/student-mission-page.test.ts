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

describe("student mission resume state", () => {
  it("loads evaluation and persisted feedback fields", () => {
    expect(pageSource).toContain("evaluation");
    expect(pageSource).toContain("improved_sentence");
    expect(pageSource).toContain("getPendingTurnReview");
  });

  it("restores the saved feedback screen and its recording URL", () => {
    expect(pageSource).toContain("initialReview");
    expect(pageSource).toContain("createSignedUrl");
    expect(shellSource).toContain("initialReview");
    expect(shellSource).toContain("initialReview.step");
  });

  it("allows teacher-reopened retry missions after the original due date", () => {
    expect(pageSource).toContain('asRow.status !== "needs_retry"');
    expect(pageSource).toContain("assignment.due_at");
  });

  it("restores the pending Coco line for a resumed correction or repeat review (D-11.1)", () => {
    expect(pageSource).toContain("coco_line: t.coco_line");
    expect(shellSource).toContain("cocoLine: initialReview.cocoLine");
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
});
