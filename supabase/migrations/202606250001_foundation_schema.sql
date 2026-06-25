create extension if not exists pgcrypto;

create type data_mode as enum ('demo', 'real');
create type assignment_student_status as enum (
  'assigned',
  'started',
  'completed',
  'missed',
  'needs_retry',
  'teacher_review'
);
create type attempt_status as enum (
  'in_progress',
  'completed',
  'abandoned',
  'needs_retry',
  'teacher_review'
);
create type audio_clip_kind as enum ('original_answer', 'repeat_attempt');
create type audio_processing_status as enum (
  'pending_upload',
  'uploaded',
  'transcribed',
  'failed',
  'deleted'
);
create type status_actor_type as enum (
  'system',
  'teacher',
  'student_session',
  'job',
  'ai_evaluator'
);

create table public.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  name text not null,
  join_code text unique,
  data_mode public.data_mode not null default 'real',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  display_name text not null,
  pin_hash text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  title text not null,
  target_pattern text not null,
  topic text not null,
  level text not null,
  required_turns integer not null check (required_turns > 0),
  character_id text not null default 'default-buddy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mission_turn_templates (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  turn_order integer not null check (turn_order > 0),
  prompt text not null,
  target_example text not null,
  hint_ladder jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, turn_order)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete restrict,
  title text not null,
  mission_snapshot jsonb not null,
  data_mode public.data_mode not null,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.assignment_student_status not null default 'assigned',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  highest_hint_level integer not null default 0 check (highest_hint_level >= 0),
  latest_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_student_id uuid not null references public.assignment_students(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  needs_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assignment_students
  add constraint assignment_students_latest_attempt_fk
  foreign key (latest_attempt_id) references public.attempts(id) on delete set null;

create table public.attempt_turns (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  mission_turn_template_id uuid references public.mission_turn_templates(id) on delete set null,
  turn_order integer not null check (turn_order > 0),
  original_transcript text,
  improved_sentence text,
  repeat_transcript text,
  evaluation jsonb not null default '{}'::jsonb,
  target_attempted boolean,
  repeat_accepted boolean,
  hint_level_used integer not null default 0 check (hint_level_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, turn_order)
);

create table public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  attempt_turn_id uuid not null references public.attempt_turns(id) on delete cascade,
  clip_kind public.audio_clip_kind not null,
  object_key text,
  mime_type text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  byte_size integer check (byte_size is null or byte_size >= 0),
  processing_status public.audio_processing_status not null default 'pending_upload',
  audio_expires_at timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_status_events (
  id uuid primary key default gen_random_uuid(),
  assignment_student_id uuid not null references public.assignment_students(id) on delete cascade,
  previous_status public.assignment_student_status,
  next_status public.assignment_student_status not null,
  actor_type public.status_actor_type not null,
  actor_id uuid,
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_class_data_mode_change_with_assignments()
returns trigger
language plpgsql
as $$
begin
  if old.data_mode is distinct from new.data_mode
    and exists (select 1 from public.assignments where class_id = old.id)
  then
    raise exception 'classes.data_mode cannot change after assignments exist';
  end if;

  return new;
end;
$$;

create trigger prevent_class_data_mode_change_with_assignments
before update of data_mode on public.classes
for each row
execute function public.prevent_class_data_mode_change_with_assignments();

alter table public.teacher_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.missions enable row level security;
alter table public.mission_turn_templates enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_students enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_turns enable row level security;
alter table public.audio_clips enable row level security;
alter table public.assignment_status_events enable row level security;
