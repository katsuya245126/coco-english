-- Shared storage-first deletion claims for teacher pronunciation samples.
--
-- A claim fences confirmation, listing, profile aggregation, and playback
-- while the service removes the private object. Storage failures leave the
-- claim fenced because the object may have been deleted before the response
-- was lost; a deletion claim older than ten minutes is stale and retryable.
-- The deletion token fences workers that outlive a stale-claim takeover.

alter table public.pronunciation_samples
  add column deletion_started_at timestamptz,
  add column deletion_token uuid,
  add column deletion_kind text,
  add column playback_lease_until timestamptz;

alter table public.pronunciation_samples
  add constraint pronunciation_samples_deletion_kind_check
  check (
    (deletion_started_at is null and deletion_token is null and deletion_kind is null)
    or (
      deletion_started_at is not null
      and deletion_token is not null
      and deletion_kind in ('teacher', 'expiry')
    )
  );

create index pronunciation_samples_expiry_idx
  on public.pronunciation_samples (audio_expires_at)
  where deletion_started_at is null;

create or replace function public.is_pronunciation_sample_owner(
  target_sample_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pronunciation_samples ps
    join public.students s on s.id = ps.student_id
    join public.classes c on c.id = s.class_id
    where ps.id = target_sample_id
      and ps.deletion_started_at is null
      and c.teacher_id = public.current_teacher_id()
  )
$$;

