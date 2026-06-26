-- Grant table-level privileges to the `service_role` for all teacher-owned
-- tables.
--
-- Why this migration exists:
--   `service_role` is the trusted server-side role used by the app's
--   service-role client (src/lib/supabase/server.ts) for operations that run
--   outside a teacher's authenticated session — notably the student-access
--   path (resolveClassByJoinCode / unlockStudent), where students have no auth
--   account. It is expected to bypass RLS and have full table access.
--
--   Normally Supabase grants `service_role` broad privileges on `public`
--   tables automatically. But with "Automatically expose new tables" disabled
--   (the project's intentional RLS-first posture), that auto-grant is
--   suppressed for tables created via raw SQL migrations — for BOTH `anon`/
--   `authenticated` AND `service_role`. Migration 0003 restored grants for
--   `authenticated`; this migration does the same for `service_role`, which
--   was otherwise left with no privileges and failed every query with
--   `permission denied for table` (SQLSTATE 42501). This surfaced when the
--   student join flow and the cross-teacher isolation test exercised the
--   service-role client against the live database.
--
--   service_role is the trusted bypass role, so it receives full CRUD on every
--   teacher-owned table. RLS does not constrain it (it has BYPASSRLS); these
--   are the table-level GRANTs Postgres checks before RLS.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.teacher_profiles to service_role;
grant select, insert, update, delete on table public.classes to service_role;
grant select, insert, update, delete on table public.students to service_role;
grant select, insert, update, delete on table public.missions to service_role;
grant select, insert, update, delete on table public.mission_turn_templates to service_role;
grant select, insert, update, delete on table public.assignments to service_role;
grant select, insert, update, delete on table public.assignment_students to service_role;
grant select, insert, update, delete on table public.attempts to service_role;
grant select, insert, update, delete on table public.attempt_turns to service_role;
grant select, insert, update, delete on table public.audio_clips to service_role;
grant select, insert, update, delete on table public.assignment_status_events to service_role;
