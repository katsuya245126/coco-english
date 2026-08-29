begin;

-- Refuse to change the assignment policy while any existing row points from a
-- teacher-owned class to another teacher's mission. The new WITH CHECK clause
-- intentionally makes that state unrepresentable for future writes; existing
-- data must be reviewed rather than silently rewritten during deployment.
do $$
begin
  if exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    join public.missions m on m.id = a.mission_id
    where c.teacher_id is distinct from m.teacher_id
  ) then
    raise exception
      'assignment ownership audit failed: class and mission teachers disagree';
  end if;
end;
$$;

-- Teacher classroom roots use archive/cancel semantics. Direct authenticated
-- DELETE must not be able to cascade into student history.
revoke delete
on table public.classes, public.students, public.missions, public.assignments
from authenticated;

drop policy "teachers manage own classes"
on public.classes;

create policy "teachers read own classes"
on public.classes for select
to authenticated
using (teacher_id = public.current_teacher_id());

create policy "teachers insert own classes"
on public.classes for insert
to authenticated
with check (teacher_id = public.current_teacher_id());

create policy "teachers update own classes"
on public.classes for update
to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id());

drop policy "teachers manage own students"
on public.students;

create policy "teachers read own students"
on public.students for select
to authenticated
using (public.is_class_owner(class_id));

create policy "teachers insert own students"
on public.students for insert
to authenticated
with check (public.is_class_owner(class_id));

create policy "teachers update own students"
on public.students for update
to authenticated
using (public.is_class_owner(class_id))
with check (public.is_class_owner(class_id));

drop policy "teachers manage own missions"
on public.missions;

create policy "teachers read own missions"
on public.missions for select
to authenticated
using (teacher_id = public.current_teacher_id());

create policy "teachers insert own missions"
on public.missions for insert
to authenticated
with check (teacher_id = public.current_teacher_id());

create policy "teachers update own missions"
on public.missions for update
to authenticated
using (teacher_id = public.current_teacher_id())
with check (teacher_id = public.current_teacher_id());

drop policy "teachers manage own assignments"
on public.assignments;

create policy "teachers read own assignments"
on public.assignments for select
to authenticated
using (public.is_class_owner(class_id));

create policy "teachers insert own assignments"
on public.assignments for insert
to authenticated
with check (
  public.is_class_owner(class_id)
  and public.is_mission_owner(mission_id)
);

create policy "teachers update own assignments"
on public.assignments for update
to authenticated
using (public.is_class_owner(class_id))
with check (
  public.is_class_owner(class_id)
  and public.is_mission_owner(mission_id)
);

-- Mission turn replacement remains an intentional authenticated write path for
-- the teacher-owned editor, so mission_turn_templates is unchanged here.

-- Evidence rows are written by service-role workflow RPCs only. Authenticated
-- teachers and students retain read access where their existing policies allow
-- it, but cannot mutate or delete stored audio or pronunciation scores through
-- the Data API.
revoke insert, update, delete
on table public.audio_clips, public.pronunciation_scores
from authenticated;

grant select
on table public.audio_clips, public.pronunciation_scores
to authenticated;

drop policy "teachers manage own audio clips"
on public.audio_clips;

create policy "teachers read own audio clips"
on public.audio_clips for select
to authenticated
using (public.is_attempt_turn_owner(attempt_turn_id));

drop policy "teachers manage own pronunciation scores"
on public.pronunciation_scores;

create policy "teachers read own pronunciation scores"
on public.pronunciation_scores for select
to authenticated
using (public.is_audio_clip_owner(audio_clip_id));

commit;
