-- Start or resume one assigned homework attempt as a single transaction.
-- Students use the service-role client because their app sessions are not
-- Supabase Auth sessions.

create or replace function public.start_student_attempt(
  p_student_id uuid,
  p_assignment_student_id uuid
)
returns table (
  outcome text,
  attempt_id uuid,
  is_resume boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_status public.assignment_student_status;
  v_latest_attempt_id uuid;
  v_snapshot jsonb;
  v_required_turns integer;
  v_conversation_mode boolean;
  v_attempt_id uuid;
  v_now timestamptz := now();
begin
  -- Lock both ownership hops before validating or changing any state. A
  -- concurrent start therefore observes the first call's active attempt.
  select ast.status, ast.latest_attempt_id, a.mission_snapshot
    into v_assignment_status, v_latest_attempt_id, v_snapshot
    from public.assignment_students as ast
    join public.assignments as a on a.id = ast.assignment_id
   where ast.id = p_assignment_student_id
     and ast.student_id = p_student_id
     and a.canceled_at is null
   for update of ast, a;

  if not found then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  -- Keep the database admission boundary aligned with the complete mission
  -- snapshot shape. The application parser remains the schema source of truth;
  -- these are only the minimum checks needed before this security-definer RPC
  -- trusts service-role input. Parity tests cover the shared fields, while
  -- legacy snapshots fail the required current fields here.
  if jsonb_typeof(v_snapshot) is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'missionId') is distinct from 'string'
    or v_snapshot ->> 'missionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(v_snapshot -> 'title') is distinct from 'string'
    or nullif(btrim(v_snapshot ->> 'title'), '') is null
    or jsonb_typeof(v_snapshot -> 'level') is distinct from 'string'
    or v_snapshot ->> 'level' not in ('beginner', 'elementary', 'intermediate')
    or jsonb_typeof(v_snapshot -> 'turns') is distinct from 'array'
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if jsonb_typeof(v_snapshot -> 'requiredTurns') is distinct from 'number'
    or v_snapshot ->> 'requiredTurns' !~ '^[0-9]+(\.0+)?$'
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if (v_snapshot ->> 'requiredTurns')::numeric < 1
    or (v_snapshot ->> 'requiredTurns')::numeric > 2147483647
    or (v_snapshot ->> 'requiredTurns')::numeric <> trunc((v_snapshot ->> 'requiredTurns')::numeric)
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;
  v_required_turns := (v_snapshot ->> 'requiredTurns')::integer;

  if v_snapshot ? 'characterId'
    and (
      jsonb_typeof(v_snapshot -> 'characterId') is distinct from 'string'
      or nullif(btrim(v_snapshot ->> 'characterId'), '') is null
    )
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if v_snapshot ? 'targetPattern'
    and (
      jsonb_typeof(v_snapshot -> 'targetPattern') is distinct from 'string'
      or nullif(btrim(v_snapshot ->> 'targetPattern'), '') is null
      or length(btrim(v_snapshot ->> 'targetPattern')) > 160
    )
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if v_snapshot ? 'conversationMode'
    and jsonb_typeof(v_snapshot -> 'conversationMode') is distinct from 'boolean'
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if v_snapshot ? 'requireCompleteSentenceAnswers'
    and jsonb_typeof(v_snapshot -> 'requireCompleteSentenceAnswers') is distinct from 'boolean'
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;
  v_conversation_mode := coalesce((v_snapshot ->> 'conversationMode')::boolean, false);

  if v_conversation_mode
    and not (
      v_snapshot ? 'targetPattern'
      and nullif(btrim(v_snapshot ->> 'targetPattern'), '') is not null
    )
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if jsonb_array_length(v_snapshot -> 'turns') < 1
    or (
      not v_conversation_mode
      and jsonb_array_length(v_snapshot -> 'turns') <> v_required_turns
    )
    or exists (
      select 1
        from jsonb_array_elements(v_snapshot -> 'turns') as turn_row(value)
       where jsonb_typeof(turn_row.value) is distinct from 'object'
          or jsonb_typeof(turn_row.value -> 'turnOrder') is distinct from 'number'
          or turn_row.value ->> 'turnOrder' !~ '^[1-9][0-9]*$'
          or jsonb_typeof(turn_row.value -> 'prompt') is distinct from 'string'
          or nullif(btrim(turn_row.value ->> 'prompt'), '') is null
          or jsonb_typeof(turn_row.value -> 'targetExample') is distinct from 'string'
          or nullif(btrim(turn_row.value ->> 'targetExample'), '') is null
          or jsonb_typeof(turn_row.value -> 'hintLadder') is distinct from 'object'
          or jsonb_typeof(turn_row.value -> 'hintLadder' -> 'tier1') is distinct from 'string'
          or nullif(btrim(turn_row.value -> 'hintLadder' ->> 'tier1'), '') is null
          or jsonb_typeof(turn_row.value -> 'hintLadder' -> 'tier2') is distinct from 'string'
          or nullif(btrim(turn_row.value -> 'hintLadder' ->> 'tier2'), '') is null
          or jsonb_typeof(turn_row.value -> 'hintLadder' -> 'tier3') is distinct from 'string'
          or nullif(btrim(turn_row.value -> 'hintLadder' ->> 'tier3'), '') is null
          or (
            turn_row.value ? 'answerShape'
            and (
              jsonb_typeof(turn_row.value -> 'answerShape') is distinct from 'string'
              or turn_row.value ->> 'answerShape' not in ('fixed', 'open')
            )
          )
          or (
            turn_row.value ? 'targetPattern'
            and (
              jsonb_typeof(turn_row.value -> 'targetPattern') is distinct from 'string'
              or nullif(btrim(turn_row.value ->> 'targetPattern'), '') is null
              or length(btrim(turn_row.value ->> 'targetPattern')) > 160
            )
          )
          or (
            not v_conversation_mode
            and not turn_row.value ? 'targetPattern'
            and not (
              v_snapshot ? 'targetPattern'
              and nullif(btrim(v_snapshot ->> 'targetPattern'), '') is not null
            )
          )
    )
  then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if v_conversation_mode and nullif(btrim((v_snapshot -> 'turns' -> 0) ->> 'prompt'), '') is null then
    return query select 'not_found'::text, null::uuid, false;
    return;
  end if;

  if v_assignment_status = 'started' then
    select att.id
      into v_attempt_id
      from public.attempts as att
     where att.id = v_latest_attempt_id
       and att.assignment_student_id = p_assignment_student_id
       and att.status = 'in_progress'
     for update;

    if found then
      return query select 'ok'::text, v_attempt_id, true;
      return;
    end if;

    return query select 'not_assigned_or_started'::text, null::uuid, false;
    return;
  end if;

  if v_assignment_status not in ('assigned', 'missed', 'needs_retry') then
    return query select 'not_assigned_or_started'::text, null::uuid, false;
    return;
  end if;

  insert into public.attempts (assignment_student_id, status)
  values (p_assignment_student_id, 'in_progress')
  returning id into v_attempt_id;

  update public.assignment_students
     set status = 'started',
         latest_attempt_id = v_attempt_id,
         attempt_count = attempt_count + 1,
         updated_at = v_now
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
    v_assignment_status,
    'started',
    'student_session',
    case v_assignment_status
      when 'missed' then 'late_mission_started'
      when 'needs_retry' then 'reopened_by_teacher'
      else 'mission_started'
    end
  );

  return query select 'ok'::text, v_attempt_id, false;
end;
$$;

revoke all on function public.start_student_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_student_attempt(uuid, uuid)
  to service_role;
