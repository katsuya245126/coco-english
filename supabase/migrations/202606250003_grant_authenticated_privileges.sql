-- Grant table-level privileges to the `authenticated` role for all
-- teacher-owned tables.
--
-- Why this migration exists:
--   The foundation migration (0001) creates these tables in `public` and
--   enables RLS; the auth/RLS migration (0002) adds policies targeting the
--   `authenticated` role. But Postgres evaluates table-level GRANTs BEFORE it
--   evaluates RLS policies. With the project's "Automatically expose new
--   tables" Data API setting disabled (an intentional RLS-first posture),
--   Supabase does NOT auto-grant privileges to `anon`/`authenticated` for
--   tables created via raw SQL migrations. The result is
--   `permission denied for table ...` (SQLSTATE 42501) the moment a logged-in
--   user touches a table — the query fails at the GRANT layer, before any
--   policy runs.
--
--   This migration installs the missing GRANTs explicitly so they live in
--   version control and reproduce across environments. Privileges are scoped
--   to exactly the commands each table's policies allow; RLS still narrows
--   access to each teacher's own rows.

-- Schema usage (Supabase normally grants this by default; included idempotently).
grant usage on schema public to authenticated;

-- teacher_profiles: policies allow SELECT / INSERT / UPDATE (no DELETE policy).
grant select, insert, update on table public.teacher_profiles to authenticated;

-- Tables governed by `for all` policies: full CRUD.
grant select, insert, update, delete on table public.classes to authenticated;
grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.missions to authenticated;
grant select, insert, update, delete on table public.mission_turn_templates to authenticated;
grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.assignment_students to authenticated;
grant select, insert, update, delete on table public.attempts to authenticated;
grant select, insert, update, delete on table public.attempt_turns to authenticated;
grant select, insert, update, delete on table public.audio_clips to authenticated;

-- assignment_status_events: policies allow SELECT / INSERT only (append + read).
grant select, insert on table public.assignment_status_events to authenticated;
