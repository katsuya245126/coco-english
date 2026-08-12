-- Personalized pronunciation practice persistence.
--
-- This migration reuses assignments.mission_snapshot for the immutable
-- pronunciation snapshot. It does not rewrite existing mission snapshots or
-- change the existing mission completion RPC.

create type public.assignment_kind as enum ('mission', 'pronunciation');

alter table public.assignments
  add column assignment_kind public.assignment_kind not null default 'mission';

alter table public.assignments
  alter column mission_id drop not null;

alter table public.assignments
  add constraint assignments_assignment_kind_mission_id_check
  check (
    (assignment_kind = 'mission' and mission_id is not null)
    or
    (assignment_kind = 'pronunciation' and mission_id is null)
  );

create table public.pronunciation_word_tries (
  id uuid primary key default gen_random_uuid(),
  attempt_turn_id uuid not null references public.attempt_turns(id) on delete cascade,
  audio_clip_id uuid not null references public.audio_clips(id) on delete cascade,
  try_number smallint not null check (try_number between 1 and 3),
  transcript text not null,
  transcription_evidence jsonb,
  outcome text not null check (
    outcome in ('passed', 'target_weak', 'word_weak', 'different_word')
  ),
  word_accuracy numeric check (word_accuracy between 0 and 100),
  star_band smallint check (star_band in (1, 2, 3)),
  full_word_passed boolean,
  target_sound_accuracy numeric check (target_sound_accuracy between 0 and 100),
  target_sound_passed boolean,
  created_at timestamptz not null default now(),
  unique (attempt_turn_id, try_number),
  unique (audio_clip_id),
  check (
    (
      outcome = 'different_word'
      and word_accuracy is null
      and star_band is null
      and full_word_passed is null
      and target_sound_accuracy is null
      and target_sound_passed is null
    )
    or
    (
      outcome in ('passed', 'target_weak', 'word_weak')
      and word_accuracy is not null
      and star_band is not null
      and full_word_passed is not null
      and target_sound_accuracy is not null
      and target_sound_passed is not null
    )
  )
);

alter table public.pronunciation_word_tries enable row level security;

create policy "teachers manage own pronunciation word tries"
on public.pronunciation_word_tries for all
to authenticated
using (public.is_attempt_turn_owner(attempt_turn_id))
with check (public.is_attempt_turn_owner(attempt_turn_id));

grant select, insert, update, delete
on table public.pronunciation_word_tries
to authenticated;

grant select, insert, update, delete
on table public.pronunciation_word_tries
to service_role;

create index pronunciation_word_tries_attempt_turn_idx
  on public.pronunciation_word_tries (attempt_turn_id, try_number);

create function public.assign_pronunciation_practice(
  p_student_id uuid,
  p_pronunciation_snapshot jsonb,
  p_due_at timestamptz default null
)
returns table (
  out_assignment_id uuid,
  out_assignment_student_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_class_id uuid;
  v_class_data_mode public.data_mode;
  v_assignment_id uuid;
  v_assignment_student_id uuid;
  v_sound_id text;
begin
  v_teacher_id := public.current_teacher_id();

  if v_teacher_id is null then
    raise exception 'Not authorized';
  end if;

  select s.class_id, c.data_mode
  into v_class_id, v_class_data_mode
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = v_teacher_id
  for update of s;

  if not found then
    raise exception 'Not authorized';
  end if;

  if p_pronunciation_snapshot ->> 'kind' <> 'pronunciation'
    or (p_pronunciation_snapshot ->> 'version')::integer <> 1
    or jsonb_typeof(p_pronunciation_snapshot -> 'words') <> 'array'
    or jsonb_array_length(p_pronunciation_snapshot -> 'words') <> 5
  then
    raise exception 'Invalid pronunciation snapshot';
  end if;

  v_sound_id := p_pronunciation_snapshot ->> 'soundId';
  if v_sound_id not in ('light_l', 's', 'f', 'v', 'z') then
    raise exception 'Invalid pronunciation sound';
  end if;

  insert into public.assignments (
    class_id,
    mission_id,
    assignment_kind,
    title,
    mission_snapshot,
    data_mode,
    due_at
  )
  values (
    v_class_id,
    null,
    'pronunciation',
    case v_sound_id
      when 'light_l' then 'Light L Sound Practice'
      when 's' then 'S Sound Practice'
      when 'f' then 'F Sound Practice'
      when 'v' then 'V Sound Practice'
      when 'z' then 'Z Sound Practice'
    end,
    p_pronunciation_snapshot,
    v_class_data_mode,
    p_due_at
  )
  returning id into v_assignment_id;

  insert into public.assignment_students (assignment_id, student_id, status)
  values (v_assignment_id, p_student_id, 'assigned')
  returning id into v_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id,
    previous_status,
    next_status,
    actor_type,
    actor_id,
    reason_code,
    metadata
  )
  values (
    v_assignment_student_id,
    null,
    'assigned',
    'teacher',
    v_teacher_id,
    'pronunciation_practice_assigned',
    jsonb_build_object('assignment_kind', 'pronunciation')
  );

  out_assignment_id := v_assignment_id;
  out_assignment_student_id := v_assignment_student_id;
  return next;
