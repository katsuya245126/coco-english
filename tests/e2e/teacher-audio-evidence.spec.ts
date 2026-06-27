import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const pageSourcePath = join(
  process.cwd(),
  "src/app/teacher/evidence/[attemptId]/page.tsx",
);
const playerSourcePath = join(
  process.cwd(),
  "src/components/teacher/AudioClipPlayer.tsx",
);

test("teacher evidence page renders transcript labels before audio controls", () => {
  const source = readFileSync(pageSourcePath, "utf8");
  const headingIndex = source.indexOf("Attempt evidence");
  const originalIndex = source.indexOf("Original answer");
  const repeatIndex = source.indexOf("Repeat attempt");
  const playerIndex = source.indexOf("<AudioClipPlayer");

  expect(headingIndex).toBeGreaterThan(-1);
  expect(originalIndex).toBeGreaterThan(-1);
  expect(repeatIndex).toBeGreaterThan(-1);
  expect(playerIndex).toBeGreaterThan(-1);
  expect(originalIndex).toBeLessThan(playerIndex);
  expect(repeatIndex).toBeLessThan(playerIndex);
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
