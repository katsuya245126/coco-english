create table public.translation_hint_cache (
  id uuid primary key default gen_random_uuid(),
  source_digest text not null,
  student_level text not null,
  target_locale text not null,
  phrases jsonb not null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (source_digest, student_level, target_locale)
);

alter table public.translation_hint_cache enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.translation_hint_cache to service_role;
