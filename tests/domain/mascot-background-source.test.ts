import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Coco classroom background source contract", () => {
  it("uses the classroom background asset for the mascot stage", () => {
    const smallAssetPath = path.join(
      process.cwd(),
      "public",
      "images",
      "backgrounds",
      "default-classroom-background-640.webp",
    );
    const largeAssetPath = path.join(
      process.cwd(),
      "public",
      "images",
      "backgrounds",
      "default-classroom-background-1280.webp",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(fs.existsSync(smallAssetPath)).toBe(true);
    expect(fs.existsSync(largeAssetPath)).toBe(true);
    expect(stylesSource).toMatch(
      /backgroundImage:[\s\S]*image-set\(url\(\/images\/backgrounds\/default-classroom-background-640\.webp\) 1x, url\(\/images\/backgrounds\/default-classroom-background-1280\.webp\) 2x\)/,
    );
    expect(stylesSource).toContain('backgroundSize: "cover"');
    expect(stylesSource).toContain('backgroundPosition: "center center"');
  });

  it("anchors the dialogue box to the backdrop corners", () => {
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stylesSource).toMatch(
      /mascotDialogueShellStyle[\s\S]*left: 0[\s\S]*right: 0[\s\S]*bottom: 0/,
    );
    expect(stylesSource).toMatch(
      /mascotSpriteWrapStyle[\s\S]*bottom: "calc\(var\(--coco-dialogue-height\) - 10px\)"/,
    );
    expect(stylesSource).toMatch(
      /mascotDialogueShellStyle[\s\S]*height: "var\(--coco-dialogue-height\)"/,
    );
    expect(stylesSource).toContain(
      '"--coco-dialogue-height": "clamp(144px, 44vw, 168px)"',
    );
    expect(stylesSource).toMatch(
      /mascotStageStyle[\s\S]*overflow: "visible"/,
    );
    expect(stylesSource).toMatch(
      /mascotBackdropStyle[\s\S]*borderRadius: 8/,
    );
    expect(stylesSource).toMatch(
      /mascotDialoguePagerStyle[\s\S]*bottom: -22/,
    );
  });
});
