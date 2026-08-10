import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608090001_teacher_owned_pronunciation_reprocessing.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("pronunciation reprocessing migration", () => {
  it("adds the owned active marker and lifecycle RPCs", () => {
    expect(sql).toContain("add column pronunciation_reprocessing_started_at timestamptz");
    expect(sql).not.toMatch(/pronunciation_reprocessing_started_at timestamptz[^,;]*not null/);
    expect(sql).toContain("create function public.begin_pronunciation_reprocessing");
    expect(sql).toContain("create function public.complete_pronunciation_reprocessing");
    expect(sql).toContain("create function public.clear_pronunciation_reprocessing");
    expect(sql).toContain("for update of ac");
    expect(sql).toContain("pronunciation_reprocessing_started_at is null");
    expect(sql).toContain("insert into public.pronunciation_scores");
    expect(sql).toContain("on conflict (audio_clip_id) do nothing");
    expect(sql).toContain("set pronunciation_reprocessing_started_at = null");
  });

  it("keeps ownership and execution inside each service-role operation", () => {
    expect(sql.match(/c\.teacher_id = p_teacher_id/g)).toHaveLength(3);
    for (const join of [
      "join public.attempt_turns t on t.id = ac.attempt_turn_id",
      "join public.attempts at on at.id = t.attempt_id",
      "join public.assignment_students ast on ast.id = at.assignment_student_id",
      "join public.assignments a on a.id = ast.assignment_id",
      "join public.classes c on c.id = a.class_id",
    ]) {
      expect(sql.match(new RegExp(join, "g"))).toHaveLength(3);
    }
    expect(sql.match(/security definer/g)).toHaveLength(3);
    expect(sql.match(/set search_path = public/g)).toHaveLength(3);
    expect(sql.match(/revoke all on function public\./g)).toHaveLength(3);
    expect(sql.match(/grant execute on function public\./g)).toHaveLength(3);
    expect(sql.match(/to service_role/g)).toHaveLength(3);
  });

  it("leaves authenticated audio reads RLS-filtered while revoking direct writes", () => {
    expect(sql).toContain(
      "revoke insert, update, delete on table public.audio_clips from authenticated",
    );
    expect(sql).toContain("grant select on table public.audio_clips to authenticated");
    expect(sql).not.toContain("drop policy");
  });
});
