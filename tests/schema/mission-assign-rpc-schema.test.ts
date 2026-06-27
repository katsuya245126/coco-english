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

describe("assign_mission_to_class ambiguous-column fix migration", () => {
  const fixPath =
    "supabase/migrations/202606260001_fix_assign_rpc_ambiguous_column.sql";

  it("drops then recreates the RPC with prefixed OUT columns so no OUT param collides with a table column", () => {
    const sql = readFileSync(fixPath, "utf8");

    // Renaming the RETURNS TABLE columns changes the return type, which requires
    // a DROP before recreate (SQLSTATE 42P13).
    expect(sql).toMatch(
      /drop\s+function\s+if\s+exists\s+public\.assign_mission_to_class/i,
    );
    // OUT columns must be prefixed so they cannot collide with assignment_id /
    // class_name table columns referenced inside the CTEs.
    expect(sql).toMatch(/out_assignment_id\s+uuid/i);
    expect(sql).toMatch(/out_active_student_count\s+integer/i);
    expect(sql).toMatch(/out_class_name\s+text/i);
    // The bare OUT name `assignment_id` must NOT appear as a RETURNS TABLE column.
    expect(sql).not.toMatch(
      /returns\s+table\s*\([^)]*\bassignment_id\s+uuid/i,
    );
    // Grant must be re-issued after the drop.
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.assign_mission_to_class/i,
    );
  });
});
