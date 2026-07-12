import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/202607120004_dismiss_assignment_student_by_id.sql"), "utf8").toLowerCase();

describe("assignment-student keyed dismiss RPCs", () => {
  it("owns and locks the assignment student without changing status", () => {
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("ast.id = p_assignment_student_id");
    expect(sql).toContain("for update of ast");
    expect(sql).not.toContain("set status =");
  });
  it("records dismiss and undo audit events", () => {
    expect(sql).toContain("teacher_dismissed");
    expect(sql).toContain("teacher_dismiss_undone");
    expect(sql).toContain("v_status, v_status, 'teacher'");
  });
  it("exposes both functions only to service_role", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function/g)).toHaveLength(2);
    expect(sql.match(/to service_role/g)).toHaveLength(2);
  });
});
