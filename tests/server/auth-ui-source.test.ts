import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(path, "utf8");
}

describe("auth UI source contracts", () => {
  it("login page links back to the role choice page", () => {
    const source = readSource("src/app/auth/login/page.tsx");

    expect(source).toContain('href="/"');
    expect(source).toContain("Back to role choice");
  });
});
