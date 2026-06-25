import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/202606250002_teacher_auth_rls.sql";

// Raw (case-preserving) text, used only where casing is irrelevant.
const rawMigration = readFileSync(MIGRATION_PATH, "utf8");

// Lowercased body used for the bulk of the structural assertions, mirroring the
// foundation schema test style.
const migration = rawMigration.toLowerCase();

// Comment-stripped body: drop any line that is a SQL line comment (optional
// leading whitespace then `--`). This prevents a header/explanatory comment
// from self-invalidating the plaintext-PIN negative gate below.
const migrationBody = migration
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");

const TEACHER_OWNED_TABLES = [
  "teacher_profiles",
  "classes",
  "students",
  "missions",
  "mission_turn_templates",
  "assignments",
  "assignment_students",
  "attempts",
  "attempt_turns",
  "audio_clips",
  "assignment_status_events",
] as const;

describe("teacher auth + RLS migration", () => {
  it.each(TEACHER_OWNED_TABLES)(
    "creates at least one RLS policy for %s",
    (tableName) => {
      // Each teacher-owned table must be referenced by a create policy ... on
      // public.<table> statement so row visibility is enforced at the DB.
      const policyPattern = new RegExp(
        `create policy[\\s\\S]*?on public\\.${tableName}\\b`,
      );
      expect(migrationBody).toMatch(policyPattern);
    },
  );

  it("defines at least eleven policies (one+ per teacher-owned table)", () => {
    const policyCount = (migrationBody.match(/create policy/g) ?? []).length;
    expect(policyCount).toBeGreaterThanOrEqual(11);
  });

  it("roots ownership in teacher_profiles.auth_user_id via auth.uid()", () => {
    expect(migrationBody).toContain("auth_user_id");
    expect(migrationBody).toContain("auth.uid()");
  });

  it("indexes classes.join_code for join lookups", () => {
    // A dedicated index on classes(join_code) (the foundation migration only
    // declares it unique inline; this adds an explicit lookup index/helper).
    expect(migrationBody).toMatch(
      /create (unique )?index[\s\S]*?on public\.classes[\s\S]*?join_code/,
    );
  });

  it("enforces active (non-archived) student name uniqueness per class", () => {
    // Partial unique index over active students keyed on class + normalized name.
    expect(migrationBody).toMatch(
      /create unique index[\s\S]*?on public\.students[\s\S]*?class_id[\s\S]*?lower\(display_name\)[\s\S]*?where[\s\S]*?archived_at is null/,
    );
  });

  it("retains pin_hash for app-owned student PIN verification", () => {
    expect(migrationBody).toContain("pin_hash");
  });

  it("does not introduce a plaintext PIN column", () => {
    // Negative assertion against the comment-stripped body so head comments
    // cannot self-invalidate the gate. No bare `pin text` plaintext column.
    expect(migrationBody).not.toMatch(/\bpin\s+text\b/);
    expect(migrationBody).not.toMatch(/\bpin_plaintext\b/);
    expect(migrationBody).not.toMatch(/\bplain_pin\b/);
  });
});
