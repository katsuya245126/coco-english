-- Reopen teacher-requested pronunciation retries as fresh student attempts.

create or replace function public.start_pronunciation_attempt(
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

  if v_assignment_status in ('completed', 'teacher_review', 'missed') then
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
    case v_assignment_status
      when 'needs_retry' then 'reopened_by_teacher'
      else 'pronunciation_practice_started'
    end
  );

  out_attempt_id := v_attempt_id;
  out_created := true;
  return next;
end;
$$;

revoke all on function public.start_pronunciation_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_pronunciation_attempt(uuid, uuid)
  to service_role;
