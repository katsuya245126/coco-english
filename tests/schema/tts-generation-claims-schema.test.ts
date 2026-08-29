import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608290002_tts_generation_claims.sql",
  "utf8",
).toLowerCase();

describe("TTS generation claim migration", () => {
  it("uses an expiring per-content owner token", () => {
    expect(sql).toContain("create table public.tts_audio_generation_claims");
    expect(sql).toContain("content_hash text primary key");
    expect(sql).toContain("owner_token uuid not null");
    expect(sql).toContain("lease_expires_at timestamptz not null");
    expect(sql).toContain("where public.tts_audio_generation_claims.lease_expires_at <= now()");
  });

  it("fences finalization and release by the current token and lease", () => {
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_content_hash, 0))",
    );
    expect(sql).toContain("v_claim_owner_token is distinct from p_owner_token");
    expect(sql).toContain("v_claim_expires_at <= now()");
    expect(sql).toContain("and owner_token = p_owner_token");
    expect(sql).toContain("insert into public.tts_audio_cache");
    expect(sql).toContain("revoke all on function public.finalize_tts_audio_generation");
    expect(sql).toContain("grant execute on function public.finalize_tts_audio_generation");
  });
});
