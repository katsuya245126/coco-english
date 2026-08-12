import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608120001_atomic_teacher_attempt_review.sql",
  "utf8",
).toLowerCase().replace(/\s+/g, " ");

describe("atomic teacher attempt review migration", () => {
  it("adds owner-scoped atomic receipt operations", () => {
    expect(sql).toContain("create function public.mark_submission_viewed");
    expect(sql).toContain("create function public.reopen_submission_review");
    expect(sql.match(/c\.teacher_id = p_teacher_id/g)).toHaveLength(2);
    expect(sql.match(/for update of at/g)).toHaveLength(2);
    expect(sql).toContain("on conflict (teacher_id, attempt_id) do nothing");
    expect(sql).toContain("set reviewed_at = null");
  });

  it("keeps both functions service-role-only", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function public\./g)).toHaveLength(2);
    expect(sql.match(/grant execute on function public\./g)).toHaveLength(2);
    expect(sql.match(/to service_role/g)).toHaveLength(2);
  });
});
