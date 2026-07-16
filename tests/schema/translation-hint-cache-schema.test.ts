import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("translation hint cache migration", () => {
  it("creates a service-role-only locale-aware cache", () => {
    const migration = readFileSync(
      "supabase/migrations/202607150001_translation_hint_cache.sql",
      "utf8",
    ).toLowerCase();

    expect(migration).toContain("create table public.translation_hint_cache");
    expect(migration).toContain("source_digest text not null");
    expect(migration).toContain("student_level text not null");
    expect(migration).toContain("target_locale text not null");
    expect(migration).toContain("phrases jsonb not null");
    expect(migration).toContain(
      "unique (source_digest, student_level, target_locale)",
    );
    expect(migration).toContain(
      "alter table public.translation_hint_cache enable row level security",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.translation_hint_cache to service_role",
    );
    expect(migration).not.toContain("create policy");
  });
});
