-- Phase 8 (plan 08-02): private Storage bucket and cache table for Coco TTS audio.
--
-- VOICE-03 requires observable cache reuse and cost control. Generated Coco
-- speech is expensive to synthesize, so the server caches each rendered line by
-- a server-computed content hash and stores the audio bytes in a dedicated
-- private bucket, separate from student recording evidence (student-audio).
--
-- Security posture (see 08-02 threat register):
--   * The `tts-audio` bucket is PRIVATE. Audio is served only through
--     app-controlled signed URLs after student ownership checks; no public
--     Storage policy or public object URL is introduced (T-08-05).
--   * `content_hash` is server-computed and UNIQUE. The cache never accepts a
--     client-supplied hash, so identical input reuses one row and cannot be
--     forced to regenerate paid audio (T-08-02, T-08-03).
--   * The cache table stores only rendering metadata and the content hash — no
--     student transcripts or full spoken text (VOICE-03 privacy boundary).
--   * RLS is enabled with no teacher/anon policy. Access is service-role only,
--     consistent with existing server-owned tables; the browser cannot select
--     cache rows directly (T-08-04). The service-role client bypasses RLS and
--     relies on the explicit table GRANTs below (RLS-first posture: the project
--     disables auto-grants, so raw-SQL tables receive no privileges by default).
--
-- This migration is additive. It does not modify homework status, attempts,
-- audio_clips, or student-audio semantics.

-- ─── Private generated-audio bucket ───

insert into storage.buckets (id, name, public)
values ('tts-audio', 'tts-audio', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;

-- ─── Cache table ───

create table if not exists public.tts_audio_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  provider text not null,
  model text not null,
  voice text not null,
  response_format text not null,
  character_id text not null,
  object_key text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size >= 0),
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

-- Enable RLS with no policy: only the service-role (BYPASSRLS) trusted server
-- client may read or write cache rows. The browser has no route to these rows.
alter table public.tts_audio_cache enable row level security;

-- ─── Service-role privileges ───
--
-- With auto-expose disabled (RLS-first posture), tables created via raw SQL
-- migrations receive no default grants — not even for service_role. Grant the
-- trusted bypass role full CRUD, matching migration 202606250004.

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.tts_audio_cache to service_role;
