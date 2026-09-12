-- Complete teacher evidence using the immutable snapshot for each assignment kind.

create or replace function public.mark_submission_reviewed(p_teacher_id uuid, p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_assignment_status public.assignment_student_status;
  v_attempt_status public.attempt_status;
  v_assignment_kind public.assignment_kind;
  v_snapshot jsonb;
  v_required_turns integer;
  v_answered_turns integer;
  v_required_words integer;
  v_finished_words integer;
  v_now timestamptz := now();
begin
  select ast.id, ast.status, at.status, a.assignment_kind, a.mission_snapshot
  into v_assignment_student_id, v_assignment_status, v_attempt_status,
    v_assignment_kind, v_snapshot
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

  if v_assignment_status = 'completed' and v_attempt_status = 'completed' then
    null;
  elsif (v_assignment_status = 'started' and v_attempt_status = 'in_progress')
    or (v_assignment_status = 'teacher_review' and v_attempt_status = 'teacher_review') then
    if v_assignment_kind = 'mission' then
      if jsonb_typeof(v_snapshot -> 'requiredTurns') is distinct from 'number'
        or v_snapshot ->> 'requiredTurns' !~ '^[0-9]+$'
      then
        return 'not_complete';
      end if;

      if length(v_snapshot ->> 'requiredTurns') > 10 then
        return 'not_complete';
      end if;
      if (v_snapshot ->> 'requiredTurns')::numeric > 2147483647 then
        return 'not_complete';
      end if;

      v_required_turns := (v_snapshot ->> 'requiredTurns')::integer;
      if v_required_turns < 1 then
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
    elsif v_assignment_kind = 'pronunciation' then
      if jsonb_typeof(v_snapshot -> 'requiredWords') is distinct from 'number'
        or v_snapshot ->> 'requiredWords' !~ '^[0-9]+$'
      then
        return 'not_complete';
      end if;

      if length(v_snapshot ->> 'requiredWords') > 10 then
        return 'not_complete';
      end if;
      if (v_snapshot ->> 'requiredWords')::numeric > 2147483647 then
        return 'not_complete';
      end if;

      v_required_words := (v_snapshot ->> 'requiredWords')::integer;
      if v_required_words < 1 then
        return 'not_complete';
      end if;

      select count(*)::integer
      into v_finished_words
      from public.attempt_turns turn_row
      where turn_row.attempt_id = p_attempt_id
        and turn_row.turn_order between 1 and v_required_words
        and exists (
          select 1
          from public.pronunciation_word_tries word_try
          where word_try.attempt_turn_id = turn_row.id
            and (
              word_try.outcome = 'passed'
              or word_try.try_number = 3
            )
        );

      if v_finished_words <> v_required_words then
        return 'not_complete';
      end if;
    else
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
