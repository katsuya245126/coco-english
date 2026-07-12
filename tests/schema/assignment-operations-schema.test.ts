import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../supabase/migrations/202607120001_assignment_operations.sql"),
  "utf8",
).toLowerCase();

describe("assignment operations schema", () => {
  it("adds the bounded class review policy with the safe default", () => {
    expect(sql).toContain("create type public.class_review_policy as enum ('every_submission', 'flagged_only')");
    expect(sql).toContain("review_policy public.class_review_policy not null default 'every_submission'");
  });

  it("stores tenant-owned per-attempt review receipts", () => {
    expect(sql).toContain("references public.teacher_profiles(id) on delete cascade");
    expect(sql).toContain("references public.attempts(id) on delete cascade");
    expect(sql).toContain("unique (teacher_id, attempt_id)");
    expect(sql).toContain("alter table public.submission_review_receipts enable row level security");
    expect(sql.match(/create policy "teachers .* own submission review receipts"/g)?.length).toBe(3);
    expect(sql).toContain("c.teacher_id = public.current_teacher_id()");
  });

  it("provides owned atomic review and retry RPCs", () => {
    expect(sql).toContain("function public.mark_submission_reviewed");
    expect(sql).toContain("function public.request_submission_retry");
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/c.teacher_id = p_teacher_id/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/insert into public.assignment_status_events/g)?.length).toBe(2);
    expect(sql).toContain("reason_code\n    ) values (v_assignment_student_id, 'teacher_review', 'completed'");
    expect(sql).toContain(") values (v_assignment_student_id, v_assignment_status, 'needs_retry'");
  });

  it("restricts mutation RPCs to service_role", () => {
    expect(sql.match(/revoke all on function public\.(mark_submission_reviewed|request_submission_retry)/g)?.length).toBe(2);
    expect(sql.match(/grant execute on function public\.(mark_submission_reviewed|request_submission_retry)/g)?.length).toBe(2);
    expect(sql.match(/to service_role/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not redefine existing status enums or completion RPC", () => {
    expect(sql).not.toContain("create type assignment_student_status");
    expect(sql).not.toContain("complete_student_attempt");
  });
});
