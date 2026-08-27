import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608270002_record_hint_reveal.sql";

describe("record_hint_reveal RPC migration", () => {
  it("defines a fixed-search-path, service-role-only security-definer RPC", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain(
      "create or replace function public.record_hint_reveal( p_student_id uuid, p_assignment_student_id uuid, p_attempt_id uuid, p_turn_order integer, p_hint_level integer )",
    );
    expect(sql).toContain("returns text");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain(
      "revoke all on function public.record_hint_reveal(uuid, uuid, uuid, integer, integer) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.record_hint_reveal(uuid, uuid, uuid, integer, integer) to service_role",
    );
  });

  it("locks the owned active chain, validates the turn, and updates both rollups monotonically", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain("p_hint_level < 1");
    expect(sql).toContain("p_hint_level > 3");
    expect(sql).toContain("ast.student_id = p_student_id");
    expect(sql).toContain("ast.status = 'started'");
    expect(sql).toContain("a.canceled_at is null");
    expect(sql).toContain("att.assignment_student_id = ast.id");
    expect(sql).toContain("att.status = 'in_progress'");
    expect(sql).toContain("t.attempt_id = v_attempt_id");
    expect(sql).toContain("t.turn_order = p_turn_order");
    expect(sql).toContain("for update of ast, a, att");
    expect(sql).toContain("for update");
    expect(sql).toContain("return 'no_turn_row'");
    expect(sql).toContain("greatest");
    expect(sql).toContain("update public.attempt_turns");
    expect(sql).toContain("update public.assignment_students");
  });
});
