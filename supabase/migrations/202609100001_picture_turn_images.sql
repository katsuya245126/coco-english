-- Picture turns keep one immutable object pointer and its required
-- accessibility description on the turn template. Assigned mission snapshots
-- copy both values, so replacing a future mission picture never changes old
-- homework.

alter table public.mission_turn_templates
  add column if not exists picture_object_key text,
  add column if not exists picture_description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mission_turn_templates'::regclass
      and conname = 'mission_turn_templates_picture_metadata_check'
  ) then
    alter table public.mission_turn_templates
      add constraint mission_turn_templates_picture_metadata_check
      check (
        (picture_object_key is null and picture_description is null)
        or (
          picture_object_key is not null
          and btrim(picture_object_key) <> ''
          and picture_description is not null
          and length(btrim(picture_description)) between 1 and 300
        )
      );
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('mission-images', 'mission-images', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;
