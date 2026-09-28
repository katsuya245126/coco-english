-- Public student demo (see TASK.md). Additive and inert outside the demo
-- deployment: nothing here runs unless the app's DEMO_MODE gate calls it.

-- 1. Two new budget operations: per-network demo starts and the class-wide
--    daily cap on paid student calls.
alter table public.request_budgets
  drop constraint request_budgets_operation_check;
alter table public.request_budgets
  add constraint request_budgets_operation_check check (
    operation in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup',
      'demo_start',
      'demo_daily'
    )
  );
create or replace function public.consume_request_budget(
  p_actor_digest text,
  p_operation text,
  p_request_limit integer,
  p_window_seconds integer
)
returns table (
  permitted boolean,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if
    p_actor_digest = ''
    or p_operation not in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup',
      'demo_start',
      'demo_daily'
    )
    or p_request_limit <= 0
    or p_window_seconds <= 0
  then
    raise exception 'invalid request budget input';
  end if;

  insert into public.request_budgets (
    actor_digest,
    operation,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_actor_digest, p_operation, v_now, 1, v_now)
  on conflict (actor_digest, operation) do update
  set
    request_count = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then 1
      -- Saturate at limit + 1 rather than counting denials forever: the
      -- denial test below only needs `> p_request_limit`, and an unbounded
      -- counter would eventually overflow `integer` and lock the actor out.
      -- least() is applied before the increment so the overflowing value is
      -- never evaluated.
      else least(public.request_budgets.request_count, p_request_limit) + 1
    end,
    window_started_at = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then v_now
      else public.request_budgets.window_started_at
    end,
    updated_at = v_now
  returning
    request_budgets.window_started_at,
    request_budgets.request_count
  into v_window_started_at, v_request_count;

  return query
  select
    v_request_count <= p_request_limit,
    case
      when v_request_count <= p_request_limit then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_window_started_at
              + make_interval(secs => p_window_seconds)
              - v_now
            )
          )
        )::integer
      )
    end;
end;
$$;

-- 2. One throwaway demo student with every assignment in the class, in one
--    transaction. No PIN hash, so the student can never be unlocked via PIN.
create function public.create_demo_student(p_class_id uuid)
returns table (student_id uuid, class_name text, display_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_class_name text;
  v_student_id uuid;
  v_display_name text;
begin
  select c.name into v_class_name
  from public.classes c
  where c.id = p_class_id
    and c.archived_at is null;

  if v_class_name is null then
    raise exception 'demo class not found';
  end if;

  v_display_name := 'Guest ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.students (class_id, display_name)
  values (p_class_id, v_display_name)
  returning id into v_student_id;

  with inserted_students as (
    insert into public.assignment_students (assignment_id, student_id, status)
    select a.id, v_student_id, 'assigned'
    from public.assignments a
    where a.class_id = p_class_id
    returning id
  )
  insert into public.assignment_status_events (
    assignment_student_id,
    previous_status,
    next_status,
    actor_type,
    actor_id,
    reason_code,
    metadata
  )
  select id, null, 'assigned', 'system', null, 'demo_student_created', '{}'::jsonb
  from inserted_students;

  return query select v_student_id, v_class_name, v_display_name;
end;
$$;

-- 3. Storage keys of a class's student audio (keys start with the
--    assignment_students id), so the nightly reset can remove the files
--    before the rows cascade away.
create function public.demo_audio_object_keys(p_class_id uuid, p_bucket_id text)
returns table (object_key text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = p_bucket_id
    and split_part(o.name, '/', 1) in (
      select ast.id::text
      from public.assignment_students ast
      join public.students s on s.id = ast.student_id
      where s.class_id = p_class_id
    );
$$;

revoke all on function public.create_demo_student(uuid) from public, anon, authenticated;
grant execute on function public.create_demo_student(uuid) to service_role;
revoke all on function public.demo_audio_object_keys(uuid, text) from public, anon, authenticated;
grant execute on function public.demo_audio_object_keys(uuid, text) to service_role;
