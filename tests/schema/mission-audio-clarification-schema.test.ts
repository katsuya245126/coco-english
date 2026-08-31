import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608310004_teacher_mission_audio_clarification.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("mission audio clarification migration", () => {
  it("adds per-clip wording metadata and a tokenized lifecycle", () => {
    expect(sql).toContain("add column teacher_confirmed_text text");
    expect(sql).toContain("add column teacher_confirmed_by uuid");
    expect(sql).toContain("add column teacher_confirmed_at timestamptz");
    expect(sql).toContain("add column clarification_started_at timestamptz");
    expect(sql).toContain("add column clarification_token uuid");
    expect(sql).toContain(
      "create function public.begin_teacher_mission_audio_clarification",
    );
    expect(sql).toContain(
      "create function public.complete_teacher_mission_audio_clarification",
    );
    expect(sql).toContain(
      "create function public.clear_teacher_mission_audio_clarification",
    );
  });

  it("locks and independently gates a playable owned original or repeat clip", () => {
    expect(sql).toContain("for update of ac");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain(
      "v_clip_kind not in ('original_answer', 'repeat_attempt')",
    );
    expect(sql).toContain("nullif(btrim(v_object_key), '') is null");
    expect(sql).toContain("v_deleted_at is not null");
    expect(sql).toContain("v_audio_expires_at <= clock_timestamp()");
    expect(sql).toContain(
      "v_processing_status not in ('uploaded', 'transcribed')",
    );
    expect(sql).toContain("nullif(v_teacher_confirmed_text, '')");
    expect(sql).toContain("gen_random_uuid()");
    expect(sql).toContain("clock_timestamp() - interval '5 minutes'");
    expect(sql).toContain("clarification_token = v_clarification_token");
  });

  it("publishes only with the current token and atomically replaces one clip score", () => {
    expect(sql).toContain("and ac.clarification_token = p_clarification_token");
    expect(sql).toContain("on conflict (audio_clip_id) do update");
    expect(sql).toContain("teacher_confirmed_text = btrim(p_teacher_confirmed_text)");
    expect(sql).toContain("teacher_confirmed_by = p_teacher_id");
    expect(sql).toContain("teacher_confirmed_at = clock_timestamp()");
    expect(sql).toContain("clarification_started_at = null");
    expect(sql).toContain("clarification_token = null");
    expect(sql).toContain("where id = p_audio_clip_id");
    expect(sql).toContain(
      "revoke all on function public.begin_teacher_mission_audio_clarification",
    );
    expect(sql).toContain("grant execute on function public.begin_teacher_mission_audio_clarification");
    expect(sql).not.toContain("to authenticated");
  });
});
