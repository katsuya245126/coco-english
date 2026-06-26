import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202606250005_mission_assign_rpc.sql";

describe("assign_mission_to_class RPC migration (ASGN-01, ASGN-03)", () => {
  it("defines a SECURITY DEFINER RPC with ownership checks and safe search_path (D-13)", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.assign_mission_to_class/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public/i);
    expect(sql).toMatch(/public\.current_teacher_id\(\)/i);
    expect(sql).toMatch(/m\.teacher_id\s*=\s*v_teacher_id/i);
    expect(sql).toMatch(/c\.teacher_id\s*=\s*v_teacher_id/i);
  });

  it("creates assignment, active-student rows, status events, and execute grant (D-08, D-09)", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/insert\s+into\s+public\.assignments/i);
    expect(sql).toMatch(/insert\s+into\s+public\.assignment_students/i);
    expect(sql).toMatch(/archived_at\s+is\s+null/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*assignment_id\s*,\s*student_id\s*\)\s+do\s+nothing/i);
    expect(sql).toMatch(/insert\s+into\s+public\.assignment_status_events/i);
    expect(sql).toMatch(/'assigned'/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.assign_mission_to_class/i);
  });

  it("copies D-04 due_at and D-12 class data_mode at assignment time", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/p_due_at/i);
    expect(sql).toMatch(/c\.data_mode/i);
    expect(sql).toMatch(/mission_snapshot/i);
  });
});
