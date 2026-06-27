import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202606270001_student_audio_storage.sql",
);

describe("student audio storage migration", () => {
  it("creates the private student-audio bucket", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("student-audio");
    expect(migration).toMatch(/public\s*=\s*false/i);
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });
});

describe("Phase 5 audio database types", () => {
  it("exposes attempt, turn, and audio clip table types", () => {
    type Tables = Database["public"]["Tables"];

    const attempt: Tables["attempts"]["Insert"] = {
      assignment_student_id: "assignment-student-id",
    };
    const turn: Tables["attempt_turns"]["Insert"] = {
      attempt_id: "attempt-id",
      turn_order: 1,
    };
    const clip: Tables["audio_clips"]["Insert"] = {
      attempt_turn_id: "attempt-turn-id",
      clip_kind: "original_answer",
    };

    expect(attempt.assignment_student_id).toBe("assignment-student-id");
    expect(turn.turn_order).toBe(1);
    expect(clip.clip_kind).toBe("original_answer");
  });
});
