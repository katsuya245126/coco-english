import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608250003_teacher_review_completion_by_transcript.sql",
  "utf8",
).toLowerCase().replace(/\s+/g, " ");

describe("teacher review completion migration", () => {
  it("repairs only owned latest active attempts through atomic completion", () => {
    expect(sql).toContain("create or replace function public.mark_submission_reviewed");
    expect(sql).toContain("ast.latest_attempt_id = at.id");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("select ast.student_id, ast.id, ast.status, at.status, at.needs_review_reason");
    expect(sql).toContain("v_assignment_status = 'started' and v_attempt_status = 'in_progress'");
    expect(sql).toContain("nullif(btrim(v_needs_review_reason), '') is not null");
    expect(sql).toMatch(/public\.complete_student_attempt\( v_student_id, v_assignment_student_id, p_attempt_id \)/);
    expect(sql).toContain("v_completion_result <> 'not_complete'");
    expect(sql).toContain("for update of at, ast");
    expect(sql).toContain("v_assignment_status, 'completed', 'teacher', p_teacher_id, 'teacher_review_accepted'");
  });

  it("accepts malformed evaluations only after every required turn has a transcript", () => {
    expect(sql).toContain("v_required_turns integer");
    expect(sql).toContain("count(distinct turn_row.turn_order)::integer");
    expect(sql).toContain("nullif(btrim(turn_row.original_transcript), '') is not null");
    expect(sql).toContain("if v_answered_turns <> v_required_turns then return 'not_complete';");
    expect(sql.indexOf("if v_answered_turns <> v_required_turns")).toBeLessThan(
      sql.indexOf("insert into public.submission_review_receipts"),
    );
  });

  it("preserves the receipt, security, and service-role seams", () => {
    expect(sql).toContain("insert into public.submission_review_receipts");
    expect(sql).toContain("on conflict (teacher_id, attempt_id) do update");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("revoke all on function public.mark_submission_reviewed(uuid, uuid)");
    expect(sql).toContain("grant execute on function public.mark_submission_reviewed(uuid, uuid) to service_role");
  });

  it("allows retry only for an owned flagged active attempt or existing terminal review", () => {
    expect(sql).toContain("create or replace function public.request_submission_retry");
    expect(sql).toContain("ast.latest_attempt_id = at.id");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("for update of at, ast");
    expect(sql).toContain("v_assignment_status = 'started' and v_attempt_status = 'in_progress'");
    expect(sql).toContain("nullif(btrim(v_needs_review_reason), '') is not null");
    expect(sql).toContain("v_assignment_status = 'completed' and v_attempt_status = 'completed'");
    expect(sql).toContain("v_assignment_status = 'teacher_review' and v_attempt_status = 'teacher_review'");
    expect(sql).toContain("latest_attempt_id = null");
    expect(sql).toContain("previous_status, next_status, actor_type, actor_id, reason_code, metadata");
    expect(sql).toContain("revoke all on function public.request_submission_retry(uuid, uuid, text)");
    expect(sql).toContain("grant execute on function public.request_submission_retry(uuid, uuid, text) to service_role");
  });
});
