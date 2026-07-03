import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(path, "utf8");
}

describe("teacher UI source contracts", () => {
  it("mission list grays out delete controls for assigned missions", () => {
    const source = readSource("src/components/teacher/MissionList.tsx");

    expect(source).toContain("Delete mission");
    expect(source).toContain("deleteMissionAction");
    expect(source).toContain("mission.assignmentCount > 0");
    expect(source).toContain("disabledDangerButtonStyle");
    expect(source).toContain("Assigned missions cannot be deleted.");
    expect(source).toContain("disabledDeleteTooltipMissionId");
    expect(source).toContain("disabledDeleteTooltipStyle");
    expect(source).toContain('right: 0');
    expect(source).toContain('top: "calc(100% + 8px)"');
    expect(source).not.toContain("title={");
  });
});
