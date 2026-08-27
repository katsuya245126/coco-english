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
  it("is a service-role-only security-definer RPC", () => {
    expect(migration).toContain(
      "create or replace function public.start_student_attempt( p_student_id uuid, p_assignment_student_id uuid )",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain(
      "revoke all on function public.start_student_attempt(uuid, uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.start_student_attempt(uuid, uuid) to service_role",
    );
  });
});
