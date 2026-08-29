import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608290004_serialize_completion_cancellation.sql",
  "utf8",
).toLowerCase();

describe("completion and cancellation serialization migration", () => {
  it("locks the parent assignment and checks cancellation before completion", () => {
    expect(sql).toContain("for update of assignment_row");
    expect(sql).toContain("assignment_row.canceled_at is null");
    expect(sql).toContain("canceled_at update takes this same row lock");
  });

  it("retains the service-role-only completion RPC", () => {
    expect(sql).toContain(
      "revoke all on function public.complete_student_attempt(uuid, uuid, uuid)",
    );
    expect(sql).toContain(
      "grant execute on function public.complete_student_attempt(uuid, uuid, uuid)",
    );
    expect(sql).toContain("to service_role");
  });
});
