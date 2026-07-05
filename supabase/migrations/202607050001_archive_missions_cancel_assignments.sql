-- Soft archive mission templates and soft cancel class assignments.
-- Archives hide mission templates from the active teacher library.
-- Cancellations remove homework from active student views without deleting
-- assignment history, attempts, audio, transcripts, or review evidence.

alter table public.missions
  add column archived_at timestamptz;

alter table public.assignments
  add column canceled_at timestamptz;

create index missions_teacher_archived_idx
  on public.missions (teacher_id, archived_at, created_at desc);

create index assignments_mission_canceled_idx
  on public.assignments (mission_id, canceled_at, assigned_at desc);
