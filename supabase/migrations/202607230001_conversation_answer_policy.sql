alter table public.missions
  add column if not exists
    require_complete_sentence_answers boolean not null default true;
