import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The migration wraps long statements across lines for readability, so these
// contract assertions compare against a whitespace-normalized copy.
const sql = readFileSync(
  "supabase/migrations/202607310002_provider_request_budgets.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("provider request budgets migration", () => {
  it("stores only actor digests, operations, and fixed-window counters", () => {
    expect(sql).toContain("create table public.request_budgets");
    expect(sql).toContain("primary key (actor_digest, operation)");
    expect(sql).toContain("request_count integer");
    expect(sql).toContain(
      "operation in ( 'student_audio', 'student_helper', 'teacher_provider', 'evaluator_warmup' )",
    );
    expect(sql).not.toMatch(
      /\bstudent_id\b|\bteacher_id\b|\bip_address\b|\btranscript\b|\bprovider_input\b/,
    );
  });

  it("enables RLS and exposes the table and RPC only to service_role", () => {
    expect(sql).toContain(
      "alter table public.request_budgets enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.request_budgets from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.request_budgets to service_role",
    );
    expect(sql).toContain("security invoker");
    expect(sql).toContain(
      "revoke all on function public.consume_request_budget( text, text, integer, integer ) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.consume_request_budget( text, text, integer, integer ) to service_role",
    );
  });

  it("uses one atomic upsert and returns the remaining fixed-window delay", () => {
    expect(sql).toContain("on conflict (actor_digest, operation) do update");
    expect(sql).toContain("make_interval(secs => p_window_seconds)");
    expect(sql).toContain("return query");
    expect(sql).toContain("retry_after_seconds");
  });

  it("expires a window whose start is exactly one window old", () => {
    // Pins `<=` rather than `<` statically: a behavioural test cannot tell the
    // two apart, because the RPC's own clock_timestamp() advances past the
    // boundary before the comparison runs.
    expect(sql).toContain(
      "public.request_budgets.window_started_at <= v_now - make_interval(secs => p_window_seconds)",
    );
  });

  it("saturates the denied counter instead of incrementing without bound", () => {
    expect(sql).toContain(
      "least(public.request_budgets.request_count, p_request_limit) + 1",
    );
  });
});
