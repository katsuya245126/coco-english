import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608140001_per_turn_target_patterns.sql",
  "utf8",
).toLowerCase();

describe("per-turn target pattern migration", () => {
  it("adds nullable turn patterns and permits preset missions without a mission pattern", () => {
    expect(migration).toMatch(
      /alter table public\.mission_turn_templates[\s\S]*add column if not exists target_pattern text/,
    );
    expect(migration).toMatch(
      /alter table public\.missions[\s\S]*alter column target_pattern drop not null/,
    );
    expect(migration).not.toMatch(/target_pattern text not null/);
  });

  it("backfills preset turns before relaxing the mission column", () => {
    const backfill = migration.indexOf("update public.mission_turn_templates");
    const relax = migration.indexOf("alter column target_pattern drop not null");

    expect(backfill).toBeGreaterThan(-1);
    expect(migration).toMatch(
      /update public\.mission_turn_templates[\s\S]*set target_pattern = missions\.target_pattern[\s\S]*from public\.missions[\s\S]*not missions\.conversation_mode/,
    );
    expect(backfill).toBeLessThan(relax);
  });

  it("does not rewrite snapshots or change security configuration", () => {
    expect(migration).not.toMatch(/update public\.assignments/);
    expect(migration).not.toContain("mission_snapshot =");
    expect(migration).not.toMatch(/\b(create|alter|drop) policy\b/);
    expect(migration).not.toMatch(/\b(grant|revoke)\b/);
    expect(migration).not.toContain("disable row level security");
  });
});
