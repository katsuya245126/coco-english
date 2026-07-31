create table public.student_unlock_attempts (
  target_digest text not null,
  network_digest text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  primary key (target_digest, network_digest)
);

alter table public.student_unlock_attempts enable row level security;

revoke all on table public.student_unlock_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.student_unlock_attempts to service_role;

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
  v_attempt_count integer;
begin
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
  returning attempt_count into v_attempt_count;

  return v_attempt_count <= 5;
end;
$$;

revoke all on function public.consume_student_unlock_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_student_unlock_attempt(text, text)
  to service_role;

-- ponytail: rows grow per observed student/network pair; add scheduled pruning
-- only if measured table growth becomes material.
