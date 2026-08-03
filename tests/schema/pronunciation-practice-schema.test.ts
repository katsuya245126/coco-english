import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608030001_pronunciation_practice.sql",
  "utf8",
).toLowerCase();

describe("pronunciation practice persistence migration", () => {
  it("adds a bounded assignment kind and valid-try table", () => {
    expect(migration).toContain(
      "create type public.assignment_kind as enum ('mission', 'pronunciation')",
    );
    expect(migration).toContain(
      "assignment_kind public.assignment_kind not null default 'mission'",
    );
    expect(migration).toContain("pronunciation_word_tries");
    expect(migration).toContain("unique (attempt_turn_id, try_number)");
    expect(migration).toContain("unique (audio_clip_id)");
    expect(migration).toContain("check (try_number between 1 and 3)");
  });

  it("defines the three pronunciation RPCs as owned security-definer operations", () => {
    for (const functionName of [
      "assign_pronunciation_practice",
      "start_pronunciation_attempt",
      "complete_pronunciation_attempt",
    ]) {
      expect(migration).toContain(`function public.${functionName}`);
    }
    expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("for update");
    expect(migration).toContain("is_attempt_turn_owner");
    expect(migration).toContain("to service_role");
  });

  it("uses the approved assignment title pattern", () => {
    expect(migration).toContain("light l sound practice");
    expect(migration).toContain("s sound practice");
    expect(migration).toContain("f sound practice");
  });

  it("leaves mission snapshots and mission completion logic unchanged", () => {
    expect(migration).not.toContain("update public.assignments");
    expect(migration).not.toContain("create or replace function public.complete_student_attempt");
    expect(migration).not.toContain("mission_completed");
  });
});
