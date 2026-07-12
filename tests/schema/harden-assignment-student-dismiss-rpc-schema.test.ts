import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../supabase/migrations/202607120005_harden_assignment_student_dismiss.sql"),
  "utf8",
).toLowerCase();

describe("hardened assignment-student dismiss RPCs", () => {
  const attemptDismissStart = sql.indexOf("create or replace function public.dismiss_assignment_student(");
  const byIdSql = sql.slice(0, attemptDismissStart);

  it("limits both locked ownership queries to no-attempt incomplete rows", () => {
    expect(byIdSql.match(/ast\.latest_attempt_id is null/g)).toHaveLength(2);
    expect(byIdSql.match(/ast\.status in \('assigned', 'started', 'missed'\)/g)).toHaveLength(2);
    expect(byIdSql.match(/for update of ast/g)).toHaveLength(2);
  });

  it("requires the correct dismissal state before writing an audit event", () => {
    expect(byIdSql.match(/ast\.dismissed_at is null/g)).toHaveLength(1);
    expect(byIdSql.match(/ast\.dismissed_at is not null/g)).toHaveLength(1);
    expect(byIdSql).toContain("teacher_dismissed");
    expect(byIdSql).toContain("teacher_dismiss_undone");
  });

  it("preserves security definer and service-role-only execution", () => {
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = public/g)).toHaveLength(4);
    expect(sql.match(/revoke all on function/g)).toHaveLength(4);
    expect(sql.match(/to service_role/g)).toHaveLength(4);
  });
});

describe("hardened attempt-keyed dismiss RPCs", () => {
  const dismissStart = sql.indexOf("create or replace function public.dismiss_assignment_student(");
  const undoStart = sql.indexOf("create or replace function public.undo_dismiss_assignment_student(");
  const grantsStart = sql.indexOf("revoke all on function public.dismiss_assignment_student(uuid, uuid, text)");
  const dismiss = sql.slice(dismissStart, undoStart);
  const undo = sql.slice(undoStart, grantsStart);

  it("preserves signatures and locks an owned latest attempt in an incomplete state", () => {
    expect(dismissStart).toBeGreaterThan(-1);
    expect(undoStart).toBeGreaterThan(dismissStart);
    for (const body of [dismiss, undo]) {
      expect(body).toContain("ast.latest_attempt_id = at.id");
      expect(body).toContain("c.teacher_id = p_teacher_id");
      expect(body).toContain("ast.status in ('assigned', 'started', 'missed')");
      expect(body).toContain("for update of at, ast");
      expect(body).not.toContain("set status =");
    }
    expect(dismiss).toContain("p_teacher_id uuid, p_attempt_id uuid, p_reason text");
    expect(undo).toContain("p_teacher_id uuid, p_attempt_id uuid");
  });

  it("makes repeated dismiss and undo calls ineligible before auditing", () => {
    expect(dismiss).toContain("ast.dismissed_at is null");
    expect(dismiss).toContain("teacher_dismissed");
    expect(undo).toContain("ast.dismissed_at is not null");
    expect(undo).toContain("teacher_dismiss_undone");
  });

  it("preserves exact service-role permissions", () => {
    expect(sql).toContain("revoke all on function public.dismiss_assignment_student(uuid, uuid, text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.dismiss_assignment_student(uuid, uuid, text) to service_role;");
    expect(sql).toContain("revoke all on function public.undo_dismiss_assignment_student(uuid, uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.undo_dismiss_assignment_student(uuid, uuid) to service_role;");
  });
});
