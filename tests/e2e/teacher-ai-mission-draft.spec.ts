import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

async function readSource(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("teacher AI mission draft source contract covers D-08 preview, handoff, and clean UI copy", async () => {
  const panelSource = await readSource("src/components/teacher/MissionDraftPanel.tsx");
  const formSource = await readSource("src/components/teacher/MissionForm.tsx");

  expect(panelSource).toContain("Generate draft");
  expect(panelSource).toContain("Draft preview");
  expect(panelSource).toContain("Use draft");
  expect(panelSource).toContain(
    "The draft did not match the mission format. Try again or write the mission manually.",
  );
  expect(formSource).toContain("MissionDraftPanel");

  const combinedSource = `${panelSource}\n${formSource}`;
  expect(combinedSource).toContain("setTitle");
  expect(combinedSource).toContain("setTargetPattern");
  expect(combinedSource).not.toMatch(/\b(raw JSON|model name|token count|prompt text)\b/i);
});

test("teacher AI mission draft source contract blocks D-09 failed-schema assignment paths", async () => {
  const panelSource = await readSource("src/components/teacher/MissionDraftPanel.tsx");

  expect(panelSource).toContain("failed-schema");
  expect(panelSource).toContain("Generate again");
  expect(panelSource).not.toMatch(/assignMissionAction\(/);
  expect(panelSource).not.toMatch(/createMissionAction\(/);
});
