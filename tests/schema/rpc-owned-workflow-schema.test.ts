import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608120002_rpc_owned_workflow_tables.sql";
const attemptTurnsMigrationPath =
  "supabase/migrations/202608130001_attempt_turns_read_only.sql";
const attemptTurnsAclMigrationPath =
  "supabase/migrations/202608130002_attempt_turns_strict_acl.sql";

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

  it("makes attempt turns authenticated read-only while preserving service-role writes", () => {
    expect(existsSync(attemptTurnsMigrationPath)).toBe(true);
    if (!existsSync(attemptTurnsMigrationPath)) return;

    const sql = readFileSync(attemptTurnsMigrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain(
      "revoke insert, update, delete on table public.attempt_turns from authenticated",
    );
    expect(sql).toContain(
      'drop policy "teachers manage own attempt turns" on public.attempt_turns',
    );
    expect(sql).toContain(
      'create policy "teachers read own attempt turns" on public.attempt_turns for select to authenticated using (public.is_attempt_owner(attempt_id))',
    );

    const serviceRolePrivileges = readFileSync(
      "supabase/migrations/202606250004_grant_service_role_privileges.sql",
      "utf8",
    )
      .toLowerCase()
      .replace(/\s+/g, " ");
    expect(serviceRolePrivileges).toContain(
      "grant select, insert, update, delete on table public.attempt_turns to service_role",
    );
  });

  it("removes residual attempt turn privileges from public API roles", () => {
    expect(existsSync(attemptTurnsAclMigrationPath)).toBe(true);
    if (!existsSync(attemptTurnsAclMigrationPath)) return;

    const sql = readFileSync(attemptTurnsAclMigrationPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ");

    expect(sql).toContain(
      "revoke all privileges on table public.attempt_turns from anon, authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.attempt_turns to authenticated",
    );
  });
});
