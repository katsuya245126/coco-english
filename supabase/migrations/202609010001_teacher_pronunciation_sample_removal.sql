-- Allow an owning teacher to remove a sample while its audio is being played.
-- Playback leases continue to protect automatic expiry cleanup below.

create or replace function public.begin_teacher_pronunciation_sample_deletion(
  p_teacher_id uuid,
  p_sample_id uuid
)
returns table (
  outcome text,
  sample_id uuid,
  student_id uuid,
  object_key text,
  deletion_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_object_key text;
  v_deletion_started_at timestamptz;
  v_deletion_token uuid;
begin
  select
    ps.student_id,
    ps.object_key,
    ps.deletion_started_at
  into
    v_student_id,
    v_object_key,
    v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found then
    return query select
      'not_found', null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;

  if v_deletion_started_at > clock_timestamp() - interval '10 minutes' then
    return query select
      'unavailable', null::uuid, null::uuid, null::text, null::uuid;
    return;
  end if;

  v_deletion_token := gen_random_uuid();
  update public.pronunciation_samples
  set deletion_started_at = clock_timestamp(),
      deletion_token = v_deletion_token,
      deletion_kind = 'teacher',
      confirmation_started_at = null,
      confirmation_token = null,
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return query select
    'ok', p_sample_id, v_student_id, v_object_key, v_deletion_token;
end;
$$;

revoke all on function public.begin_teacher_pronunciation_sample_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_teacher_pronunciation_sample_deletion(uuid, uuid)
  to service_role;
