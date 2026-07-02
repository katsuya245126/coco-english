-- Phase 9 (plan 09-02): dedicated pronunciation_scores table (PRON-06, D-06).
--
-- Pronunciation scores are stored independently of attempt_turns.evaluation so
-- a clip can be re-scored (e.g. after a provider/model change) without
-- touching Phase 6's meaning/target-pattern evaluation data. Keyed on
-- audio_clip_id with a UNIQUE constraint: one score per clip, replaced in
-- place by an upsert rather than accumulating a history.
--
-- RLS ownership mirrors the existing audio_clips policy one join-hop further:
-- pronunciation_scores -> audio_clips -> attempt_turns -> attempts ->
-- assignment_students -> assignments -> classes.teacher_id, via a new
-- is_audio_clip_owner() helper following the exact shape of
-- is_attempt_turn_owner() (202606250002_teacher_auth_rls.sql).
--
-- Grants follow the pattern established in 202607010001_tts_audio_cache.sql
-- for tables introduced after the initial grant migrations (0003/0004): the
-- grants live inline in this migration rather than editing the old ones.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.pronunciation_scores (
  id uuid primary key default gen_random_uuid(),
  audio_clip_id uuid not null references public.audio_clips(id) on delete cascade,
  provider text not null default 'azure_speech',
  reference_text text not null,
  accuracy_score numeric not null check (accuracy_score >= 0 and accuracy_score <= 100),
  fluency_score numeric check (fluency_score >= 0 and fluency_score <= 100),
  completeness_score numeric check (completeness_score >= 0 and completeness_score <= 100),
  pronunciation_score numeric not null check (pronunciation_score >= 0 and pronunciation_score <= 100),
  star_band smallint not null check (star_band in (1, 2, 3)),
  word_scores jsonb not null default '[]'::jsonb,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (audio_clip_id)
);

alter table public.pronunciation_scores enable row level security;

-- ---------------------------------------------------------------------------
-- Ownership helper
-- ---------------------------------------------------------------------------

-- True when the given audio_clip belongs to the current teacher, tracing the
-- same ownership chain as is_attempt_turn_owner() one join-hop further
-- (audio_clips -> attempt_turns -> attempts -> assignment_students ->
-- assignments -> classes).
create or replace function public.is_audio_clip_owner(
  target_audio_clip_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.audio_clips ac
    join public.attempt_turns t on t.id = ac.attempt_turn_id
    join public.attempts at on at.id = t.attempt_id
    join public.assignment_students asg on asg.id = at.assignment_student_id
    join public.assignments a on a.id = asg.assignment_id
    join public.classes c on c.id = a.class_id
    where ac.id = target_audio_clip_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- pronunciation_scores: ownership through audio_clips -> attempt_turns chain
-- ---------------------------------------------------------------------------

create policy "teachers manage own pronunciation scores"
on public.pronunciation_scores for all
to authenticated
using (public.is_audio_clip_owner(audio_clip_id))
with check (public.is_audio_clip_owner(audio_clip_id));

-- ---------------------------------------------------------------------------
-- Privileges
--
-- With auto-expose disabled (RLS-first posture), tables created via raw SQL
-- migrations receive no default grants for authenticated or service_role.
-- Grant the same per-table privileges audio_clips already has (202606250003 /
-- 202606250004): full CRUD for both roles, narrowed for authenticated by the
-- RLS policy above; service_role is the trusted bypass role used by the
-- scoring pipeline (09-05) to write scores.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.pronunciation_scores to authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.pronunciation_scores to service_role;
