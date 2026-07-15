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

  it("keeps Coco opener generation authenticated and draft-only", () => {
    const actions = readSource("src/app/teacher/missions/actions.ts");
    const actionStart = actions.indexOf("export async function generateOpenerAction");
    const actionEnd = actions.indexOf(
      "export async function listMissionAssignmentsAction",
      actionStart,
    );
    const openerAction = actions.slice(actionStart, actionEnd);

    expect(actions).toContain("export type GenerateOpenerActionResult");
    expect(actions).toContain("const GENERATE_OPENER_FAILURE");
    expect(actions).toContain("openerGenerationInputSchema");
    expect(actions).toContain("generateOpener");
    expect(openerAction.indexOf("await requireTeacherProfile()")).toBeLessThan(
      openerAction.indexOf("openerGenerationInputSchema.safeParse"),
    );
    expect(openerAction.indexOf("openerGenerationInputSchema.safeParse")).toBeLessThan(
      openerAction.indexOf("generateOpener(parsed.data)"),
    );
    expect(openerAction).not.toContain("createMission");
    expect(openerAction).not.toContain("updateMission");
    expect(openerAction).not.toContain("revalidatePath");
    expect(openerAction).not.toContain("selectFallbackLine");
  });

  it("wires the reviewed Coco opener through the tested turn serializer", () => {
    const form = readSource("src/components/teacher/MissionForm.tsx");

    expect(form).toContain("generateOpenerAction");
    expect(form).toContain("serializeMissionTurns");
    expect(form).toContain("Coco's opening line");
    expect(form).toContain("Generate opener");
    expect(form).toMatch(
      /formData\.set\(\s*"turns",\s*JSON\.stringify\(\s*serializeMissionTurns/s,
    );
  });
});
