import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(__dirname, "../../src/app/student/missions/[assignmentStudentId]/page.tsx"),
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
});
