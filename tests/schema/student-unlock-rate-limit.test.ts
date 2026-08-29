import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202607310001_student_unlock_rate_limit.sql",
  "utf8",
).toLowerCase();

describe("student unlock rate limiter migration", () => {
  it("stores only digests and atomic window counters", () => {
    expect(sql).toContain("create table public.student_unlock_attempts");
    expect(sql).toContain("primary key (target_digest, network_digest)");
    expect(sql).toContain("attempt_count integer");
    expect(sql).not.toMatch(/\bpin\b|\bdisplay_name\b|\bjoin_code\b|\bip_address\b/);
  });

  it("enables RLS and grants only service_role access", () => {
    expect(sql).toContain(
      "alter table public.student_unlock_attempts enable row level security",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.student_unlock_attempts to service_role",
    );
    expect(sql).toContain("revoke all on function public.consume_student_unlock_attempt");
    expect(sql).toContain("grant execute on function public.consume_student_unlock_attempt");
  });

  it("atomically resets after ten minutes and permits only five attempts", () => {
    expect(sql).toContain("on conflict (target_digest, network_digest) do update");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("return v_attempt_count <= 5");
  });
});

const targetBudgetSql = readFileSync(
  "supabase/migrations/202608290003_student_unlock_target_budget.sql",
  "utf8",
).toLowerCase();

describe("student unlock target-wide budget migration", () => {
  it("updates target and pair counters atomically with 10/5 limits", () => {
    expect(targetBudgetSql).toContain(
      "create table public.student_unlock_target_attempts",
    );
    expect(targetBudgetSql).toContain("v_target_attempt_count");
    expect(targetBudgetSql).toContain("v_pair_attempt_count");
    expect(targetBudgetSql).toContain(
      "return v_target_attempt_count <= 10 and v_pair_attempt_count <= 5",
    );
    expect(targetBudgetSql).toContain("clear_student_unlock_attempts");
    expect(targetBudgetSql).toContain(
      "delete from public.student_unlock_attempts",
    );
    expect(targetBudgetSql).toContain(
      "delete from public.student_unlock_target_attempts",
    );
  });

  it("keeps limiter and clear RPCs service-role-only", () => {
    expect(targetBudgetSql).toContain(
      "revoke all on function public.consume_student_unlock_attempt(text, text)",
    );
    expect(targetBudgetSql).toContain(
      "revoke all on function public.clear_student_unlock_attempts(text)",
    );
    expect(targetBudgetSql).toContain(
      "grant execute on function public.clear_student_unlock_attempts(text)",
    );
  });
});
