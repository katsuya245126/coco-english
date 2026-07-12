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
    expect(shell).toMatch(/applyInboxRefresh = \(\) => \{[^}]*router\.refresh\(\)/);
  });

  it("keeps the authenticated snapshot minimal and uncached", () => {
    const route = source("src/app/api/teacher/queue-snapshot/route.ts");
    expect(route).toContain("requireTeacherProfile");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("getTeacherQueueSnapshot");
    expect(route).not.toMatch(/teacherId.*searchParams|transcript|audio|notes/i);
  });

  it("contains the approved navigation and accessible mobile controls", () => {
    const shell = source("src/components/teacher/TeacherWorkspaceShell.tsx");
    for (const label of ["Needs review", "Incomplete", "All activity", "Create class", "Missions"]) expect(shell).toContain(label);
    expect(shell).toContain("aria-expanded");
    expect(shell).not.toMatch(/email|push|sms|digest|notification-settings|realtime/i);
  });
});
