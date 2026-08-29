-- Serialize cold TTS generation and fence publication across expired leases.

create table public.tts_audio_generation_claims (
  content_hash text primary key,
  owner_token uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tts_audio_generation_claims enable row level security;

revoke all on table public.tts_audio_generation_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.tts_audio_generation_claims to service_role;

create or replace function public.claim_tts_audio_generation(
  p_content_hash text,
  p_lease_seconds integer
)
returns table (
  acquired boolean,
  owner_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_token uuid := gen_random_uuid();
  v_lease_expires_at timestamptz := now() + make_interval(secs => p_lease_seconds);
begin
  if p_lease_seconds < 1 or p_lease_seconds > 300 then
    return query select false, null::uuid, null::timestamptz;
    return;
  end if;

  -- Serialize the cache check with finalization. Without this lock, a waiter
  -- could observe an empty cache, wait for the old claim to be deleted, then
  -- insert a fresh claim after the winning cache row had committed.
  perform pg_advisory_xact_lock(hashtextextended(p_content_hash, 0));

  if exists (
    select 1
    from public.tts_audio_cache
    where content_hash = p_content_hash
  ) then
    return query select false, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.tts_audio_generation_claims (
    content_hash,
    owner_token,
    lease_expires_at,
    updated_at
  )
  values (
    p_content_hash,
    v_owner_token,
    v_lease_expires_at,
    now()
  )
  on conflict (content_hash) do update
  set owner_token = excluded.owner_token,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = now()
  where public.tts_audio_generation_claims.lease_expires_at <= now()
  returning
    true,
    public.tts_audio_generation_claims.owner_token,
    public.tts_audio_generation_claims.lease_expires_at
  into acquired, owner_token, lease_expires_at;

  if found then
    return next;
  end if;

  return query select false, null::uuid, null::timestamptz;
end;
$$;

create or replace function public.finalize_tts_audio_generation(
  p_content_hash text,
  p_owner_token uuid,
  p_object_key text,
  p_mime_type text,
  p_byte_size integer,
  p_provider text,
  p_model text,
  p_voice text,
  p_response_format text,
  p_character_id text
)
returns table (
  finalized boolean,
  object_key text,
  mime_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_owner_token uuid;
  v_claim_expires_at timestamptz;
  v_existing_object_key text;
  v_existing_mime_type text;
begin
  -- The same per-content lock prevents a new claimant from crossing the
  -- cache-row publication boundary while this owner is finalizing.
  perform pg_advisory_xact_lock(hashtextextended(p_content_hash, 0));

  select owner_token, lease_expires_at
  into v_claim_owner_token, v_claim_expires_at
  from public.tts_audio_generation_claims
  where content_hash = p_content_hash
  for update;

  if not found
     or v_claim_owner_token is distinct from p_owner_token
     or v_claim_expires_at <= now() then
    select c.object_key, c.mime_type
    into v_existing_object_key, v_existing_mime_type
    from public.tts_audio_cache c
    where c.content_hash = p_content_hash;
    return query select false, v_existing_object_key, v_existing_mime_type;
    return;
  end if;

  select c.object_key, c.mime_type
  into v_existing_object_key, v_existing_mime_type
  from public.tts_audio_cache c
  where c.content_hash = p_content_hash;

  if found then
    delete from public.tts_audio_generation_claims
    where content_hash = p_content_hash
      and owner_token = p_owner_token;
    return query select false, v_existing_object_key, v_existing_mime_type;
    return;
  end if;

  insert into public.tts_audio_cache (
    content_hash,
    provider,
    model,
    voice,
    response_format,
    character_id,
    object_key,
    mime_type,
    byte_size
  )
  values (
    p_content_hash,
    p_provider,
    p_model,
    p_voice,
    p_response_format,
    p_character_id,
    p_object_key,
    p_mime_type,
    p_byte_size
  );

  delete from public.tts_audio_generation_claims
  where content_hash = p_content_hash
    and owner_token = p_owner_token;

  return query select true, p_object_key, p_mime_type;
end;
$$;

create or replace function public.release_tts_audio_generation(
  p_content_hash text,
  p_owner_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  delete from public.tts_audio_generation_claims
  where content_hash = p_content_hash
    and owner_token = p_owner_token
  returning true
$$;

revoke all on function public.claim_tts_audio_generation(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_tts_audio_generation(text, integer)
  to service_role;

revoke all on function public.finalize_tts_audio_generation(
  text, uuid, text, text, integer, text, text, text, text, text
)
  from public, anon, authenticated;
grant execute on function public.finalize_tts_audio_generation(
  text, uuid, text, text, integer, text, text, text, text, text
)
  to service_role;

revoke all on function public.release_tts_audio_generation(text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_tts_audio_generation(text, uuid)
  to service_role;
