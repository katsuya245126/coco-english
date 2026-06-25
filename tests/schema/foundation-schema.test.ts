import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202606250001_foundation_schema.sql",
  "utf8",
).toLowerCase();

describe("foundation database migration", () => {
  it.each([
    "data_mode",
    "assignment_student_status",
    "attempt_status",
    "audio_clip_kind",
    "audio_processing_status",
    "status_actor_type",
  ])("creates enum %s", (enumName) => {
    expect(migration).toContain(`create type ${enumName}`);
  });

  it.each([
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
  ])("creates table %s", (tableName) => {
    expect(migration).toContain(`create table public.${tableName}`);
  });

  it("stores immutable mission snapshots and demo data boundaries", () => {
    expect(migration).toMatch(/classes[\s\S]*data_mode\s+public\.data_mode\s+not null/);
    expect(migration).toMatch(/assignments[\s\S]*data_mode\s+public\.data_mode\s+not null/);
    expect(migration).toMatch(/assignments[\s\S]*mission_snapshot\s+jsonb\s+not null/);
    expect(migration).toContain("prevent_class_data_mode_change_with_assignments");
  });

  it("stores short per-turn audio metadata with retention and deletion fields", () => {
    expect(migration).toMatch(/audio_clips[\s\S]*attempt_turn_id\s+uuid\s+not null/);
    expect(migration).toContain("audio_expires_at");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("deleted_at");
    expect(migration).toContain("deleted_reason");
    expect(migration).not.toContain("full_session_recording");
  });

  it("creates uniqueness constraints and child foreign keys", () => {
    expect(migration).toContain("unique (assignment_id, student_id)");
    expect(migration).toContain("unique (mission_id, turn_order)");
    expect(migration).toContain("unique (attempt_id, turn_order)");
    expect(migration).toContain("references public.classes");
    expect(migration).toContain("references public.students");
    expect(migration).toContain("references public.missions");
    expect(migration).toContain("references public.assignments");
    expect(migration).toContain("references public.assignment_students");
    expect(migration).toContain("references public.attempts");
    expect(migration).toContain("references public.attempt_turns");
  });

  it("enables RLS on app tables and makes status events append-only by table shape", () => {
    for (const tableName of [
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
    ]) {
      expect(migration).toContain(
        `alter table public.${tableName} enable row level security`,
      );
    }

    expect(migration).toMatch(/assignment_status_events[\s\S]*previous_status/);
    expect(migration).toMatch(/assignment_status_events[\s\S]*next_status/);
    expect(migration).toMatch(/assignment_status_events[\s\S]*actor_type/);
    expect(migration).toMatch(/assignment_status_events[\s\S]*reason_code/);
  });
});
