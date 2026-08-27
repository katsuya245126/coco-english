import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/202608270001_start_student_attempt.sql",
  ),
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("start_student_attempt RPC", () => {
  it("locks and validates the owned, uncanceled assignment and snapshot", () => {
    expect(migration).toContain(
      "create or replace function public.start_student_attempt( p_student_id uuid, p_assignment_student_id uuid )",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("ast.student_id = p_student_id");
    expect(migration).toContain("a.canceled_at is null");
    expect(migration).toContain("for update of ast, a");
    expect(migration).toContain("v_snapshot ->> 'requiredturns'");
    expect(migration).toContain("jsonb_array_elements");
    expect(migration).toContain("conversationmode");
  });

  it("accepts only resumable or eligible assignment states", () => {
    expect(migration).toContain("v_assignment_status = 'started'");
    expect(migration).toContain("att.status = 'in_progress'");
    expect(migration).toContain("'assigned', 'missed', 'needs_retry'");
    expect(migration).toContain("return query select 'not_assigned_or_started'");
  });

  it("writes attempt, assignment link/count, and audit event in one function", () => {
    expect(migration).toContain("insert into public.attempts");
    expect(migration).toContain("update public.assignment_students");
    expect(migration).toContain("attempt_count = attempt_count + 1");
    expect(migration).toContain("latest_attempt_id = v_attempt_id");
    expect(migration).toContain("insert into public.assignment_status_events");
    expect(migration).toContain("mission_started");
    expect(migration).toContain("late_mission_started");
    expect(migration).toContain("reopened_by_teacher");
  });

  it("is callable only by service_role", () => {
    expect(migration).toContain(
      "revoke all on function public.start_student_attempt(uuid, uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.start_student_attempt(uuid, uuid) to service_role",
    );
  });
});
