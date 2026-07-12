-- Allow a teacher to Mark reviewed on ANY latest attempt they own, not only
-- completed / teacher_review ones.
--
-- Motivation: from the Incomplete queue a teacher can open a started-but-not-
-- finished attempt and choose to close it out ("Mark reviewed"). The original
-- mark_submission_reviewed RPC (202607120001) rejected any status other than
-- completed / teacher_review with 'invalid_status', which surfaced to the
-- teacher as "Could not update this submission."
--
-- New behavior:
--   * teacher_review + teacher_review  -> promote to completed + audit event
--     (unchanged: accepting a flagged submission still transitions status).
--   * any other owned latest attempt    -> record the review receipt only.
--     Marking reviewed is a teacher-side receipt; it does not fabricate a
--     completion status transition for work the student never finished. The
--     row simply leaves the review/incomplete queues because a reviewed_at
--     receipt now exists.
--
-- Ownership, latest-attempt, and locking semantics are unchanged.

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

  -- Accepting a flagged (teacher_review) submission still promotes it to
  -- completed and records the audited status transition.
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
  end if;
  -- For every other status (assigned / started / missed / completed / needs_retry)
  -- we no longer reject; we just record the reviewed receipt below.

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
