begin;

-- The student audio route uses the service role, so a read-then-write guard in
-- application code is not an authorization boundary. This one narrowly scoped
-- RPC is the database boundary for speaking-try operations. It locks the owned
-- assignment/attempt rows before executing the requested child operation; a
-- status or cancellation transition therefore cannot interleave with the
-- protected statement. Child identifiers are checked against the locked
-- attempt inside the same call.
create or replace function public.owned_speaking_try_operation(
  p_student_id uuid,
  p_assignment_student_id uuid,
  p_attempt_id uuid,
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_attempt_id uuid;
  v_attempt_turn_id uuid;
  v_audio_clip_id uuid;
  v_value jsonb;
  v_count bigint;
  v_expected_object_key text;
  v_extension text;
  v_clip_kind audio_clip_kind;
  v_turn_order integer;
begin
  -- Lock every mutable ownership hop. The protected operation below is the
  -- linearization point for this RPC, so a concurrent status/cancellation
  -- transition either wins before this check or waits until it completes.
  select asg.id, att.id
    into v_assignment_student_id, v_attempt_id
    from assignment_students asg
    join assignments a on a.id = asg.assignment_id
    join attempts att on att.assignment_student_id = asg.id
   where asg.id = p_assignment_student_id
     and asg.student_id = p_student_id
     and asg.status = 'started'
     and a.canceled_at is null
     and att.id = p_attempt_id
     and att.status = 'in_progress'
   for update of asg, a, att;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  case p_operation
    when 'load_conversation_turns' then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'turn_order', t.turn_order,
            'original_transcript', t.original_transcript,
            'improved_sentence', t.improved_sentence,
            'coco_line', t.coco_line,
            'evaluation', t.evaluation
          ) order by t.turn_order
        ),
        '[]'::jsonb
      )
        into v_value
        from attempt_turns t
       where t.attempt_id = v_attempt_id
         and t.turn_order < (p_payload->>'turn_order')::integer;

    when 'initialize_turn' then
      insert into attempt_turns (attempt_id, turn_order)
      values (v_attempt_id, (p_payload->>'turn_order')::integer)
      on conflict (attempt_id, turn_order) do update
        set attempt_id = excluded.attempt_id
      returning jsonb_build_object(
        'id', id,
        'original_transcript', original_transcript,
        'improved_sentence', improved_sentence,
        'evaluation', evaluation,
        'coco_line', coco_line
      ) into v_value;

    when 'insert_audio_clip' then
      v_attempt_turn_id := (p_payload->>'attempt_turn_id')::uuid;
      if not exists (
        select 1 from attempt_turns t
         where t.id = v_attempt_turn_id
           and t.attempt_id = v_attempt_id
      ) then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

      insert into audio_clips (
        attempt_turn_id,
        clip_kind,
        processing_status
      ) values (
        v_attempt_turn_id,
        (p_payload->>'clip_kind')::audio_clip_kind,
        'pending_upload'
      )
      returning jsonb_build_object('id', id) into v_value;

    when 'authorize_storage_upload' then
      v_attempt_turn_id := (p_payload->>'attempt_turn_id')::uuid;
      v_audio_clip_id := (p_payload->>'audio_clip_id')::uuid;

      select ac.id, ac.clip_kind, t.turn_order
        into v_audio_clip_id, v_clip_kind, v_turn_order
        from audio_clips ac
        join attempt_turns t on t.id = ac.attempt_turn_id
       where ac.id = v_audio_clip_id
         and ac.attempt_turn_id = v_attempt_turn_id
         and t.attempt_id = v_attempt_id
         and t.turn_order = (p_payload->>'turn_order')::integer
         and ac.clip_kind = (p_payload->>'clip_kind')::audio_clip_kind;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

      v_extension := case lower(split_part(p_payload->>'mime_type', ';', 1))
        when 'audio/mp4' then 'm4a'
        when 'audio/m4a' then 'm4a'
        when 'audio/mpeg' then 'mp3'
        when 'audio/wav' then 'wav'
        when 'audio/wave' then 'wav'
        else 'webm'
      end;
      v_expected_object_key := concat(
        p_assignment_student_id::text,
        '/',
        p_attempt_id::text,
        '/',
        v_turn_order::text,
        '/',
        v_clip_kind::text,
        '-',
        v_audio_clip_id::text,
        '.',
        v_extension
      );
      v_value := jsonb_build_object('object_key', v_expected_object_key);

    when 'update_clip' then
      v_attempt_turn_id := (p_payload->>'attempt_turn_id')::uuid;
      v_audio_clip_id := (p_payload->>'audio_clip_id')::uuid;
      select ac.clip_kind, t.turn_order
        into v_clip_kind, v_turn_order
        from audio_clips ac
        join attempt_turns t on t.id = ac.attempt_turn_id
       where ac.id = v_audio_clip_id
         and ac.attempt_turn_id = v_attempt_turn_id
         and t.attempt_id = v_attempt_id;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;
      if p_payload ? 'object_key' then
        v_extension := case lower(split_part(p_payload->>'mime_type', ';', 1))
          when 'audio/mp4' then 'm4a'
          when 'audio/m4a' then 'm4a'
          when 'audio/mpeg' then 'mp3'
          when 'audio/wav' then 'wav'
          when 'audio/wave' then 'wav'
          else 'webm'
        end;
        v_expected_object_key := concat(
          p_assignment_student_id::text,
          '/',
          p_attempt_id::text,
          '/',
          v_turn_order::text,
          '/',
          v_clip_kind::text,
          '-',
          v_audio_clip_id::text,
          '.',
          v_extension
        );
        if p_payload->>'object_key' is distinct from v_expected_object_key then
          return jsonb_build_object('ok', false, 'error', 'not_found');
        end if;
      end if;
      update audio_clips ac
         set object_key = case
               when p_payload ? 'object_key' then p_payload->>'object_key'
               else ac.object_key
             end,
             mime_type = p_payload->>'mime_type',
             duration_ms = (p_payload->>'duration_ms')::integer,
             byte_size = (p_payload->>'byte_size')::integer,
             processing_status = (p_payload->>'processing_status')::audio_processing_status
       where ac.id = v_audio_clip_id
         and ac.attempt_turn_id = v_attempt_turn_id
         and exists (
           select 1 from attempt_turns t
            where t.id = ac.attempt_turn_id
              and t.attempt_id = v_attempt_id
         )
       returning jsonb_build_object('error', null) into v_value;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

    when 'count_transcribed_repeat_clips' then
      v_attempt_turn_id := (p_payload->>'attempt_turn_id')::uuid;
      if not exists (
        select 1 from attempt_turns t
         where t.id = v_attempt_turn_id
           and t.attempt_id = v_attempt_id
      ) then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;
      select count(*)
        into v_count
        from audio_clips ac
       where ac.attempt_turn_id = v_attempt_turn_id
         and ac.clip_kind = 'repeat_attempt'
         and ac.processing_status = 'transcribed';
      v_value := jsonb_build_object('count', v_count);

    when 'write_guard_evaluation' then
      insert into attempt_turns (
        attempt_id,
        turn_order,
        original_transcript,
        target_attempted,
        improved_sentence,
        evaluation,
        reply_hint_frame
      ) values (
        v_attempt_id,
        (p_payload->>'turn_order')::integer,
        p_payload->>'transcript',
        false,
        null,
        p_payload->'evaluation',
        p_payload->>'reply_hint_frame'
      )
      on conflict (attempt_id, turn_order) do update
        set original_transcript = excluded.original_transcript,
            target_attempted = excluded.target_attempted,
            improved_sentence = excluded.improved_sentence,
            evaluation = excluded.evaluation,
            reply_hint_frame = excluded.reply_hint_frame
      returning jsonb_build_object('error', null) into v_value;

    when 'write_original_turn' then
      insert into attempt_turns (
        attempt_id,
        turn_order,
        original_transcript,
        target_attempted,
        improved_sentence,
        evaluation,
        reply_hint_frame
      ) values (
        v_attempt_id,
        (p_payload->>'turn_order')::integer,
        p_payload->>'transcript',
        (p_payload->>'target_attempted')::boolean,
        p_payload->>'improved_sentence',
        coalesce(p_payload->'evaluation', '{}'::jsonb),
        p_payload->>'reply_hint_frame'
      )
      on conflict (attempt_id, turn_order) do update
        set original_transcript = excluded.original_transcript,
            target_attempted = excluded.target_attempted,
            improved_sentence = excluded.improved_sentence,
            evaluation = case
              when p_payload ? 'evaluation' then excluded.evaluation
              else attempt_turns.evaluation
            end,
            reply_hint_frame = excluded.reply_hint_frame
      returning jsonb_build_object('error', null) into v_value;

    when 'write_repeat_turn' then
      v_attempt_turn_id := (p_payload->>'turn_id')::uuid;
      update attempt_turns t
         set repeat_transcript = p_payload->>'transcript',
             repeat_accepted = (p_payload->>'repeat_accepted')::boolean,
             evaluation = p_payload->'evaluation'
       where t.id = v_attempt_turn_id
         and t.attempt_id = v_attempt_id
       returning jsonb_build_object('error', null) into v_value;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

    when 'route_teacher_review' then
      update attempts att
         set needs_review_reason = p_payload->>'review_reason'
       where att.id = v_attempt_id
         and att.assignment_student_id = v_assignment_student_id
         and att.status = 'in_progress'
       returning jsonb_build_object('error', null) into v_value;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

    when 'record_coco_line' then
      insert into attempt_turns (
        attempt_id,
        turn_order,
        coco_line,
        moderation_event,
        evaluation
      ) values (
        v_attempt_id,
        (p_payload->>'turn_order')::integer,
        p_payload->>'coco_line',
        p_payload->'moderation_event',
        coalesce(p_payload->'evaluation', '{}'::jsonb)
      )
      on conflict (attempt_id, turn_order) do update
        set coco_line = excluded.coco_line,
            moderation_event = excluded.moderation_event,
            evaluation = case
              when p_payload ? 'evaluation' then excluded.evaluation
              else attempt_turns.evaluation
            end
      returning jsonb_build_object('error', null) into v_value;

    when 'write_pronunciation_score' then
      v_attempt_turn_id := (p_payload->>'attempt_turn_id')::uuid;
      v_audio_clip_id := (p_payload->>'audio_clip_id')::uuid;
      if not exists (
        select 1
          from audio_clips ac
          join attempt_turns t on t.id = ac.attempt_turn_id
         where ac.id = v_audio_clip_id
           and ac.attempt_turn_id = v_attempt_turn_id
           and t.attempt_id = v_attempt_id
      ) then
        return jsonb_build_object('ok', false, 'error', 'not_found');
      end if;

      insert into pronunciation_scores (
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
        v_audio_clip_id,
        'azure_speech',
        p_payload->>'reference_text',
        (p_payload->>'accuracy_score')::numeric,
        (p_payload->>'fluency_score')::numeric,
        (p_payload->>'completeness_score')::numeric,
        (p_payload->>'pronunciation_score')::numeric,
        (p_payload->>'star_band')::smallint,
        p_payload->'word_scores'
      )
      on conflict (audio_clip_id) do update
        set provider = excluded.provider,
            reference_text = excluded.reference_text,
            accuracy_score = excluded.accuracy_score,
            fluency_score = excluded.fluency_score,
            completeness_score = excluded.completeness_score,
            pronunciation_score = excluded.pronunciation_score,
            star_band = excluded.star_band,
            word_scores = excluded.word_scores
      returning jsonb_build_object('error', null) into v_value;

    else
      return jsonb_build_object('ok', false, 'error', 'db_error');
  end case;

  return jsonb_build_object('ok', true, 'value', coalesce(v_value, '{}'::jsonb));
exception
  when others then
    return jsonb_build_object('ok', false, 'error', 'db_error');
end;
$$;

revoke execute on function public.owned_speaking_try_operation(uuid, uuid, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.owned_speaking_try_operation(uuid, uuid, uuid, text, jsonb)
to service_role;

commit;
