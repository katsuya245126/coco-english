create table public.request_budgets (
  actor_digest text not null,
  operation text not null check (
    operation in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup'
    )
  ),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (actor_digest, operation)
);

alter table public.request_budgets enable row level security;

revoke all on table public.request_budgets from public, anon, authenticated;
grant select, insert, update, delete on table public.request_budgets
  to service_role;

create or replace function public.consume_request_budget(
  p_actor_digest text,
  p_operation text,
  p_request_limit integer,
  p_window_seconds integer
)
returns table (
  permitted boolean,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if
    p_actor_digest = ''
    or p_operation not in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup'
    )
    or p_request_limit <= 0
    or p_window_seconds <= 0
  then
    raise exception 'invalid request budget input';
  end if;

  insert into public.request_budgets (
    actor_digest,
    operation,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_actor_digest, p_operation, v_now, 1, v_now)
  on conflict (actor_digest, operation) do update
  set
    request_count = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then 1
      -- Saturate at limit + 1 rather than counting denials forever: the
      -- denial test below only needs `> p_request_limit`, and an unbounded
      -- counter would eventually overflow `integer` and lock the actor out.
      -- least() is applied before the increment so the overflowing value is
      -- never evaluated.
      else least(public.request_budgets.request_count, p_request_limit) + 1
    end,
    window_started_at = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then v_now
      else public.request_budgets.window_started_at
    end,
    updated_at = v_now
  returning
    request_budgets.window_started_at,
    request_budgets.request_count
  into v_window_started_at, v_request_count;

  return query
  select
    v_request_count <= p_request_limit,
    case
      when v_request_count <= p_request_limit then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_window_started_at
              + make_interval(secs => p_window_seconds)
              - v_now
            )
          )
        )::integer
      )
    end;
end;
$$;

revoke all on function public.consume_request_budget(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_request_budget(
  text,
  text,
  integer,
  integer
) to service_role;

-- ponytail: one row remains per actor/operation digest; add age-based pruning
-- only if measured table growth becomes material.
