import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/202607270001_attempt_turn_reply_hint_frame.sql",
  ),
  "utf8",
).toLowerCase();

// The comment block above the DDL explains why the column is nullable and
// additive, so it legitimately contains words like "rename" and "not null".
// Assert against executable statements only, or the prose fails the test.
const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("attempt turn reply hint frame schema", () => {
  it("adds a nullable reply_hint_frame column to attempt_turns", () => {
    expect(statements).toContain("alter table public.attempt_turns");
    expect(statements).toContain(
      "add column if not exists reply_hint_frame text",
    );
    expect(statements).not.toContain("not null");
  });

  it("stays additive: no drop, rename, or type change", () => {
    expect(statements).not.toContain("drop column");
    expect(statements).not.toContain("rename");
    expect(statements).not.toContain("alter column");
  });
});
