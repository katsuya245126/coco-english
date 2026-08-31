import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608310001_teacher_pronunciation_samples.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");
const confirmationSql = readFileSync(
  "supabase/migrations/202608310002_teacher_pronunciation_sample_confirmation.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");
const lifecycleSql = readFileSync(
  "supabase/migrations/202608310003_teacher_pronunciation_sample_lifecycle.sql",
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

  it("stores separate confirmation provenance and a retryable claim", () => {
    expect(confirmationSql).toContain(
      "add column confirmation_started_at timestamptz",
    );
    expect(confirmationSql).toContain("add column confirmation_token uuid");
    expect(confirmationSql).toContain(
      "add column confirmed_by_teacher_id uuid references public.teacher_profiles(id)",
    );
    expect(confirmationSql).toContain("add column confirmed_at timestamptz");
    expect(confirmationSql).toContain(
      "create function public.read_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain(
      "revoke all on function public.read_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain(
      "grant execute on function public.read_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain(
      "create function public.begin_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain(
      "create function public.complete_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain(
      "create function public.clear_teacher_pronunciation_sample_confirmation",
    );
    expect(confirmationSql).toContain("for update of ps");
    expect(confirmationSql).toContain("ps.confirmation_token = p_confirmation_token");
    expect(confirmationSql).toContain("status = 'confirmed'");
    expect(confirmationSql).toContain("automatic_transcript");
    expect(confirmationSql).not.toContain(
      "create index pronunciation_samples_confirmation_idx",
    );
    expect(confirmationSql).not.toContain("10 minutes");
    expect(confirmationSql).not.toContain(
      "v_audio_expires_at <= clock_timestamp()",
    );
    const readStart = confirmationSql.indexOf(
      "create function public.read_teacher_pronunciation_sample_confirmation",
    );
    const beginStart = confirmationSql.indexOf(
      "create function public.begin_teacher_pronunciation_sample_confirmation",
    );
    expect(readStart).toBeGreaterThanOrEqual(0);
    expect(beginStart).toBeGreaterThan(readStart);
    expect(confirmationSql.slice(readStart, beginStart)).not.toContain(
      "for update",
    );
    expect(confirmationSql.slice(readStart, beginStart)).not.toContain(
      "update public.pronunciation_samples",
    );
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
    expect(confirmationSql.match(/security definer/g)).toHaveLength(4);
    expect(confirmationSql.match(/set search_path = public/g)).toHaveLength(4);
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

  it("claims expiry/removal before storage-first finalization", () => {
    expect(lifecycleSql).toContain(
      "add column deletion_started_at timestamptz",
    );
    expect(lifecycleSql).toContain("add column deletion_token uuid");
    expect(lifecycleSql).toContain("add column deletion_kind text");
    expect(lifecycleSql).toContain("add column playback_lease_until timestamptz");
    expect(lifecycleSql).toContain(
      "create function public.begin_teacher_pronunciation_sample_deletion",
    );
    expect(lifecycleSql).toContain(
      "create function public.claim_expired_teacher_pronunciation_samples",
    );
    expect(lifecycleSql).toContain(
      "create function public.finalize_teacher_pronunciation_sample_deletion",
    );
    expect(lifecycleSql).toContain(
      "create function public.finalize_expired_teacher_pronunciation_sample_deletion",
    );
    expect(lifecycleSql).toContain(
      "create function public.begin_teacher_pronunciation_sample_playback",
    );
    expect(lifecycleSql).toContain("interval '10 minutes'");
    expect(lifecycleSql).toContain("interval '6 minutes'");
    expect(lifecycleSql).toContain("deletion_kind = 'teacher'");
    expect(lifecycleSql).toContain("deletion_kind = 'expiry'");
    expect(lifecycleSql).toContain("deletion_kind text");
    expect(lifecycleSql).not.toContain(
      "clear_teacher_pronunciation_sample_deletion",
    );
    expect(lifecycleSql).not.toContain(
      "clear_expired_teacher_pronunciation_sample_deletion",
    );
    expect(lifecycleSql).toContain("teacher_id uuid");
    expect(lifecycleSql).toContain(
      "finalize_expired_teacher_pronunciation_sample_deletion(uuid, uuid, uuid)",
    );
    expect(lifecycleSql).toContain("for update of ps skip locked");
    expect(lifecycleSql).toContain("confirmation_token = null");
    expect(lifecycleSql).toContain("object_key = null");
    expect(lifecycleSql).toContain("revoke all on function public.claim_expired");
    expect(lifecycleSql).toContain("grant execute on function public.claim_expired");
  });
});
