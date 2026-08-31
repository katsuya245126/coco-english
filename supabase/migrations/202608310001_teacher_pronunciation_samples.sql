-- Pending teacher-added pronunciation samples.
--
-- Samples are deliberately separate from mission assignments, attempts, and
-- speaking tries. Raw audio stays in the existing private student-audio
-- bucket; only the service-role RPCs below may publish or clear a sample.

create type public.pronunciation_sample_status as enum (
  'processing',
  'pending',
  'confirmed'
);

create table public.pronunciation_samples (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  object_key text,
  mime_type text,
  duration_ms integer not null check (duration_ms >= 0),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  status public.pronunciation_sample_status not null default 'processing',
  automatic_transcript text,
  automatic_transcript_model text,
  automatic_transcript_confidence jsonb,
  provisional_result jsonb,
  teacher_confirmed_text text,
  audio_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    duration_ms <= 30000
  ),
  check (
    mime_type is null
    or mime_type in (
      'audio/webm',
      'audio/mp4',
      'audio/m4a',
      'audio/mpeg',
      'audio/wav',
      'audio/wave'
    )
  ),
  check (
    status = 'processing'
    or nullif(btrim(automatic_transcript), '') is not null
  )
);

create index pronunciation_samples_student_status_idx
  on public.pronunciation_samples (student_id, status, created_at desc);

alter table public.pronunciation_samples enable row level security;

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
      and c.teacher_id = public.current_teacher_id()
  )
$$;

create policy "teachers read own pronunciation samples"
on public.pronunciation_samples for select
to authenticated
using (public.is_pronunciation_sample_owner(id));

grant usage on schema public to authenticated;
grant select on table public.pronunciation_samples to authenticated;
revoke insert, update, delete on table public.pronunciation_samples from authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.pronunciation_samples to service_role;

create function public.begin_teacher_pronunciation_sample(
  p_teacher_id uuid,
  p_student_id uuid,
  p_mime_type text,
  p_duration_ms integer,
  p_byte_size integer
)
returns table (
  outcome text,
  sample_id uuid,
  object_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_sample_id uuid;
  v_mime_type text := lower(btrim(p_mime_type));
  v_extension text;
begin
  select s.class_id
  into v_class_id
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id
    and s.archived_at is null
    and c.archived_at is null
    and c.teacher_id = p_teacher_id
  for update of s;

  if not found then
    return query select 'unauthorized', null::uuid, null::text;
    return;
  end if;

  if v_mime_type not in (
    'audio/webm',
    'audio/mp4',
    'audio/m4a',
    'audio/mpeg',
    'audio/wav',
    'audio/wave'
  )
    or p_duration_ms is null
    or p_duration_ms < 0
    or p_duration_ms > 30000
    or p_byte_size is null
    or p_byte_size <= 0
    or p_byte_size > 5242880
  then
    return query select 'invalid_input', null::uuid, null::text;
    return;
  end if;

  v_extension := case v_mime_type
    when 'audio/webm' then 'webm'
    when 'audio/mp4' then 'm4a'
    when 'audio/m4a' then 'm4a'
    when 'audio/mpeg' then 'mp3'
    when 'audio/wav' then 'wav'
    when 'audio/wave' then 'wav'
  end;

  insert into public.pronunciation_samples (
    student_id,
    object_key,
    mime_type,
    duration_ms,
    byte_size,
    status
  )
  values (
    p_student_id,
    null,
    v_mime_type,
    p_duration_ms,
    p_byte_size,
    'processing'
  )
  returning id into v_sample_id;

  update public.pronunciation_samples
  set object_key = format(
    'pronunciation-samples/%s/%s.%s',
    p_student_id,
    v_sample_id,
    v_extension
  ),
  updated_at = clock_timestamp()
  where id = v_sample_id;

  return query
  select 'ok', v_sample_id, ps.object_key
  from public.pronunciation_samples ps
  where ps.id = v_sample_id;
end;
$$;

create function public.complete_teacher_pronunciation_sample(
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
begin
  select ps.status, ps.audio_expires_at
  into v_status, v_expires_at
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found or v_status <> 'processing' or v_expires_at <= clock_timestamp()
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

create function public.clear_teacher_pronunciation_sample(
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
begin
  select ps.status
  into v_status
  from public.pronunciation_samples ps
  join public.students s on s.id = ps.student_id
  join public.classes c on c.id = s.class_id
  where ps.id = p_sample_id
    and c.teacher_id = p_teacher_id
  for update of ps;

  if not found or v_status <> 'processing' then
    return 'not_found';
  end if;

  delete from public.pronunciation_samples
  where id = p_sample_id;
  return 'ok';
end;
$$;

revoke all on function public.begin_teacher_pronunciation_sample(
  uuid, uuid, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.begin_teacher_pronunciation_sample(
  uuid, uuid, text, integer, integer
) to service_role;

revoke all on function public.complete_teacher_pronunciation_sample(
  uuid, uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_teacher_pronunciation_sample(
  uuid, uuid, text, text, jsonb, jsonb
) to service_role;

revoke all on function public.clear_teacher_pronunciation_sample(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.clear_teacher_pronunciation_sample(
  uuid, uuid
) to service_role;
