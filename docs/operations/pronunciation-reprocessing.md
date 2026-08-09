# Repair an abandoned pronunciation reprocessing marker

Use this procedure only when a pronunciation reprocessing marker is abandoned.
The marker is **not** a timeout: there is no automatic clearing, and no fixed
age makes a marker safe to clear.

Before the repair, an authorized database maintainer must:

- confirm that no Azure pronunciation request is active for the clip;
- obtain separate approval that names the exact environment and the clear
  action; and
- identify the owning teacher profile ID and audio clip ID.

In the approved database session, run only this ownership-proving operation:

```sql
select public.clear_pronunciation_reprocessing(
  '<teacher_profile_id>'::uuid,
  '<audio_clip_id>'::uuid
);
```

`ok` means the owned clip was found and its marker is clear. `not_found` means
the teacher/clip pair is not owned or does not exist; do not retry with a
different teacher ID unless a new approved repair identifies that owner. The
operation is idempotent: a repeated approved call returns `ok` and leaves the
marker clear.

After `ok`, retry pronunciation reprocessing from the teacher evidence page.
Do not update `audio_clips` directly, and do not add or use an application
repair endpoint or page.
