-- Per-turn answer shape: "fixed" turns have a correct answer to match; "open"
-- turns (opinion/preference/choice) must never coerce the child toward the
-- target example. Default open so all existing rows are lenient.
alter table public.mission_turn_templates
  add column if not exists answer_shape text not null default 'open'
    check (answer_shape in ('fixed', 'open'));
