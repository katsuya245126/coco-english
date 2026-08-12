begin;

revoke all privileges
on table public.attempt_turns
from anon, authenticated;

grant select
on table public.attempt_turns
to authenticated;

commit;