end;
$$;

create function public.start_pronunciation_attempt(
  p_student_id uuid,
  p_assignment_student_id uuid
)
returns table (
  out_attempt_id uuid,
  out_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_status public.assignment_student_status;
  v_assignment_kind public.assignment_kind;
  v_snapshot jsonb;
  v_attempt_id uuid;
begin
  select asg.status, assignment_row.assignment_kind, assignment_row.mission_snapshot
  into v_assignment_status, v_assignment_kind, v_snapshot
  from public.assignment_students asg
  join public.assignments assignment_row
    on assignment_row.id = asg.assignment_id
  where asg.id = p_assignment_student_id
    and asg.student_id = p_student_id
  for update of asg;

  if not found or v_assignment_kind <> 'pronunciation' then
    return;
  end if;

  select attempt.id
  into v_attempt_id
  from public.attempts attempt
  where attempt.assignment_student_id = p_assignment_student_id
    and attempt.status = 'in_progress'
  order by attempt.created_at desc
  limit 1
  for update;

  if found then
    out_attempt_id := v_attempt_id;
    out_created := false;
    return next;
    return;
  end if;

  if v_assignment_status in ('completed', 'teacher_review', 'missed', 'needs_retry') then
    return;
  end if;

  if jsonb_typeof(v_snapshot -> 'words') <> 'array'
    or jsonb_array_length(v_snapshot -> 'words') <> 5
  then
    return;
  end if;

  insert into public.attempts (assignment_student_id, status)
  values (p_assignment_student_id, 'in_progress')
  returning id into v_attempt_id;

  insert into public.attempt_turns (attempt_id, turn_order)
  select v_attempt_id, generate_series(1, 5);

  update public.assignment_students
  set status = 'started',
      attempt_count = attempt_count + 1,
      latest_attempt_id = v_attempt_id
  where id = p_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id,
    previous_status,
    next_status,
    actor_type,
    actor_id,
    reason_code
  )
  values (
    p_assignment_student_id,
    v_assignment_status,
    'started',
    'student_session',
    null,
    'pronunciation_practice_started'
  );

  out_attempt_id := v_attempt_id;
  out_created := true;
  return next;
end;
$$;

create function public.complete_pronunciation_attempt(
  p_student_id uuid,
  p_assignment_student_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_status public.assignment_student_status;
  v_assignment_kind public.assignment_kind;
  v_attempt_status public.attempt_status;
  v_finished_words integer;
  v_now timestamptz := now();
begin
  select asg.status, assignment_row.assignment_kind
  into v_assignment_status, v_assignment_kind
  from public.assignment_students asg
  join public.assignments assignment_row
    on assignment_row.id = asg.assignment_id
  where asg.id = p_assignment_student_id
    and asg.student_id = p_student_id
  for update of asg;

  if not found or v_assignment_kind <> 'pronunciation' then
    return 'not_found';
  end if;

  select attempt.status
  into v_attempt_status
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.assignment_student_id = p_assignment_student_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_assignment_status = 'teacher_review'
    and v_attempt_status = 'teacher_review'
  then
    return 'ok';
  end if;

  if v_assignment_status <> 'started' or v_attempt_status <> 'in_progress' then
    return 'not_found';
  end if;

  select count(*)::integer
  into v_finished_words
  from public.attempt_turns turn_row
  where turn_row.attempt_id = p_attempt_id
    and turn_row.turn_order between 1 and 5
    and exists (
      select 1
      from public.pronunciation_word_tries word_try
      where word_try.attempt_turn_id = turn_row.id
        and (
          word_try.outcome = 'passed'
          or word_try.try_number = 3
        )
    );

  if v_finished_words <> 5 then
    return 'not_complete';
  end if;

  update public.assignment_students
  set status = 'teacher_review',
      submitted_at = v_now,
      latest_attempt_id = p_attempt_id
  where id = p_assignment_student_id;

  update public.attempts
  set status = 'teacher_review',
      completed_at = v_now,
      needs_review_reason = 'pronunciation_practice'
  where id = p_attempt_id;

  insert into public.assignment_status_events (
    assignment_student_id,
    previous_status,
    next_status,
    actor_type,
    actor_id,
    reason_code
  )
  values (
    p_assignment_student_id,
    'started',
    'teacher_review',
    'student_session',
    null,
    'pronunciation_practice_completed'
  );

  return 'ok';
end;
$$;

revoke all on function public.assign_pronunciation_practice(uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.assign_pronunciation_practice(uuid, jsonb, timestamptz)
  to service_role;
grant execute on function public.assign_pronunciation_practice(uuid, jsonb, timestamptz)
  to authenticated;

revoke all on function public.start_pronunciation_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_pronunciation_attempt(uuid, uuid)
  to service_role;

revoke all on function public.complete_pronunciation_attempt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_pronunciation_attempt(uuid, uuid, uuid)
  to service_role;
