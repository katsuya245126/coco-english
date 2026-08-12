import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608120002_rpc_owned_workflow_tables.sql";

describe("RPC-owned workflow table migration", () => {
  it("removes authenticated workflow writes while preserving owned reads", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain(
      "revoke insert, update, delete on table public.assignment_students from authenticated",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on table public.attempts from authenticated",
    );
    expect(sql).toContain(
      "revoke insert on table public.assignment_status_events from authenticated",
    );
    expect(sql).toContain(
      "revoke insert, update on table public.submission_review_receipts from authenticated",
    );

    expect(sql).toContain(
      'drop policy "teachers manage own assignment students" on public.assignment_students',
    );
    expect(sql).toContain(
      'create policy "teachers read own assignment students" on public.assignment_students for select to authenticated using (public.is_assignment_owner(assignment_id))',
    );
    expect(sql).toContain(
      'drop policy "teachers manage own attempts" on public.attempts',
    );
    expect(sql).toContain(
      'create policy "teachers read own attempts" on public.attempts for select to authenticated using (public.is_assignment_student_owner(assignment_student_id))',
    );
    expect(sql).toContain(
      'drop policy "teachers append own status events" on public.assignment_status_events',
    );
    expect(sql).toContain(
      'drop policy "teachers insert own submission review receipts" on public.submission_review_receipts',
    );
    expect(sql).toContain(
      'drop policy "teachers update own submission review receipts" on public.submission_review_receipts',
    );
  });
});
