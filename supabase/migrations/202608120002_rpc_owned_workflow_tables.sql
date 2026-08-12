begin;

revoke insert, update, delete
on table public.assignment_students
from authenticated;

revoke insert, update, delete
on table public.attempts
from authenticated;

revoke insert
on table public.assignment_status_events
from authenticated;

revoke insert, update
on table public.submission_review_receipts
from authenticated;

drop policy "teachers manage own assignment students"
on public.assignment_students;

create policy "teachers read own assignment students"
on public.assignment_students for select
to authenticated
using (public.is_assignment_owner(assignment_id));

drop policy "teachers manage own attempts"
on public.attempts;

create policy "teachers read own attempts"
on public.attempts for select
to authenticated
using (public.is_assignment_student_owner(assignment_student_id));

drop policy "teachers append own status events"
on public.assignment_status_events;

drop policy "teachers insert own submission review receipts"
on public.submission_review_receipts;

drop policy "teachers update own submission review receipts"
on public.submission_review_receipts;

commit;
