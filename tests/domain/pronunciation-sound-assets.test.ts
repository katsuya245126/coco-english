import { existsSync, statSync } from "node:fs";
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
});
