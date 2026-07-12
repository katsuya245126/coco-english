create type public.class_review_policy as enum ('every_submission', 'flagged_only');

alter table public.classes
  add column review_policy public.class_review_policy not null default 'every_submission';

create table public.submission_review_receipts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  first_viewed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, attempt_id)
);

alter table public.submission_review_receipts enable row level security;

create or replace function public.is_submission_review_receipt_owner(target_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempts at
    join public.assignment_students ast on ast.id = at.assignment_student_id
    join public.assignments a on a.id = ast.assignment_id
    join public.classes c on c.id = a.class_id
    where at.id = target_attempt_id
      and c.teacher_id = public.current_teacher_id()
  )
$$;

create policy "teachers select own submission review receipts"
on public.submission_review_receipts for select to authenticated
using (teacher_id = public.current_teacher_id() and public.is_submission_review_receipt_owner(attempt_id));

create policy "teachers insert own submission review receipts"
on public.submission_review_receipts for insert to authenticated
with check (teacher_id = public.current_teacher_id() and public.is_submission_review_receipt_owner(attempt_id));

create policy "teachers update own submission review receipts"
on public.submission_review_receipts for update to authenticated
using (teacher_id = public.current_teacher_id() and public.is_submission_review_receipt_owner(attempt_id))
with check (teacher_id = public.current_teacher_id() and public.is_submission_review_receipt_owner(attempt_id));

grant select, insert, update on table public.submission_review_receipts to authenticated;
grant select, insert, update, delete on table public.submission_review_receipts to service_role;

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
  v_now timestamptz := now();
begin
  select ast.id, ast.status, at.status
  into v_assignment_student_id, v_assignment_status, v_attempt_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

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
  elsif v_assignment_status <> 'completed' or v_attempt_status <> 'completed' then
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

create or replace function public.request_submission_retry(p_teacher_id uuid, p_attempt_id uuid, p_reason_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_assignment_status public.assignment_student_status;
  v_attempt_status public.attempt_status;
  v_now timestamptz := now();
begin
  select ast.id, ast.status, at.status
  into v_assignment_student_id, v_assignment_status, v_attempt_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;
  if v_assignment_status not in ('completed', 'teacher_review')
    or v_attempt_status not in ('completed', 'teacher_review') then
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
  ) values (v_assignment_student_id, v_assignment_status, 'needs_retry', 'teacher', p_teacher_id, 'teacher_requested_retry', jsonb_build_object('reason_note', p_reason_note));

  return 'ok';
end;
$$;

revoke all on function public.mark_submission_reviewed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_submission_reviewed(uuid, uuid) to service_role;
revoke all on function public.request_submission_retry(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_submission_retry(uuid, uuid, text) to service_role;
