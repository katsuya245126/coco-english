begin;

revoke insert, update, delete
on table public.attempt_turns
from authenticated;

drop policy "teachers manage own attempt turns"
on public.attempt_turns;

create policy "teachers read own attempt turns"
on public.attempt_turns for select
to authenticated
using (public.is_attempt_owner(attempt_id));

commit;
