-- Phase 2 (plan 02-01): Teacher auth + RLS ownership.
--
-- Roots every teacher-owned table in teacher_profiles.auth_user_id = auth.uid().
-- RLS was already enabled on all tables by the foundation migration; this adds
-- the policies, ownership helpers, the join_code lookup index, and an active
-- student name uniqueness constraint. Student PINs remain hash-only (pin_hash);
-- no plaintext PIN column is introduced.

-- ---------------------------------------------------------------------------
-- Ownership helpers
-- ---------------------------------------------------------------------------

-- The teacher_profiles.id for the currently authenticated Supabase user, or
-- null if there is no profile yet. SECURITY DEFINER so policy evaluation can
-- resolve ownership without recursing through teacher_profiles RLS.
create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.teacher_profiles p
  where p.auth_user_id = (select auth.uid())
$$;

-- True when the given class belongs to the current teacher.
create or replace function public.is_class_owner(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- True when the given mission belongs to the current teacher.
create or replace function public.is_mission_owner(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    where m.id = target_mission_id
      and m.teacher_id = public.current_teacher_id()
  )
$$;

-- True when the given assignment belongs to the current teacher (via its class).
create or replace function public.is_assignment_owner(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = target_assignment_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- True when the given assignment_students row belongs to the current teacher.
create or replace function public.is_assignment_student_owner(
  target_assignment_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignment_students asg
    join public.assignments a on a.id = asg.assignment_id
    join public.classes c on c.id = a.class_id
    where asg.id = target_assignment_student_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- True when the given attempt belongs to the current teacher.
create or replace function public.is_attempt_owner(target_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempts at
    join public.assignment_students asg on asg.id = at.assignment_student_id
    join public.assignments a on a.id = asg.assignment_id
    join public.classes c on c.id = a.class_id
    where at.id = target_attempt_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- True when the given attempt_turn belongs to the current teacher.
create or replace function public.is_attempt_turn_owner(
  target_attempt_turn_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempt_turns t
    join public.attempts at on at.id = t.attempt_id
    join public.assignment_students asg on asg.id = at.assignment_student_id
    join public.assignments a on a.id = asg.assignment_id
    join public.classes c on c.id = a.class_id
    where t.id = target_attempt_turn_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- teacher_profiles: self-ownership by auth_user_id = auth.uid()
-- ---------------------------------------------------------------------------

create policy "teachers read own profile"
on public.teacher_profiles for select
to authenticated
using (auth_user_id = (select auth.uid()));

create policy "teachers insert own profile"
on public.teacher_profiles for insert
to authenticated
with check (auth_user_id = (select auth.uid()));

create policy "teachers update own profile"
on public.teacher_profiles for update
to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- classes: direct ownership via teacher_id -> teacher_profiles
-- ---------------------------------------------------------------------------

create policy "teachers manage own classes"
on public.classes for all
to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id());

-- ---------------------------------------------------------------------------
-- students: ownership through the parent class
-- ---------------------------------------------------------------------------

create policy "teachers manage own students"
on public.students for all
to authenticated
using (public.is_class_owner(class_id))
with check (public.is_class_owner(class_id));

-- ---------------------------------------------------------------------------
-- missions: direct ownership via teacher_id
-- ---------------------------------------------------------------------------

create policy "teachers manage own missions"
on public.missions for all
to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id());

-- ---------------------------------------------------------------------------
-- mission_turn_templates: ownership through the parent mission
-- ---------------------------------------------------------------------------

create policy "teachers manage own mission turns"
on public.mission_turn_templates for all
to authenticated
using (public.is_mission_owner(mission_id))
with check (public.is_mission_owner(mission_id));

-- ---------------------------------------------------------------------------
-- assignments: ownership through the parent class
-- ---------------------------------------------------------------------------

create policy "teachers manage own assignments"
on public.assignments for all
to authenticated
using (public.is_class_owner(class_id))
with check (public.is_class_owner(class_id));

-- ---------------------------------------------------------------------------
-- assignment_students: ownership through assignment -> class
-- ---------------------------------------------------------------------------

create policy "teachers manage own assignment students"
on public.assignment_students for all
to authenticated
using (public.is_assignment_owner(assignment_id))
with check (public.is_assignment_owner(assignment_id));

-- ---------------------------------------------------------------------------
-- attempts: ownership through assignment_students -> assignment -> class
-- ---------------------------------------------------------------------------

create policy "teachers manage own attempts"
on public.attempts for all
to authenticated
using (public.is_assignment_student_owner(assignment_student_id))
with check (public.is_assignment_student_owner(assignment_student_id));

-- ---------------------------------------------------------------------------
-- attempt_turns: ownership through the attempt chain
-- ---------------------------------------------------------------------------

create policy "teachers manage own attempt turns"
on public.attempt_turns for all
to authenticated
using (public.is_attempt_owner(attempt_id))
with check (public.is_attempt_owner(attempt_id));

-- ---------------------------------------------------------------------------
-- audio_clips: ownership through attempt_turns -> attempt chain
-- ---------------------------------------------------------------------------

create policy "teachers manage own audio clips"
on public.audio_clips for all
to authenticated
using (public.is_attempt_turn_owner(attempt_turn_id))
with check (public.is_attempt_turn_owner(attempt_turn_id));

-- ---------------------------------------------------------------------------
-- assignment_status_events: append-only audit trail (select + insert only)
-- ownership through assignment_students -> assignment -> class
-- ---------------------------------------------------------------------------

create policy "teachers read own status events"
on public.assignment_status_events for select
to authenticated
using (public.is_assignment_student_owner(assignment_student_id));

create policy "teachers append own status events"
on public.assignment_status_events for insert
to authenticated
with check (public.is_assignment_student_owner(assignment_student_id));

-- ---------------------------------------------------------------------------
-- Indexes / constraints
-- ---------------------------------------------------------------------------

-- Fast join-code lookups for student class entry (D-09 stable join codes).
create index if not exists classes_join_code_idx
  on public.classes (join_code);

-- One active (non-archived) student per normalized name within a class so the
-- typed-name unlock flow stays unambiguous (RESEARCH open question 2 RESOLVED).
create unique index if not exists students_active_name_per_class_idx
  on public.students (class_id, lower(display_name))
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Student PIN storage contract
-- ---------------------------------------------------------------------------

-- Student access is app-owned (no Supabase Auth account). Only the salted +
-- peppered hash is ever stored in students.pin_hash; a plaintext PIN column
-- must never be added. This statement documents the contract in the migration
-- and asserts the hash-only column remains in place.
comment on column public.students.pin_hash is
  'App-owned student PIN: store only the salted/peppered hash here. Never store a plaintext PIN.';
