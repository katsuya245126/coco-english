-- Repair stranded final teacher-review attempts through the existing atomic
-- completion RPC. Incomplete active work still records only the teacher's
-- receipt and remains active.

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

  if v_assignment_status = 'teacher_review' and v_attempt_status = 'teacher_review' then
    update public.assignment_students
    set status = 'completed', submitted_at = coalesce(submitted_at, v_now), updated_at = v_now
    where id = v_assignment_student_id;

    update public.attempts
    set status = 'completed', completed_at = coalesce(completed_at, v_now), updated_at = v_now
    where id = p_attempt_id;

    insert into public.assignment_status_events (
      assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
    ) values (v_assignment_student_id, 'teacher_review', 'completed', 'teacher', p_teacher_id, 'teacher_review_accepted');
  elsif v_assignment_status = 'completed' and v_attempt_status = 'completed' then
    null;
  elsif v_completion_result is null or v_completion_result = 'not_complete' then
    -- Preserve receipt-only behavior for non-terminal and genuinely unfinished work.
    null;
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
