import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609120001_fix_teacher_evidence_completion.sql",
  "utf8",
).toLowerCase().replace(/\s+/g, " ");
const retrySql = readFileSync(
  "supabase/migrations/202608260001_teacher_review_completion_for_active_attempts.sql",
  "utf8",
).toLowerCase().replace(/\s+/g, " ");

describe("teacher review completion migration", () => {
  it("repairs only owned latest active attempts through transcript completion", () => {
    expect(sql).toContain("create or replace function public.mark_submission_reviewed");
    expect(sql).toContain("ast.latest_attempt_id = at.id");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("select ast.id, ast.status, at.status");
    expect(sql).toContain("v_assignment_status = 'started' and v_attempt_status = 'in_progress'");
    expect(sql).not.toContain("complete_student_attempt");
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

  it("uses pronunciation snapshot words and terminal tries for pronunciation evidence", () => {
    expect(sql).toContain("v_assignment_kind public.assignment_kind");
    expect(sql).toContain("a.assignment_kind");
    expect(sql).toContain("if v_assignment_kind = 'mission' then");
    expect(sql).toContain("elsif v_assignment_kind = 'pronunciation' then");
    expect(sql).toContain("v_required_words integer");
    expect(sql).toContain("v_snapshot ->> 'requiredwords'");
    expect(sql).toContain("v_snapshot ->> 'requiredturns' !~ '^[0-9]+$'");
    expect(sql).toContain("v_snapshot ->> 'requiredwords' !~ '^[0-9]+$'");
    expect(sql).toContain("if length(v_snapshot ->> 'requiredturns') > 10 then");
    expect(sql).toContain("if (v_snapshot ->> 'requiredturns')::numeric > 2147483647 then");
    expect(sql).toContain("if length(v_snapshot ->> 'requiredwords') > 10 then");
    expect(sql).toContain("if (v_snapshot ->> 'requiredwords')::numeric > 2147483647 then");
    expect(sql).toContain("word_try.outcome = 'passed'");
    expect(sql).toContain("word_try.try_number = 3");
    expect(sql).toContain("if v_finished_words <> v_required_words then return 'not_complete';");
    expect(sql.indexOf("if v_finished_words <> v_required_words then return 'not_complete';")).toBeLessThan(
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

  it("keeps retry restricted to an owned active attempt or existing terminal review", () => {
    expect(retrySql).toContain("create or replace function public.request_submission_retry");
    expect(retrySql).toContain("ast.latest_attempt_id = at.id");
    expect(retrySql).toContain("c.teacher_id = p_teacher_id");
    expect(retrySql).toContain("for update of at, ast");
    expect(retrySql).toContain("v_assignment_status = 'started' and v_attempt_status = 'in_progress'");
    expect(retrySql).not.toContain("v_needs_review_reason");
    expect(retrySql).toContain("v_assignment_status = 'completed' and v_attempt_status = 'completed'");
    expect(retrySql).toContain("v_assignment_status = 'teacher_review' and v_attempt_status = 'teacher_review'");
    expect(retrySql).toContain("latest_attempt_id = null");
    expect(retrySql).toContain("previous_status, next_status, actor_type, actor_id, reason_code, metadata");
    expect(retrySql).toContain("revoke all on function public.request_submission_retry(uuid, uuid, text)");
    expect(retrySql).toContain("grant execute on function public.request_submission_retry(uuid, uuid, text) to service_role");
  });
});
