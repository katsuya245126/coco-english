-- Phase 3 (gap fix): resolve "column reference \"assignment_id\" is ambiguous".
--
-- The previous definition of public.assign_mission_to_class declared a
-- RETURNS TABLE OUT column named `assignment_id`, which collides with the
-- `assignment_id` column on public.assignment_students (and
-- public.assignment_status_events) referenced inside the CTEs. Postgres then
-- raised "column reference \"assignment_id\" is ambiguous" at runtime, which the
-- app layer swallowed and surfaced as a misleading mission-save error.
--
-- Fix: rename the OUT columns with an `out_` prefix so no OUT parameter can
-- collide with a table column, and assign them explicitly before returning.

-- Renaming the RETURNS TABLE OUT columns changes the function's return type,
-- which `create or replace` cannot do (SQLSTATE 42P13). Drop the old definition
-- first, then recreate with the corrected signature.
drop function if exists public.assign_mission_to_class(uuid, uuid, jsonb, timestamptz);

create function public.assign_mission_to_class(
  p_class_id uuid,
  p_mission_id uuid,
  p_mission_snapshot jsonb,
  p_due_at timestamptz default null
)
returns table (
  out_assignment_id uuid,
  out_active_student_count integer,
  out_class_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_assignment_id uuid;
  v_class_name text;
  v_data_mode public.data_mode;
  v_title text;
  v_active_student_count integer;
begin
  v_teacher_id := public.current_teacher_id();

  if v_teacher_id is null then
    raise exception 'Not authorized';
  end if;

  select c.name, c.data_mode
  into v_class_name, v_data_mode
  from public.classes c
  where c.id = p_class_id
    and c.teacher_id = v_teacher_id
    and c.archived_at is null;

  if v_class_name is null then
    raise exception 'Not authorized';
  end if;

  select m.title
  into v_title
  from public.missions m
  where m.id = p_mission_id
    and m.teacher_id = v_teacher_id;

  if v_title is null then
    raise exception 'Not authorized';
  end if;

  insert into public.assignments (
    class_id,
    mission_id,
    title,
    mission_snapshot,
    data_mode,
    due_at
  )
  values (
    p_class_id,
    p_mission_id,
    v_title,
    p_mission_snapshot,
    v_data_mode,
    p_due_at
  )
  returning id into v_assignment_id;

  with inserted_students as (
    insert into public.assignment_students (assignment_id, student_id, status)
    select v_assignment_id, s.id, 'assigned'
    from public.students s
    where s.class_id = p_class_id
      and s.archived_at is null
    on conflict (assignment_id, student_id) do nothing
    returning id
  ),
  inserted_events as (
    insert into public.assignment_status_events (
      assignment_student_id,
      previous_status,
      next_status,
      actor_type,
      actor_id,
      reason_code,
      metadata
    )
    select
      id,
      null,
      'assigned',
      'system',
      null,
      'assignment_created',
      jsonb_build_object('assignment_id', v_assignment_id)
    from inserted_students
    returning id
  )
  select count(*)::integer
  into v_active_student_count
  from inserted_students;

  out_assignment_id := v_assignment_id;
  out_active_student_count := v_active_student_count;
  out_class_name := v_class_name;
  return next;
end;
$$;

grant execute on function public.assign_mission_to_class(uuid, uuid, jsonb, timestamptz) to authenticated;
