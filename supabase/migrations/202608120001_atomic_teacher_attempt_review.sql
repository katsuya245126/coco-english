create function public.mark_submission_viewed(
  p_teacher_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
  v_now timestamptz := now();
begin
  select at.id
  into v_attempt_id
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and c.teacher_id = p_teacher_id
  for update of at;

  if not found then return 'not_found'; end if;

  insert into public.submission_review_receipts (
    teacher_id, attempt_id, first_viewed_at
  ) values (p_teacher_id, v_attempt_id, v_now)
  on conflict (teacher_id, attempt_id) do nothing;

  return 'ok';
end;
$$;

create function public.reopen_submission_review(
  p_teacher_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
begin
  select at.id
  into v_attempt_id
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and c.teacher_id = p_teacher_id
  for update of at;

  if not found then return 'not_found'; end if;

  update public.submission_review_receipts
  set reviewed_at = null
  where teacher_id = p_teacher_id
    and attempt_id = v_attempt_id;

  return 'ok';
end;
$$;

revoke all on function public.mark_submission_viewed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_submission_viewed(uuid, uuid)
  to service_role;

revoke all on function public.reopen_submission_review(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_submission_review(uuid, uuid)
  to service_role;
