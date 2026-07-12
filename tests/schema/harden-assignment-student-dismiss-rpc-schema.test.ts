import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../supabase/migrations/202607120005_harden_assignment_student_dismiss.sql"),
  "utf8",
).toLowerCase();

describe("hardened assignment-student dismiss RPCs", () => {
  it("limits both locked ownership queries to no-attempt incomplete rows", () => {
    expect(sql.match(/ast\.latest_attempt_id is null/g)).toHaveLength(2);
    expect(sql.match(/ast\.status in \('assigned', 'started', 'missed'\)/g)).toHaveLength(2);
    expect(sql.match(/for update of ast/g)).toHaveLength(2);
  });

  it("requires the correct dismissal state before writing an audit event", () => {
    expect(sql.match(/ast\.dismissed_at is null/g)).toHaveLength(1);
    expect(sql.match(/ast\.dismissed_at is not null/g)).toHaveLength(1);
    expect(sql).toContain("teacher_dismissed");
    expect(sql).toContain("teacher_dismiss_undone");
  });

  it("preserves security definer and service-role-only execution", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function/g)).toHaveLength(2);
    expect(sql.match(/to service_role/g)).toHaveLength(2);
  });
});
