import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608290001_harden_teacher_mutation_acl.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("teacher mutation ACL migration", () => {
  it("audits assignment ownership before replacing policies", () => {
    expect(migration).toContain(
      "where c.teacher_id is distinct from m.teacher_id",
    );
    expect(migration).toContain("raise exception");
    expect(migration.indexOf("raise exception")).toBeLessThan(
      migration.indexOf('drop policy "teachers manage own assignments"'),
    );
  });

  it("revokes root deletes while retaining mission turn replacement", () => {
    expect(migration).toContain(
      "revoke delete on table public.classes, public.students, public.missions, public.assignments from authenticated;",
    );
    expect(migration).not.toContain(
      "revoke delete on table public.mission_turn_templates",
    );
    for (const table of ["classes", "students", "missions"]) {
      expect(migration).toContain(`for select to authenticated using`);
      expect(migration).toContain(`for insert to authenticated with check`);
      expect(migration).toContain(`for update to authenticated using`);
      expect(migration).toContain(`drop policy "teachers manage own ${table}"`);
    }
  });

  it("requires the assignment mission to have the same teacher", () => {
    expect(migration).toContain(
      'create policy "teachers insert own assignments" on public.assignments for insert to authenticated with check ( public.is_class_owner(class_id) and public.is_mission_owner(mission_id) );',
    );
    expect(migration).toContain(
      'create policy "teachers update own assignments" on public.assignments for update to authenticated using (public.is_class_owner(class_id)) with check ( public.is_class_owner(class_id) and public.is_mission_owner(mission_id) );',
    );
  });

  it("makes audio and pronunciation rows authenticated-select-only", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.audio_clips, public.pronunciation_scores from authenticated;",
    );
    expect(migration).toContain(
      "grant select on table public.audio_clips, public.pronunciation_scores to authenticated;",
    );
    expect(migration).toContain(
      'drop policy "teachers manage own audio clips" on public.audio_clips;',
    );
    expect(migration).toContain(
      'create policy "teachers read own audio clips" on public.audio_clips for select to authenticated',
    );
    expect(migration).toContain(
      'drop policy "teachers manage own pronunciation scores" on public.pronunciation_scores;',
    );
    expect(migration).toContain(
      'create policy "teachers read own pronunciation scores" on public.pronunciation_scores for select to authenticated',
    );
  });
});
