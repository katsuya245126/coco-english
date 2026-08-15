alter table public.mission_turn_templates
  add column if not exists target_pattern text;

update public.mission_turn_templates as turns
set target_pattern = missions.target_pattern
from public.missions as missions
where turns.mission_id = missions.id
  and not missions.conversation_mode
  and turns.target_pattern is null;

update public.missions
set target_pattern = null
where not conversation_mode;

alter table public.missions
  alter column target_pattern drop not null;
