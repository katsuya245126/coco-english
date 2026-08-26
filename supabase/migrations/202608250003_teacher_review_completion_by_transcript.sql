-- Complete teacher-reviewed homework from durable transcript evidence.
-- Student completion remains owned by complete_student_attempt; this teacher
-- action can accept malformed evaluator records only after every required turn
-- has a nonblank original transcript.

create or replace function public.mark_submission_reviewed(p_teacher_id uuid, p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_assignment_student_id uuid;
  v_assignment_status public.assignment_student_status;
  v_attempt_status public.attempt_status;
  v_needs_review_reason text;
  v_required_turns integer;
  v_answered_turns integer;
  v_completion_result text;
  v_now timestamptz := now();
begin
  select ast.student_id, ast.id, ast.status, at.status, at.needs_review_reason
  into v_student_id, v_assignment_student_id, v_assignment_status, v_attempt_status, v_needs_review_reason
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

  if v_assignment_status = 'started'
    and v_attempt_status = 'in_progress'
    and nullif(btrim(v_needs_review_reason), '') is not null then
    v_completion_result := public.complete_student_attempt(
      v_student_id,
      v_assignment_student_id,
      p_attempt_id
    );

    if v_completion_result = 'ok' then
      -- Refresh the rows changed by complete_student_attempt and retain the
      -- latest-attempt/ownership lock before applying teacher acceptance.
      select ast.status, at.status
      into v_assignment_status, v_attempt_status
      from public.attempts at
      join public.assignment_students ast on ast.id = at.assignment_student_id
      join public.assignments a on a.id = ast.assignment_id
      join public.classes c on c.id = a.class_id
      where at.id = p_attempt_id
        and ast.latest_attempt_id = at.id
        and c.teacher_id = p_teacher_id
      for update of at, ast;

      if not found then return 'not_found'; end if;
    elsif v_completion_result <> 'not_complete' then
      return v_completion_result;
    end if;
  end if;

  if v_assignment_status = 'completed' and v_attempt_status = 'completed' then
    null;
  elsif v_assignment_status in ('started', 'teacher_review')
    and v_attempt_status in ('in_progress', 'teacher_review') then
    if (v_assignment_status, v_attempt_status) not in (
      ('started', 'in_progress'),
      ('teacher_review', 'teacher_review')
    ) then
      return 'invalid_status';
    end if;

    if v_assignment_status = 'started'
      and nullif(btrim(v_needs_review_reason), '') is null then
      return 'invalid_status';
    end if;

    select (a.mission_snapshot ->> 'requiredTurns')::integer
    into v_required_turns
    from public.assignments a
    join public.assignment_students ast on ast.assignment_id = a.id
    where ast.id = v_assignment_student_id;

    if v_required_turns is null or v_required_turns < 1 then
      return 'not_complete';
    end if;

    select count(distinct turn_row.turn_order)::integer
    into v_answered_turns
    from public.attempt_turns turn_row
    where turn_row.attempt_id = p_attempt_id
      and turn_row.turn_order between 1 and v_required_turns
      and nullif(btrim(turn_row.original_transcript), '') is not null;

    if v_answered_turns <> v_required_turns then
      return 'not_complete';
    end if;

    update public.assignment_students
    set status = 'completed', submitted_at = coalesce(submitted_at, v_now), updated_at = v_now
    where id = v_assignment_student_id;

    update public.attempts
    set status = 'completed', completed_at = coalesce(completed_at, v_now), updated_at = v_now
    where id = p_attempt_id;

    insert into public.assignment_status_events (
      assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
    ) values (
      v_assignment_student_id,
      v_assignment_status,
      'completed',
      'teacher',
      p_teacher_id,
      'teacher_review_accepted'
    );
  else
    return 'invalid_status';
  end if;

  insert into public.submission_review_receipts (teacher_id, attempt_id, first_viewed_at, reviewed_at)
  values (p_teacher_id, p_attempt_id, v_now, v_now)
  on conflict (teacher_id, attempt_id) do update
  set reviewed_at = excluded.reviewed_at,
      updated_at = excluded.reviewed_at;

  return 'ok';
end;
$$;

revoke all on function public.mark_submission_reviewed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_submission_reviewed(uuid, uuid) to service_role;

-- Let teachers request a retry for a flagged active attempt whose required
-- turns are still incomplete. Unflagged active work remains ineligible.

create or replace function public.request_submission_retry(
  p_teacher_id uuid,
  p_attempt_id uuid,
  p_reason_note text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_assignment_status public.assignment_student_status;
  v_attempt_status public.attempt_status;
  v_needs_review_reason text;
  v_now timestamptz := now();
begin
  select ast.id, ast.status, at.status, at.needs_review_reason
  into v_assignment_student_id, v_assignment_status, v_attempt_status, v_needs_review_reason
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

  if not (
    (v_assignment_status = 'completed' and v_attempt_status = 'completed')
    or (v_assignment_status = 'teacher_review' and v_attempt_status = 'teacher_review')
    or (
      v_assignment_status = 'started'
      and v_attempt_status = 'in_progress'
      and nullif(btrim(v_needs_review_reason), '') is not null
    )
  ) then
    return 'invalid_status';
  end if;

  update public.assignment_students
  set status = 'needs_retry', latest_attempt_id = null, updated_at = v_now
  where id = v_assignment_student_id;

  update public.attempts
  set status = 'needs_retry', updated_at = v_now
  where id = p_attempt_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code, metadata
  ) values (
    v_assignment_student_id,
    v_assignment_status,
    'needs_retry',
    'teacher',
    p_teacher_id,
    'teacher_requested_retry',
    jsonb_build_object('reason_note', p_reason_note)
  );

  return 'ok';
end;
$$;

revoke all on function public.request_submission_retry(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_submission_retry(uuid, uuid, text) to service_role;
