import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608310001_teacher_pronunciation_samples.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("teacher pronunciation samples migration", () => {
  it("stores samples separately from mission audio with private retention metadata", () => {
    expect(sql).toContain("create table public.pronunciation_samples");
    expect(sql).toContain("student_id uuid not null references public.students");
    expect(sql).toContain("automatic_transcript text");
    expect(sql).toContain("provisional_result jsonb");
    expect(sql).toContain("duration_ms integer");
    expect(sql).toContain("audio_expires_at timestamptz not null default (now() + interval '30 days')");
    expect(sql).toContain("public.pronunciation_sample_status");
    expect(sql).toContain("duration_ms <= 30000");
  });

  it("keeps ownership and publication inside service-role RPCs", () => {
    for (const functionName of [
      "begin_teacher_pronunciation_sample",
      "complete_teacher_pronunciation_sample",
      "clear_teacher_pronunciation_sample",
    ]) {
      expect(sql).toContain(`create function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${functionName}`);
      expect(sql).toContain(`grant execute on function public.${functionName}`);
    }
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = public/g)).toHaveLength(4);
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("for update of s");
    expect(sql).toContain("for update of ps");
  });

  it("allows authenticated reads only through the owning-teacher policy", () => {
    expect(sql).toContain("alter table public.pronunciation_samples enable row level security");
    expect(sql).toContain("create policy \"teachers read own pronunciation samples\"");
    expect(sql).toContain("using (public.is_pronunciation_sample_owner(id))");
    expect(sql).toContain(
      "revoke insert, update, delete on table public.pronunciation_samples from authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.pronunciation_samples to authenticated",
    );
  });
});
