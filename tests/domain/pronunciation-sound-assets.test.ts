import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRACTICE_SOUNDS } from "@/domain/pronunciation/practice";

const publicRoot = path.join(process.cwd(), "public");

describe("pronunciation sound assets", () => {
  it("ships one versioned private-source clip path for every supported sound", () => {
    for (const sound of Object.values(PRACTICE_SOUNDS)) {
      const assetPath = path.join(publicRoot, sound.clip.replace(/^\//u, ""));
      expect(existsSync(assetPath)).toBe(true);
      expect(statSync(assetPath).size).toBeGreaterThan(0);
    }
  });

  it("records approval of the supplied 16-bit masters", () => {
    const licenseNote = readFileSync(
      path.join(process.cwd(), "docs/licenses/pronunciation-sound-clips.md"),
      "utf8",
    );

    expect(licenseNote).toContain("16-bit PCM WAV");
    expect(licenseNote).toContain("approved for this feature");
    expect(licenseNote).not.toContain("approved implementation accepts this source depth");
    expect(licenseNote).not.toContain("remains pending owner approval");
  });
});
