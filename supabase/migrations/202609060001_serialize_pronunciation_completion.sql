-- Serialize pronunciation completion with teacher assignment cancellation.
--
-- The parent assignment lock gives completion and cancellation one ordering:
-- cancellation that commits first makes completion return not_found, while a
-- completion that obtains the lock first may commit before a later cancel.
-- Repeated completion of the same teacher-review pair remains idempotent.

create or replace function public.complete_pronunciation_attempt(
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
  -- Lock the parent before inspecting or mutating the child. A direct
  -- canceled_at update takes this same row lock, so the two commit orders are
  -- serialized without introducing a new cancellation RPC.
  perform 1
  from public.assignment_students as assignment_student
  join public.assignments as assignment_row
    on assignment_row.id = assignment_student.assignment_id
  where assignment_student.id = p_assignment_student_id
    and assignment_student.student_id = p_student_id
    and assignment_row.assignment_kind = 'pronunciation'
    and assignment_row.canceled_at is null
  for update of assignment_row;

  if not found then
    return 'not_found';
  end if;

  select assignment_student.status, assignment_row.assignment_kind
  into v_assignment_status, v_assignment_kind
  from public.assignment_students as assignment_student
  join public.assignments as assignment_row
    on assignment_row.id = assignment_student.assignment_id
  where assignment_student.id = p_assignment_student_id
    and assignment_student.student_id = p_student_id
  for update of assignment_student;

  if not found or v_assignment_kind <> 'pronunciation' then
    return 'not_found';
  end if;

  select attempt.status
  into v_attempt_status
  from public.attempts as attempt
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
  from public.attempt_turns as turn_row
  where turn_row.attempt_id = p_attempt_id
    and turn_row.turn_order between 1 and 5
    and exists (
      select 1
      from public.pronunciation_word_tries as word_try
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

revoke all on function public.complete_pronunciation_attempt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_pronunciation_attempt(uuid, uuid, uuid)
  to service_role;
