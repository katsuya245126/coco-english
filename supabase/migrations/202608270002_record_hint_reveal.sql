-- Record one student hint reveal atomically across the turn and assignment
-- rollups. Students use the service role because they have no Supabase Auth
-- session.

create or replace function public.record_hint_reveal(
  p_student_id uuid,
  p_assignment_student_id uuid,
  p_attempt_id uuid,
  p_turn_order integer,
  p_hint_level integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_attempt_id uuid;
  v_turn_id uuid;
begin
  if p_hint_level is null or p_hint_level < 1 or p_hint_level > 3 then
    return 'invalid_hint_level';
  end if;

  -- Lock the owned active chain before validating or changing either rollup.
  select ast.id, att.id
    into v_assignment_student_id, v_attempt_id
    from public.assignment_students as ast
    join public.assignments as a on a.id = ast.assignment_id
    join public.attempts as att on att.assignment_student_id = ast.id
   where ast.id = p_assignment_student_id
     and ast.student_id = p_student_id
     and ast.status = 'started'
     and a.canceled_at is null
     and att.id = p_attempt_id
     and att.status = 'in_progress'
   for update of ast, a, att;

  if not found then
    return 'not_found';
  end if;

  select t.id
    into v_turn_id
    from public.attempt_turns as t
   where t.attempt_id = v_attempt_id
     and t.turn_order = p_turn_order
   for update;

  if not found then
    return 'no_turn_row';
  end if;

  update public.attempt_turns as t
     set hint_level_used = greatest(coalesce(t.hint_level_used, 0), p_hint_level)
   where t.id = v_turn_id;

  update public.assignment_students as ast
     set highest_hint_level = greatest(coalesce(ast.highest_hint_level, 0), p_hint_level)
   where ast.id = v_assignment_student_id;

  return 'ok';
end;
$$;

revoke all on function public.record_hint_reveal(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_hint_reveal(uuid, uuid, uuid, integer, integer)
  to service_role;
