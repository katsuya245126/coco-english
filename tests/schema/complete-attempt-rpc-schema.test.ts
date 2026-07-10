import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  __dirname,
  "../../supabase/migrations/202607100001_complete_student_attempt_rpc.sql",
);

describe("complete_student_attempt RPC", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

  it("locks ownership rows and validates every required turn inside the transaction", () => {
    expect(sql.match(/for update/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("p_student_id");
    expect(sql).toContain("mission_snapshot ->> 'requiredturns'");
    expect(sql).not.toContain("p_required_turns");
    expect(sql).toContain("accepted_original");
    expect(sql).toContain("repeat_accepted is true");
  });

  it("updates assignment and attempt and inserts the audit event atomically", () => {
    expect(sql).toContain("update public.assignment_students");
    expect(sql).toContain("insert into public.assignment_status_events");
    expect(sql).toContain("update public.attempts");
    expect(sql).toContain("mission_completed");
  });

  it("is callable only by the service role", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.complete_student_attempt");
    expect(sql).toContain("grant execute on function public.complete_student_attempt");
    expect(sql).toContain("to service_role");
  });
});
