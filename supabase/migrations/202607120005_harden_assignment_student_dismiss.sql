-- Restrict assignment-student keyed dismissal to eligible no-attempt incomplete rows.
-- State predicates are part of the locked query so duplicate calls cannot emit audit events.

create or replace function public.dismiss_assignment_student_by_id(
  p_teacher_id uuid, p_assignment_student_id uuid, p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.status
  into v_status
  from public.assignment_students ast
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ast.id = p_assignment_student_id
    and c.teacher_id = p_teacher_id
    and ast.latest_attempt_id is null
    and ast.status in ('assigned', 'started', 'missed')
    and ast.dismissed_at is null
  for update of ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = v_now,
      dismissed_by = p_teacher_id,
      dismiss_reason = nullif(p_reason, ''),
      updated_at = v_now
  where id = p_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (p_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismissed');

  return 'ok';
end;
$$;

create or replace function public.undo_dismiss_assignment_student_by_id(
  p_teacher_id uuid, p_assignment_student_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.status
  into v_status
  from public.assignment_students ast
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ast.id = p_assignment_student_id
    and c.teacher_id = p_teacher_id
    and ast.latest_attempt_id is null
    and ast.status in ('assigned', 'started', 'missed')
    and ast.dismissed_at is not null
  for update of ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = null, dismissed_by = null, dismiss_reason = null, updated_at = v_now
  where id = p_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (p_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismiss_undone');

  return 'ok';
end;
$$;

create or replace function public.dismiss_assignment_student(
  p_teacher_id uuid, p_attempt_id uuid, p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.id, ast.status
  into v_assignment_student_id, v_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
    and ast.status in ('assigned', 'started', 'missed')
    and ast.dismissed_at is null
  for update of at, ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = v_now,
      dismissed_by = p_teacher_id,
      dismiss_reason = nullif(p_reason, ''),
      updated_at = v_now
  where id = v_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (v_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismissed');

  return 'ok';
end;
$$;

create or replace function public.undo_dismiss_assignment_student(
  p_teacher_id uuid, p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.id, ast.status
  into v_assignment_student_id, v_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
    and ast.status in ('assigned', 'started', 'missed')
    and ast.dismissed_at is not null
  for update of at, ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = null,
      dismissed_by = null,
      dismiss_reason = null,
      updated_at = v_now
  where id = v_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (v_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismiss_undone');

  return 'ok';
end;
$$;

revoke all on function public.dismiss_assignment_student_by_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dismiss_assignment_student_by_id(uuid, uuid, text) to service_role;

revoke all on function public.undo_dismiss_assignment_student_by_id(uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_dismiss_assignment_student_by_id(uuid, uuid) to service_role;

revoke all on function public.dismiss_assignment_student(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dismiss_assignment_student(uuid, uuid, text) to service_role;

revoke all on function public.undo_dismiss_assignment_student(uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_dismiss_assignment_student(uuid, uuid) to service_role;
