import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  __dirname,
  "../../supabase/migrations/202607120003_dismiss_assignment_student.sql",
);

describe("dismiss_assignment_student migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

  it("adds the dismissal columns to assignment_students", () => {
    expect(sql).toContain("alter table public.assignment_students");
    expect(sql).toContain("dismissed_at timestamptz");
    expect(sql).toContain("dismissed_by uuid");
    expect(sql).toContain("dismiss_reason text");
  });

  it("locks and ownership-checks before writing, and never changes status", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("ast.latest_attempt_id = at.id");
    // status column must not be assigned by the dismiss RPCs
    expect(sql).not.toContain("set status =");
  });

  it("records dismiss + undo audit events with the right reason codes", () => {
    expect(sql).toContain("insert into public.assignment_status_events");
    expect(sql).toContain("teacher_dismissed");
    expect(sql).toContain("teacher_dismiss_undone");
    expect(sql).toContain("'teacher'");
  });

  it("exposes both RPCs to the service role only", () => {
    expect(sql).toContain("create or replace function public.dismiss_assignment_student");
    expect(sql).toContain("create or replace function public.undo_dismiss_assignment_student");
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("revoke all on function public.dismiss_assignment_student");
    expect(sql).toContain("revoke all on function public.undo_dismiss_assignment_student");
    expect(sql.match(/to service_role/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
