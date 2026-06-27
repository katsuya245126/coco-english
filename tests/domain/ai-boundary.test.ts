import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * AI-06 structural enforcement (D-09).
 *
 * Asserts that no file in the student-facing code paths imports an
 * AI/LLM client library or declares a chat/buddy API route.
 * This test must PASS immediately and stay green — it is the
 * structural guarantee that the buddy is fully scripted.
 */

const PROJECT_ROOT = resolve(__dirname, "../..");

const SCAN_DIRS = [
  "src/app/student",
  "src/server/student-access",
  "src/components/student",
  "src/domain/character",
  "src/domain/flow",
];

const FORBIDDEN_TOKENS = [
  "openai",
  "@anthropic-ai/sdk",
  "@anthropic-ai",
  "/api/chat",
  "/api/buddy",
];

function collectFiles(dir: string): string[] {
  const absDir = join(PROJECT_ROOT, dir);
  if (!existsSync(absDir)) return [];

  const files: string[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesAbs(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectFilesAbs(absDir: string): string[] {
  if (!existsSync(absDir)) return [];
  const files: string[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesAbs(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("AI-06 structural boundary", () => {
  it("no student-facing file imports an AI/LLM library or declares a chat route", () => {
    const allFiles: string[] = [];
    for (const dir of SCAN_DIRS) {
      allFiles.push(...collectFiles(dir));
    }

    const violations: string[] = [];

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, "utf-8");
      const relativePath = filePath.replace(PROJECT_ROOT + "/", "");

      for (const token of FORBIDDEN_TOKENS) {
        // Check for import statements or require calls containing the token
        if (
          content.includes(`"${token}"`) ||
          content.includes(`'${token}'`) ||
          content.includes(`from "${token}`) ||
          content.includes(`from '${token}`)
        ) {
          violations.push(
            `${relativePath} contains forbidden token: ${token}`,
          );
        }
      }

      // Check for chat/buddy route handler declarations
      if (relativePath.startsWith("src/app/student/")) {
        if (
          content.includes("export async function POST") ||
          content.includes("export async function GET")
        ) {
          // Check if the route is a chat or buddy endpoint
          if (
            relativePath.includes("/api/chat") ||
            relativePath.includes("/api/buddy")
          ) {
            violations.push(
              `${relativePath} declares a chat/buddy route handler`,
            );
          }
        }
      }
    }

    expect(
      violations,
      `AI-06 boundary violated:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("scanned directories include at least the known student paths", () => {
    // Verify we are actually scanning files (not silently skipping all dirs)
    const existingDirs = SCAN_DIRS.filter((d) =>
      existsSync(join(PROJECT_ROOT, d)),
    );
    expect(existingDirs.length).toBeGreaterThanOrEqual(1);
  });
});
