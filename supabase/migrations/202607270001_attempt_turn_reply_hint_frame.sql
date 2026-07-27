-- Persist the conversation reply hint frame that was available to the student
-- on the turn they answered.
--
-- The frame is derived from Coco's question text by buildReplyHintFrame(). It
-- was previously derived at report time, which meant a later change to that
-- function silently rewrote the history of what old attempts had shown. This
-- column records what was actually available at answer time.
--
-- Semantics: the hint frame OFFERED for the question the student answered, not
-- whether the student expanded it. Null means either a preset (non-conversation)
-- mission, a question no frame rule matched, or a row written before this
-- migration.
--
-- Additive only — a single nullable `add column if not exists`, no drop, rename,
-- or type change (milestone hard rule). Inherits the existing attempt_turns RLS
-- policies and service-role/authenticated grants; no new tables, indexes, RLS
-- policies, or grants.

alter table public.attempt_turns
  add column if not exists reply_hint_frame text;
