-- Atomic confirmation for pending teacher-added pronunciation samples.
--
-- A confirmation claim is held only while the server optionally re-runs the
-- provider. The completion RPC is the publication point: wording, result,
-- provenance, and status change in one locked update. The automatic transcript
-- is intentionally never updated by this lifecycle. Claims have no automatic
-- timeout: an abandoned marker requires a separately approved maintainer
-- clear, so a retry can never overlap a provider call from the old request.

alter table public.pronunciation_samples
  add column confirmation_started_at timestamptz,
  add column confirmation_token uuid,
  add column confirmed_by_teacher_id uuid references public.teacher_profiles(id),
  add column confirmed_at timestamptz;

create function public.read_teacher_pronunciation_sample_confirmation(
  p_teacher_id uuid,
  p_sample_id uuid
)
returns table (
  outcome text,
  sample_id uuid,
  student_id uuid,
  object_key text,
  mime_type text,
  duration_ms integer,
  byte_size integer,
  automatic_transcript text,
  provisional_result jsonb,
  audio_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
  v_student_id uuid;
  v_object_key text;
  v_mime_type text;
  v_duration_ms integer;
  v_byte_size integer;
  v_automatic_transcript text;
  v_provisional_result jsonb;
  v_audio_expires_at timestamptz;
  v_created_at timestamptz;
  v_confirmation_started_at timestamptz;
begin
  select
    ps.status,
    ps.student_id,
    ps.object_key,
    ps.mime_type,
    ps.duration_ms,
    ps.byte_size,
    ps.automatic_transcript,
    ps.provisional_result,
    ps.audio_expires_at,
    ps.created_at,
    ps.confirmation_started_at
  into
    v_status,
    v_student_id,
    v_object_key,
    v_mime_type,
    v_duration_ms,
    v_byte_size,
    v_automatic_transcript,
    v_provisional_result,
    v_audio_expires_at,
    v_created_at,
    v_confirmation_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id;

  -- Foreign and missing samples intentionally have the same result so this
  -- RPC cannot disclose another teacher's sample state.
  if not found
    or v_status <> 'pending'
    or nullif(btrim(v_automatic_transcript), '') is null
    or v_provisional_result is null
  then
    return query select
      'not_found', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  -- A stopped request can leave this marker behind. Do not infer that it is
  -- stale: a separately approved maintainer action must clear it.
  if v_confirmation_started_at is not null then
    return query select
      'unavailable', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  return query select
    'ok', p_sample_id, v_student_id, v_object_key, v_mime_type,
    v_duration_ms, v_byte_size, btrim(v_automatic_transcript),
    v_provisional_result, v_audio_expires_at, v_created_at;
end;
$$;

create function public.begin_teacher_pronunciation_sample_confirmation(
  p_teacher_id uuid,
  p_sample_id uuid
)
returns table (
  outcome text,
  sample_id uuid,
  student_id uuid,
  object_key text,
  mime_type text,
  duration_ms integer,
  byte_size integer,
  automatic_transcript text,
  provisional_result jsonb,
  audio_expires_at timestamptz,
  created_at timestamptz,
  confirmation_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
  v_student_id uuid;
  v_object_key text;
  v_mime_type text;
  v_duration_ms integer;
  v_byte_size integer;
  v_automatic_transcript text;
  v_provisional_result jsonb;
  v_audio_expires_at timestamptz;
  v_created_at timestamptz;
  v_confirmation_started_at timestamptz;
  v_confirmation_token uuid;
begin
  select
    ps.status,
    ps.student_id,
    ps.object_key,
    ps.mime_type,
    ps.duration_ms,
    ps.byte_size,
    ps.automatic_transcript,
    ps.provisional_result,
    ps.audio_expires_at,
    ps.created_at,
    ps.confirmation_started_at
  into
    v_status,
    v_student_id,
    v_object_key,
    v_mime_type,
    v_duration_ms,
    v_byte_size,
    v_automatic_transcript,
    v_provisional_result,
    v_audio_expires_at,
    v_created_at,
    v_confirmation_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id
  for update of ps;

  -- Foreign and missing samples intentionally have the same result so this
  -- RPC cannot disclose another teacher's sample state.
  if not found
    or v_status <> 'pending'
    or nullif(btrim(v_automatic_transcript), '') is null
    or v_provisional_result is null
  then
    return query select
      'not_found', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

  -- A stopped request can leave this marker behind. Do not infer that it is
  -- stale: a separately approved maintainer action must clear it.
  if v_confirmation_started_at is not null then
    return query select
      'unavailable', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

  v_confirmation_token := gen_random_uuid();
  update public.pronunciation_samples
  set confirmation_started_at = clock_timestamp(),
      confirmation_token = v_confirmation_token,
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return query select
    'ok', p_sample_id, v_student_id, v_object_key, v_mime_type,
    v_duration_ms, v_byte_size, btrim(v_automatic_transcript),
    v_provisional_result, v_audio_expires_at, v_created_at,
    v_confirmation_token;
end;
$$;

create function public.complete_teacher_pronunciation_sample_confirmation(
  p_teacher_id uuid,
  p_sample_id uuid,
  p_confirmation_token uuid,
  p_teacher_confirmed_text text,
  p_confirmed_result jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
begin
  select ps.status
  into v_status
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
    and ps.confirmation_token = p_confirmation_token
  for update of ps;

  if not found
    or v_status <> 'pending'
    or nullif(btrim(p_teacher_confirmed_text), '') is null
    or p_confirmed_result is null
  then
    return 'not_found';
  end if;

  update public.pronunciation_samples
  set teacher_confirmed_text = btrim(p_teacher_confirmed_text),
      provisional_result = p_confirmed_result,
      confirmed_by_teacher_id = p_teacher_id,
      confirmed_at = clock_timestamp(),
      confirmation_started_at = null,
      confirmation_token = null,
      status = 'confirmed',
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return 'ok';
end;
$$;

create function public.clear_teacher_pronunciation_sample_confirmation(
  p_teacher_id uuid,
  p_sample_id uuid,
  p_confirmation_token uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
begin
  select ps.status
  into v_status
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
    and ps.confirmation_token = p_confirmation_token
  for update of ps;

  if not found or v_status <> 'pending' then
    return 'not_found';
  end if;

  update public.pronunciation_samples
  set confirmation_started_at = null,
      confirmation_token = null,
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return 'ok';
end;
$$;

revoke all on function public.read_teacher_pronunciation_sample_confirmation(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.read_teacher_pronunciation_sample_confirmation(
  uuid, uuid
) to service_role;

revoke all on function public.begin_teacher_pronunciation_sample_confirmation(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.begin_teacher_pronunciation_sample_confirmation(
  uuid, uuid
) to service_role;

revoke all on function public.complete_teacher_pronunciation_sample_confirmation(
  uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_teacher_pronunciation_sample_confirmation(
  uuid, uuid, uuid, text, jsonb
) to service_role;

revoke all on function public.clear_teacher_pronunciation_sample_confirmation(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.clear_teacher_pronunciation_sample_confirmation(
  uuid, uuid, uuid
) to service_role;
