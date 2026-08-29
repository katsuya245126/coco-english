-- Add a target-wide student unlock budget without changing the existing
-- target/network pair table. Both counters are consumed in one RPC call;
-- successful unlocks clear the target and every pair row atomically.

create table public.student_unlock_target_attempts (
  target_digest text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.student_unlock_target_attempts enable row level security;

revoke all on table public.student_unlock_target_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.student_unlock_target_attempts to service_role;

create or replace function public.consume_student_unlock_attempt(
  p_target_digest text,
  p_network_digest text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target_attempt_count integer;
  v_pair_attempt_count integer;
begin
  insert into public.student_unlock_target_attempts (
    target_digest,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_target_digest, now(), 1, now())
  on conflict (target_digest) do update
  set
    attempt_count = case
      when public.student_unlock_target_attempts.window_started_at
        <= now() - interval '10 minutes' then 1
      else public.student_unlock_target_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.student_unlock_target_attempts.window_started_at
        <= now() - interval '10 minutes' then now()
      else public.student_unlock_target_attempts.window_started_at
    end,
    updated_at = now()
  returning attempt_count into v_target_attempt_count;

  insert into public.student_unlock_attempts (
    target_digest,
    network_digest,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_target_digest, p_network_digest, now(), 1, now())
  on conflict (target_digest, network_digest) do update
  set
    attempt_count = case
      when public.student_unlock_attempts.window_started_at
        <= now() - interval '10 minutes' then 1
      else public.student_unlock_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.student_unlock_attempts.window_started_at
        <= now() - interval '10 minutes' then now()
      else public.student_unlock_attempts.window_started_at
    end,
    updated_at = now()
  returning attempt_count into v_pair_attempt_count;

  return v_target_attempt_count <= 10 and v_pair_attempt_count <= 5;
end;
$$;

create or replace function public.clear_student_unlock_attempts(
  p_target_digest text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.student_unlock_attempts
  where target_digest = p_target_digest;

  delete from public.student_unlock_target_attempts
  where target_digest = p_target_digest;
end;
$$;

revoke all on function public.consume_student_unlock_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_student_unlock_attempt(text, text)
  to service_role;

revoke all on function public.clear_student_unlock_attempts(text)
  from public, anon, authenticated;
grant execute on function public.clear_student_unlock_attempts(text)
  to service_role;
