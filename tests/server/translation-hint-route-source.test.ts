import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("translation hint route boundary", () => {
  it("accepts only descriptors and resolves server-owned prompt text", () => {
    const routeSource = readFileSync(
      "src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts",
      "utf8",
    );

    expect(routeSource).toContain("translationHintRequestSchema.safeParse");
    expect(routeSource).toContain("readStudentUnlock");
    expect(routeSource).toContain("resolveOwnedTranslationSource");
    expect(routeSource).toContain("DEFAULT_TRANSLATION_LOCALE");
    expect(routeSource).toContain("getOrCreateTranslationHint");
    expect(routeSource).not.toMatch(
      /body\.(sourceText|text|contentHash|sourceDigest)/,
    );
    expect(routeSource).toContain(
      'error: "translation_unavailable_retryable"',
    );
  });
});
