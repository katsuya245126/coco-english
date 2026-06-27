-- Phase 5 (plan 05-02): private Storage bucket for short student audio clips.
--
-- Object access is server-owned. Student uploads go through the service-role
-- app route after unlock-cookie ownership checks, and teacher playback later
-- uses signed URLs only after teacher ownership checks. No public object URLs
-- or public Storage policies are introduced here.

insert into storage.buckets (id, name, public)
values ('student-audio', 'student-audio', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;
