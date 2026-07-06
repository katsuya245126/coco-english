import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const pageSourcePath = join(
  process.cwd(),
  "src/app/teacher/evidence/[attemptId]/page.tsx",
);
const classPageSourcePath = join(
  process.cwd(),
  "src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx",
);
const playerSourcePath = join(
  process.cwd(),
  "src/components/teacher/AudioClipPlayer.tsx",
);

test("teacher evidence page renders transcript labels before audio controls", () => {
  const source = readFileSync(pageSourcePath, "utf8");
  const headingIndex = source.indexOf("Attempt evidence");
  const originalIndex = source.indexOf("Student answer");
  const repeatIndex = source.indexOf("Repeat attempt");
  const playerIndex = source.indexOf("<AudioClipPlayer");

  expect(headingIndex).toBeGreaterThan(-1);
  expect(originalIndex).toBeGreaterThan(-1);
  expect(repeatIndex).toBeGreaterThan(-1);
  expect(playerIndex).toBeGreaterThan(-1);
  expect(originalIndex).toBeLessThan(playerIndex);
  expect(repeatIndex).toBeLessThan(playerIndex);
});

test("teacher evidence page groups pronunciation scoring with each recording", () => {
  const source = readFileSync(pageSourcePath, "utf8");

  expect(source).toContain('label="Student answer"');
  expect(source).toContain('label="Student answer audio"');
  expect(source).not.toContain('label="Original answer"');
  expect(source).not.toContain('label="Original answer audio"');
  expect(source).not.toContain("function PronunciationDiagnosticList");
  expect(source).toMatch(
    /<AudioClipPlayer[\s\S]*<PronunciationDiagnosticPanel[\s\S]*audioClipId=\{clip\.id\}/,
  );
});

test("teacher evidence page renders AI annotations without Phase 7 dashboard controls", () => {
  const source = readFileSync(pageSourcePath, "utf8");

  expect(source).toContain("Meaning result");
  expect(source).toContain("Target pattern result");
  expect(source).toContain("Improved sentence");
  expect(source).toContain("Repeat result");
  expect(source).toContain("Teacher review");
  expect(source).toContain("AI was not confident enough to decide.");
  expect(source).toContain("The answer was ambiguous and needs a teacher check.");
  expect(source).toContain(
    "AI returned an invalid result, so this was routed to teacher review.",
  );
  expect(source).not.toContain("Override status");
  expect(source).not.toContain("Review bucket");
});

test("teacher class UI links to attempt evidence", async ({ page }) => {
  const source = readFileSync(classPageSourcePath, "utf8");

  expect(source).toContain("Review evidence");
  expect(source).toContain("/teacher/evidence/");

  await page.setContent(`
    <a href="http://127.0.0.1:3000/teacher/evidence/attempt-1">Review evidence</a>
  `);

  const evidenceRequest = page.waitForRequest(/\/teacher\/evidence\/attempt-1$/);
  await page.getByRole("link", { name: "Review evidence" }).click();
  await expect((await evidenceRequest).url()).toMatch(
    /\/teacher\/evidence\/attempt-1$/,
  );
});

test("audio player requires Load audio before native controls are shown", async ({
  page,
}) => {
  const source = readFileSync(playerSourcePath, "utf8");

  expect(source).toContain("Load audio");
  expect(source).toContain("Preparing audio...");
  expect(source).toContain("<audio controls");
  expect(source).not.toContain("autoPlay");

  await page.setContent(`
    <button type="button">Load audio</button>
    <script>
      document.querySelector("button").addEventListener("click", () => {
        const audio = document.createElement("audio");
        audio.setAttribute("controls", "");
        audio.setAttribute("src", "https://storage.example/signed-audio");
        document.body.appendChild(audio);
      });
    </script>
  `);

  await expect(page.locator("audio")).toHaveCount(0);
  await page.getByRole("button", { name: "Load audio" }).click();
  await expect(page.locator("audio[controls]")).toHaveCount(1);
});