create or replace function public.complete_teacher_pronunciation_sample(
  p_teacher_id uuid,
  p_sample_id uuid,
  p_automatic_transcript text,
  p_transcription_model text,
  p_transcription_confidence jsonb,
  p_provisional_result jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
  v_expires_at timestamptz;
  v_deletion_started_at timestamptz;
begin
  select ps.status, ps.audio_expires_at, ps.deletion_started_at
  into v_status, v_expires_at, v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found or v_status <> 'processing'
    or v_deletion_started_at is not null
    or v_expires_at <= clock_timestamp()
    or nullif(btrim(p_automatic_transcript), '') is null
    or p_provisional_result is null
  then
    return 'not_found';
  end if;

  update public.pronunciation_samples
  set automatic_transcript = btrim(p_automatic_transcript),
      automatic_transcript_model = nullif(btrim(p_transcription_model), ''),
      automatic_transcript_confidence = p_transcription_confidence,
      provisional_result = p_provisional_result,
      status = 'pending',
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return 'ok';
end;
$$;

create or replace function public.clear_teacher_pronunciation_sample(
  p_teacher_id uuid,
  p_sample_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
  v_deletion_started_at timestamptz;
begin
  select ps.status, ps.deletion_started_at
  into v_status, v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found or v_status <> 'processing'
    or v_deletion_started_at is not null
  then
    return 'not_found';
  end if;

  delete from public.pronunciation_samples
  where id = p_sample_id;
  return 'ok';
end;
$$;

create or replace function public.read_teacher_pronunciation_sample_confirmation(
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
  v_deletion_started_at timestamptz;
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
    ps.confirmation_started_at,
    ps.deletion_started_at
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
    v_confirmation_started_at,
    v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id;

  if not found
    or v_status <> 'pending'
    or v_deletion_started_at is not null
    or nullif(btrim(v_automatic_transcript), '') is null
    or v_provisional_result is null
  then
    return query select
      'not_found', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz;
    return;
  end if;

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

create or replace function public.begin_teacher_pronunciation_sample_confirmation(
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
  v_deletion_started_at timestamptz;
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
    ps.confirmation_started_at,
    ps.deletion_started_at
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
    v_confirmation_started_at,
    v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found
    or v_status <> 'pending'
    or v_deletion_started_at is not null
    or nullif(btrim(v_automatic_transcript), '') is null
    or v_provisional_result is null
  then
    return query select
      'not_found', null::uuid, null::uuid, null::text, null::text,
      null::integer, null::integer, null::text, null::jsonb,
      null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

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

create or replace function public.complete_teacher_pronunciation_sample_confirmation(
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
    and ps.deletion_started_at is null
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

create or replace function public.clear_teacher_pronunciation_sample_confirmation(
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
    and ps.deletion_started_at is null
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

create function public.begin_teacher_pronunciation_sample_deletion(
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
  v_playback_lease_until timestamptz;
  v_deletion_token uuid;
begin
  select
    ps.student_id,
    ps.object_key,
    ps.deletion_started_at,
    ps.playback_lease_until
  into
    v_student_id,
    v_object_key,
    v_deletion_started_at,
    v_playback_lease_until
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

  if v_playback_lease_until > clock_timestamp() then
    return query select
      'unavailable', null::uuid, null::uuid, null::text, null::uuid;
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

create function public.begin_teacher_pronunciation_sample_playback(
  p_teacher_id uuid,
  p_sample_id uuid
)
returns table (
  outcome text,
  object_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.pronunciation_sample_status;
  v_object_key text;
  v_audio_expires_at timestamptz;
  v_deletion_started_at timestamptz;
begin
  select
    ps.status,
    ps.object_key,
    ps.audio_expires_at,
    ps.deletion_started_at
  into
    v_status,
    v_object_key,
    v_audio_expires_at,
    v_deletion_started_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found
    or v_status not in ('pending', 'confirmed')
    or v_object_key is null
    or v_audio_expires_at <= clock_timestamp()
    or v_deletion_started_at is not null
  then
    return query select 'not_found', null::text;
    return;
  end if;

  update public.pronunciation_samples
  set playback_lease_until = clock_timestamp() + interval '6 minutes',
      updated_at = clock_timestamp()
  where id = p_sample_id;

  return query select 'ok', v_object_key;
end;
$$;

create function public.claim_expired_teacher_pronunciation_samples(
  p_limit integer
)
returns table (
  teacher_id uuid,
  sample_id uuid,
  object_key text,
  deletion_token uuid,
  deletion_kind text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    return;
  end if;

  return query
  with candidates as (
    select ps.id, c.teacher_id, ps.deletion_kind
    from public.pronunciation_samples ps
    join public.students s on s.id = ps.student_id
    join public.classes c on c.id = s.class_id
    where ps.audio_expires_at <= clock_timestamp()
      and (
        ps.deletion_started_at is null
        or (
          ps.deletion_started_at <= clock_timestamp() - interval '10 minutes'
          and ps.deletion_kind in ('teacher', 'expiry')
        )
      )
      and (ps.playback_lease_until is null or ps.playback_lease_until <= clock_timestamp())
      and (
        ps.deletion_kind = 'teacher'
        or ps.status <> 'confirmed'
        or ps.object_key is not null
      )
    order by ps.audio_expires_at, ps.id
    for update of ps skip locked
    limit p_limit
  ), claimed as (
    update public.pronunciation_samples ps
    set deletion_started_at = clock_timestamp(),
        deletion_token = gen_random_uuid(),
        deletion_kind = case
          when candidates.deletion_kind = 'teacher' then 'teacher'
          else 'expiry'
        end,
        confirmation_started_at = null,
        confirmation_token = null,
        updated_at = clock_timestamp()
    from candidates
    where ps.id = candidates.id
    returning ps.id, ps.object_key, ps.deletion_token, ps.deletion_kind
  )
  select candidates.teacher_id, claimed.id, claimed.object_key,
    claimed.deletion_token, claimed.deletion_kind
  from claimed
  join candidates on candidates.id = claimed.id;
end;
$$;

create function public.finalize_teacher_pronunciation_sample_deletion(
  p_teacher_id uuid,
  p_sample_id uuid,
  p_deletion_token uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample_id uuid;
begin
  select ps.id
  into v_sample_id
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
    and ps.deletion_started_at is not null
    and ps.deletion_kind = 'teacher'
    and ps.deletion_token = p_deletion_token
  for update of ps;

  if not found then
    return 'not_found';
  end if;

  delete from public.pronunciation_samples
  where id = v_sample_id;
  return 'ok';
end;
$$;

create function public.finalize_expired_teacher_pronunciation_sample_deletion(
  p_teacher_id uuid,
  p_sample_id uuid,
  p_deletion_token uuid
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
    and ps.deletion_started_at is not null
    and ps.deletion_kind = 'expiry'
    and ps.deletion_token = p_deletion_token
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status = 'confirmed' then
    update public.pronunciation_samples
    set object_key = null,
        deletion_started_at = null,
        deletion_token = null,
        deletion_kind = null,
        playback_lease_until = null,
        confirmation_started_at = null,
        confirmation_token = null,
        updated_at = clock_timestamp()
    where id = p_sample_id;
  else
    delete from public.pronunciation_samples
    where id = p_sample_id;
  end if;

  return 'ok';
end;
$$;

revoke all on function public.begin_teacher_pronunciation_sample_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_teacher_pronunciation_sample_deletion(uuid, uuid)
  to service_role;

revoke all on function public.claim_expired_teacher_pronunciation_samples(integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_teacher_pronunciation_samples(integer)
  to service_role;

revoke all on function public.finalize_teacher_pronunciation_sample_deletion(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_teacher_pronunciation_sample_deletion(uuid, uuid, uuid)
  to service_role;

revoke all on function public.finalize_expired_teacher_pronunciation_sample_deletion(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_expired_teacher_pronunciation_sample_deletion(uuid, uuid, uuid)
  to service_role;

revoke all on function public.begin_teacher_pronunciation_sample_playback(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_teacher_pronunciation_sample_playback(uuid, uuid)
  to service_role;
