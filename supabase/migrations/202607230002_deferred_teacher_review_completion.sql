-- Defer teacher-review terminal state and complete atomically (Task 3).
--
-- Replaces public.complete_student_attempt(uuid, uuid, uuid). Preserves the
-- prior migration's ownership filters, row locks, service-role grant, and
-- required-turn snapshot lookup exactly. Adds: reading the owned attempt's
-- needs_review_reason (set non-terminally by flagAttemptForTeacherReview),
-- counting a persisted teacher-review turn as finished for the required-turn
-- count, and atomically choosing 'teacher_review' vs 'completed' as the
-- terminal status for both assignment_students and attempts plus the single
-- matching assignment_status_events row. The idempotence gate now accepts
-- either terminal outcome as already-done.
--
-- Amended (still unapplied, edited in place): the repeat-turn path had no
-- branch analogous to the original-turn teacher_review branch, so a
-- persisted teacher_review outcome on a repeat turn (requireRepeat: false)
-- never satisfied v_finished_turns and the mission could never reach a
-- terminal status. Added a parallel OR-branch for the repeat-turn case.

create or replace function public.complete_student_attempt(
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
  v_attempt_status public.attempt_status;
  v_required_turns integer;
  v_finished_turns integer;
  v_needs_review_reason text;
  v_terminal_status public.assignment_student_status;
  v_reason_code text;
  v_now timestamptz := now();
begin
  select
    assignment_student.status,
    (assignment_row.mission_snapshot ->> 'requiredTurns')::integer
  into v_assignment_status, v_required_turns
  from public.assignment_students as assignment_student
  join public.assignments as assignment_row
    on assignment_row.id = assignment_student.assignment_id
  where assignment_student.id = p_assignment_student_id
    and assignment_student.student_id = p_student_id
  for update of assignment_student;

  if not found then
    return 'not_found';
  end if;

  if v_required_turns is null or v_required_turns < 1 then
    return 'not_complete';
  end if;

  select attempt.status, attempt.needs_review_reason
  into v_attempt_status, v_needs_review_reason
  from public.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.assignment_student_id = p_assignment_student_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if (
    v_assignment_status = 'completed'
    and v_attempt_status = 'completed'
  ) or (
    v_assignment_status = 'teacher_review'
    and v_attempt_status = 'teacher_review'
  ) then
    return 'ok';
  end if;

  if v_assignment_status <> 'started' or v_attempt_status <> 'in_progress' then
    return 'not_found';
  end if;

  select count(*)::integer
  into v_finished_turns
  from public.attempt_turns as turn_row
  where turn_row.attempt_id = p_attempt_id
    and turn_row.turn_order between 1 and v_required_turns
    and nullif(btrim(turn_row.original_transcript), '') is not null
    and (
      (
        nullif(btrim(turn_row.repeat_transcript), '') is not null
        and turn_row.repeat_accepted is true
      )
      or (
        turn_row.evaluation ->> 'version' = 'ai-eval-v1'
        and turn_row.evaluation ->> 'outcome' = 'accepted_original'
        and turn_row.evaluation ->> 'requireRepeat' = 'false'
      )
      or (
        turn_row.evaluation ->> 'version' = 'ai-eval-v1'
        and turn_row.evaluation ->> 'outcome' = 'teacher_review'
        and turn_row.evaluation ->> 'requireRepeat' = 'false'
      )
      or (
        nullif(btrim(turn_row.repeat_transcript), '') is not null
        and turn_row.evaluation ->> 'version' = 'ai-eval-v1'
        and turn_row.evaluation ->> 'outcome' = 'teacher_review'
        and turn_row.evaluation ->> 'requireRepeat' = 'false'
      )
    );

  if v_finished_turns <> v_required_turns then
    return 'not_complete';
  end if;

  v_terminal_status := case
    when nullif(btrim(v_needs_review_reason), '') is not null
      then 'teacher_review'::public.assignment_student_status
    else 'completed'::public.assignment_student_status
  end;
  v_reason_code := case
    when v_terminal_status = 'teacher_review' then v_needs_review_reason
    else 'mission_completed'
  end;

  update public.assignment_students
  set status = v_terminal_status,
      submitted_at = v_now,
      latest_attempt_id = p_attempt_id
  where id = p_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id,
    previous_status,
    next_status,
    actor_type,
    reason_code
  )
  values (
    p_assignment_student_id,
    'started',
    v_terminal_status,
    case
      when v_terminal_status = 'teacher_review'
        then 'ai_evaluator'::public.status_actor_type
      else 'student_session'::public.status_actor_type
    end,
    v_reason_code
  );

  update public.attempts
  set status = case
        when v_terminal_status = 'teacher_review'
          then 'teacher_review'::public.attempt_status
        else 'completed'::public.attempt_status
      end,
      completed_at = v_now
  where id = p_attempt_id;

  return 'ok';
end;
$$;

revoke all on function public.complete_student_attempt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_student_attempt(uuid, uuid, uuid)
  to service_role;
