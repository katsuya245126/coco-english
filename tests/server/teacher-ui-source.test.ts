import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(path, "utf8");
}

describe("teacher UI source contracts", () => {
  it("mission list archives missions and opens class-specific assignment cancellation", () => {
    const source = readSource("src/components/teacher/MissionList.tsx");

    expect(source).toContain("Archive mission");
    expect(source).toContain("archiveMissionAction");
    expect(source).toContain("Manage assignments");
    expect(source).toContain("MissionAssignmentDialog");
    expect(source).not.toContain("Delete mission");
    expect(source).not.toContain("deleteMissionAction");
    expect(source).not.toContain("title={");
  });

  it("archived missions page lists archived rows and restores them", () => {
    const pageSource = readSource("src/app/teacher/missions/archived/page.tsx");
    const listSource = readSource("src/components/teacher/ArchivedMissionList.tsx");

    expect(pageSource).toContain("listArchivedMissionsForTeacher");
    expect(pageSource).toContain("ArchivedMissionList");
    expect(listSource).toContain("Restore");
    expect(listSource).toContain("restoreMissionAction");
  });
});
