import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(__dirname, "../../src/app/layout.tsx"),
  "utf8",
);

describe("root layout hydration compatibility", () => {
  it("limits hydration-warning suppression to the root elements Kakao mutates", () => {
    expect(layoutSource).toMatch(
      /<html\b[^>]*\bsuppressHydrationWarning\b[^>]*>/,
    );
    expect(layoutSource).toMatch(
      /<body\b[^>]*\bsuppressHydrationWarning\b[^>]*>/,
    );
  });
});
