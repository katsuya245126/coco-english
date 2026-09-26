-- Teacher-confirmed no-speech state for retained mission audio.
--
-- This is evidence metadata only. It never changes the automatic transcript,
-- mission evaluation, or assignment/attempt progression. Pronunciation readers
-- exclude marked clips while the stored score and audio remain recoverable.

alter table public.audio_clips
  add column teacher_marked_no_speech boolean not null default false,
  add column teacher_marked_no_speech_by uuid references public.teacher_profiles(id),
  add column teacher_marked_no_speech_at timestamptz;

create function public.mark_teacher_mission_audio_no_speech(
  p_teacher_id uuid,
  p_audio_clip_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_object_key text;
  v_assignment_kind public.assignment_kind;
  v_clip_kind public.audio_clip_kind;
  v_deleted_at timestamptz;
  v_audio_expires_at timestamptz;
  v_processing_status public.audio_processing_status;
  v_clarification_started_at timestamptz;
  v_clarification_token uuid;
  v_reprocessing_started_at timestamptz;
begin
  select
    ac.object_key,
    a.assignment_kind,
    ac.clip_kind,
    ac.deleted_at,
    ac.audio_expires_at,
    ac.processing_status,
    ac.clarification_started_at,
    ac.clarification_token,
    ac.pronunciation_reprocessing_started_at
  into
    v_object_key,
    v_assignment_kind,
    v_clip_kind,
    v_deleted_at,
    v_audio_expires_at,
    v_processing_status,
    v_clarification_started_at,
    v_clarification_token,
    v_reprocessing_started_at
  from public.audio_clips ac
  join public.attempt_turns t on t.id = ac.attempt_turn_id
  join public.attempts at on at.id = t.attempt_id
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ac.id = p_audio_clip_id
    and c.teacher_id = p_teacher_id
  for update of ac;

  if not found then
    return 'unauthorized';
  end if;

  if v_assignment_kind <> 'mission'
    or v_clip_kind not in ('original_answer', 'repeat_attempt')
    or nullif(btrim(v_object_key), '') is null
    or v_deleted_at is not null
    or v_audio_expires_at <= clock_timestamp()
    or v_processing_status not in ('uploaded', 'transcribed', 'failed')
    or (
      v_clarification_token is not null
      and (
        v_clarification_started_at is null
        or v_clarification_started_at > clock_timestamp() - interval '5 minutes'
      )
    )
    or v_reprocessing_started_at is not null
  then
    return 'unavailable';
  end if;

  update public.audio_clips
  set teacher_marked_no_speech = true,
      teacher_marked_no_speech_by = p_teacher_id,
      teacher_marked_no_speech_at = clock_timestamp(),
      teacher_confirmed_text = null,
      teacher_confirmed_by = null,
      teacher_confirmed_at = null,
      clarification_started_at = null,
      clarification_token = null,
      updated_at = clock_timestamp()
  where id = p_audio_clip_id;

  return 'ok';
end;
$$;

-- Failed clips can still have a retained object key and are valid for teacher
-- wording clarification. The existing pronunciation re-score RPC intentionally
-- remains stricter because it is not a no-speech/wording review path.
create or replace function public.begin_teacher_mission_audio_clarification(
  p_teacher_id uuid,
  p_audio_clip_id uuid,
  p_teacher_confirmed_text text
)
returns table (
  outcome text,
  object_key text,
  duration_ms integer,
  clarification_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_object_key text;
  v_assignment_kind public.assignment_kind;
  v_duration_ms integer;
  v_clip_kind public.audio_clip_kind;
  v_deleted_at timestamptz;
  v_audio_expires_at timestamptz;
  v_processing_status public.audio_processing_status;
  v_clarification_started_at timestamptz;
  v_clarification_token uuid;
  v_teacher_confirmed_text text := btrim(p_teacher_confirmed_text);
begin
  select
    ac.object_key,
    a.assignment_kind,
    ac.duration_ms,
    ac.clip_kind,
    ac.deleted_at,
    ac.audio_expires_at,
    ac.processing_status,
    ac.clarification_started_at,
    ac.clarification_token
  into
    v_object_key,
    v_assignment_kind,
    v_duration_ms,
    v_clip_kind,
    v_deleted_at,
    v_audio_expires_at,
    v_processing_status,
    v_clarification_started_at,
    v_clarification_token
  from public.audio_clips ac
  join public.attempt_turns t on t.id = ac.attempt_turn_id
  join public.attempts at on at.id = t.attempt_id
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ac.id = p_audio_clip_id
    and c.teacher_id = p_teacher_id
  for update of ac;

  if not found then
    return query select
      'unauthorized', null::text, null::integer, null::uuid;
    return;
  end if;

  if nullif(v_teacher_confirmed_text, '') is null
    or char_length(v_teacher_confirmed_text) > 500
  then
    return query select
      'invalid_input', null::text, null::integer, null::uuid;
    return;
  end if;

  if (v_clarification_token is not null and (
      v_clarification_started_at is null
      or v_clarification_started_at > clock_timestamp() - interval '5 minutes'
    ))
    or v_assignment_kind <> 'mission'
    or v_clip_kind not in ('original_answer', 'repeat_attempt')
    or nullif(btrim(v_object_key), '') is null
    or v_deleted_at is not null
    or v_audio_expires_at <= clock_timestamp()
    or v_processing_status not in ('uploaded', 'transcribed', 'failed')
    or exists (
      select 1
      from public.audio_clips active_clip
      where active_clip.id = p_audio_clip_id
        and active_clip.pronunciation_reprocessing_started_at is not null
    )
  then
    return query select
      'unavailable', null::text, null::integer, null::uuid;
    return;
  end if;

  v_clarification_token := gen_random_uuid();
  update public.audio_clips ac
  set clarification_started_at = clock_timestamp(),
      clarification_token = v_clarification_token,
      updated_at = clock_timestamp()
  where ac.id = p_audio_clip_id;

  return query select
    'ok', v_object_key, v_duration_ms, v_clarification_token;
end;
$$;

-- Completing wording is the explicit reversal path for a no-speech mark.
create or replace function public.complete_teacher_mission_audio_clarification(
  p_teacher_id uuid,
  p_audio_clip_id uuid,
  p_clarification_token uuid,
  p_teacher_confirmed_text text,
  p_accuracy_score numeric,
  p_fluency_score numeric,
  p_completeness_score numeric,
  p_pronunciation_score numeric,
  p_star_band smallint,
  p_word_scores jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_object_key text;
  v_assignment_kind public.assignment_kind;
  v_clip_kind public.audio_clip_kind;
  v_deleted_at timestamptz;
  v_audio_expires_at timestamptz;
  v_processing_status public.audio_processing_status;
  v_clarification_token uuid;
  v_teacher_confirmed_text text := btrim(p_teacher_confirmed_text);
begin
  select
    ac.object_key,
    a.assignment_kind,
    ac.clip_kind,
    ac.deleted_at,
    ac.audio_expires_at,
    ac.processing_status,
    ac.clarification_token
  into
    v_object_key,
    v_assignment_kind,
    v_clip_kind,
    v_deleted_at,
    v_audio_expires_at,
    v_processing_status,
    v_clarification_token
  from public.audio_clips ac
  join public.attempt_turns t on t.id = ac.attempt_turn_id
  join public.attempts at on at.id = t.attempt_id
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ac.id = p_audio_clip_id
    and c.teacher_id = p_teacher_id
    and ac.clarification_token = p_clarification_token
  for update of ac;

  if not found
    or nullif(v_teacher_confirmed_text, '') is null
    or char_length(v_teacher_confirmed_text) > 500
    or v_assignment_kind <> 'mission'
    or v_clip_kind not in ('original_answer', 'repeat_attempt')
    or nullif(btrim(v_object_key), '') is null
    or v_deleted_at is not null
    or v_audio_expires_at <= clock_timestamp()
    or v_processing_status not in ('uploaded', 'transcribed', 'failed')
  then
    return 'not_found';
  end if;

  insert into public.pronunciation_scores (
    audio_clip_id,
    provider,
    reference_text,
    accuracy_score,
    fluency_score,
    completeness_score,
    pronunciation_score,
    star_band,
    word_scores
  ) values (
    p_audio_clip_id,
    'azure_speech',
    v_teacher_confirmed_text,
    p_accuracy_score,
    p_fluency_score,
    p_completeness_score,
    p_pronunciation_score,
    p_star_band,
    p_word_scores
  ) on conflict (audio_clip_id) do update set
    provider = excluded.provider,
    reference_text = excluded.reference_text,
    accuracy_score = excluded.accuracy_score,
    fluency_score = excluded.fluency_score,
    completeness_score = excluded.completeness_score,
    pronunciation_score = excluded.pronunciation_score,
    star_band = excluded.star_band,
    word_scores = excluded.word_scores,
    scored_at = clock_timestamp();

  update public.audio_clips
  set teacher_confirmed_text = v_teacher_confirmed_text,
      teacher_confirmed_by = p_teacher_id,
      teacher_confirmed_at = clock_timestamp(),
      teacher_marked_no_speech = false,
      teacher_marked_no_speech_by = null,
      teacher_marked_no_speech_at = null,
      clarification_started_at = null,
      clarification_token = null,
      updated_at = clock_timestamp()
  where id = p_audio_clip_id;

  return 'ok';
end;
$$;

revoke all on function public.mark_teacher_mission_audio_no_speech(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_teacher_mission_audio_no_speech(uuid, uuid)
  to service_role;
