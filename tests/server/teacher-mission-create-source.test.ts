import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const readSource = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("manual teacher mission creation", () => {
  it("does not ship the AI mission draft UI or server action", () => {
    const form = readSource("src/components/teacher/MissionForm.tsx");
    const actions = readSource("src/app/teacher/missions/actions.ts");

    expect(form).not.toContain("MissionDraftPanel");
    expect(form).not.toContain("GeneratedMissionDraft");
    expect(form).not.toContain("applyMissionDraft");
    expect(actions).not.toContain("generateMissionDraftAction");
    expect(actions).not.toContain("mission-generator");
  });

  it("removes the unused mission-draft component, schemas, and adapter", () => {
    expect(existsSync(resolve(root, "src/components/teacher/MissionDraftPanel.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/domain/ai/mission-generation.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/server/ai/mission-generator.ts"))).toBe(false);
  });
});
