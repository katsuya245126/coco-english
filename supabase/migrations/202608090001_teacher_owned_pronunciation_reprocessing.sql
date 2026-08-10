alter table public.audio_clips
  add column pronunciation_reprocessing_started_at timestamptz;

revoke insert, update, delete on table public.audio_clips from authenticated;
grant select on table public.audio_clips to authenticated;

create function public.begin_pronunciation_reprocessing(
  p_teacher_id uuid,
  p_audio_clip_id uuid
)
returns table (
  outcome text,
  object_key text,
  duration_ms integer,
  reference_text text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_object_key text;
  v_duration_ms integer;
  v_reference_text text;
  v_started_at timestamptz;
  v_deleted_at timestamptz;
  v_processing_status public.audio_processing_status;
begin
  select
    ac.object_key,
    ac.duration_ms,
    ac.pronunciation_reprocessing_started_at,
    ac.deleted_at,
    ac.processing_status,
    case ac.clip_kind
      when 'original_answer' then btrim(t.original_transcript)
      else coalesce(nullif(btrim(t.improved_sentence), ''), btrim(t.repeat_transcript))
    end
  into v_object_key, v_duration_ms, v_started_at, v_deleted_at,
    v_processing_status, v_reference_text
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
    return query select 'unauthorized', null::text, null::integer, null::text;
    return;
  end if;

  if exists (
    select 1 from public.pronunciation_scores ps where ps.audio_clip_id = p_audio_clip_id
  ) then
    return query select 'already_scored', null::text, null::integer, null::text;
    return;
  end if;

  if v_started_at is not null
    or v_object_key is null
    or v_deleted_at is not null
    or v_processing_status in ('deleted', 'failed')
    or coalesce(v_reference_text, '') = '' then
    return query select 'unavailable', null::text, null::integer, null::text;
    return;
  end if;

  update public.audio_clips
  set pronunciation_reprocessing_started_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_audio_clip_id
    and pronunciation_reprocessing_started_at is null;

  return query select 'ok', v_object_key, v_duration_ms, v_reference_text;
end;
$$;

create function public.complete_pronunciation_reprocessing(
  p_teacher_id uuid,
  p_audio_clip_id uuid,
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
  v_reference_text text;
  v_started_at timestamptz;
  v_inserted integer;
begin
  select
    ac.pronunciation_reprocessing_started_at,
    case ac.clip_kind
      when 'original_answer' then btrim(t.original_transcript)
      else coalesce(nullif(btrim(t.improved_sentence), ''), btrim(t.repeat_transcript))
    end
  into v_started_at, v_reference_text
  from public.audio_clips ac
  join public.attempt_turns t on t.id = ac.attempt_turn_id
  join public.attempts at on at.id = t.attempt_id
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ac.id = p_audio_clip_id
    and c.teacher_id = p_teacher_id
  for update of ac;

  if not found or v_started_at is null then return 'not_found'; end if;

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
    v_reference_text,
    p_accuracy_score,
    p_fluency_score,
    p_completeness_score,
    p_pronunciation_score,
    p_star_band,
    p_word_scores
  ) on conflict (audio_clip_id) do nothing;
  get diagnostics v_inserted = row_count;

  update public.audio_clips
  set pronunciation_reprocessing_started_at = null,
      updated_at = clock_timestamp()
  where id = p_audio_clip_id;

  if v_inserted = 0 then return 'already_scored'; end if;
  return 'ok';
end;
$$;

create function public.clear_pronunciation_reprocessing(
  p_teacher_id uuid,
  p_audio_clip_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip_id uuid;
begin
  select ac.id
  into v_clip_id
  from public.audio_clips ac
  join public.attempt_turns t on t.id = ac.attempt_turn_id
  join public.attempts at on at.id = t.attempt_id
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ac.id = p_audio_clip_id
    and c.teacher_id = p_teacher_id
  for update of ac;

  if not found then return 'not_found'; end if;

  update public.audio_clips
  set pronunciation_reprocessing_started_at = null,
      updated_at = clock_timestamp()
  where id = v_clip_id;
  return 'ok';
end;
$$;

revoke all on function public.begin_pronunciation_reprocessing(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_pronunciation_reprocessing(uuid, uuid)
  to service_role;

revoke all on function public.complete_pronunciation_reprocessing(
  uuid, uuid, numeric, numeric, numeric, numeric, smallint, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_pronunciation_reprocessing(
  uuid, uuid, numeric, numeric, numeric, numeric, smallint, jsonb
) to service_role;

revoke all on function public.clear_pronunciation_reprocessing(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.clear_pronunciation_reprocessing(uuid, uuid)
  to service_role;
