-- Phase 11 (plan 11-01): additive schema foundation for Coco Chat
-- (dynamic turns + scene framing, v2.4).
--
-- All changes in this migration are additive `add column if not exists`
-- statements only — no drop, rename, or type change on existing columns
-- (milestone hard rule). These four nullable/defaulted columns inherit the
-- existing table RLS policies and service-role grants already established
-- for `missions` and `attempt_turns` in the v1 core; no new tables, indexes,
-- RLS policies, or grants are introduced here (RESEARCH.md Open Question 1
-- chose a jsonb column on attempt_turns over a new table).

alter table public.missions
  add column if not exists scene_premise text;

alter table public.missions
  add column if not exists conversation_mode boolean not null default false;

alter table public.attempt_turns
  add column if not exists coco_line text;

alter table public.attempt_turns
  add column if not exists moderation_event jsonb;
