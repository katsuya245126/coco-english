# Coding Standards

Read this before writing or reviewing code, tests, migrations, or queries. Terms follow `GLOSSARY.md`.

## Ownership and authorization

Every service-role query or mutation involving teachers, students, assignments, attempts, or audio independently proves ownership server-side.

- UI reachability and caller-supplied IDs are never authorization.
- Keep row-level security (RLS) and existing ownership checks intact; a change extends them rather than routing around them.

## Assignment and attempt state

The server owns assignment and attempt state. Every transition runs server-side and stays auditable.

## Mission snapshots

A mission snapshot freezes a mission when it is assigned, so later edits leave assigned homework unchanged. Keep snapshots intact; interpretation rules are in `docs/adr/0002-interpret-mission-snapshots-by-use.md`.

Changing mission evaluation, progression, hints, TTS, or Coco generation: read [mission modes](docs/agents/mission-modes.md) first (preset/conversation split).

## Audio evidence

Keep student audio stored as short per-turn clips.

Serve stored audio to teacher review only through signed playback URLs generated on demand. Stored audio is never public.

## Teacher review and Coco

Teacher review is transcript-first, with audio available alongside.

Coco is a bounded tone layer, not an open-ended autonomous chat agent; generation code keeps it bounded.

## Tests

Test observable behavior. Tautological and change-detector tests are harmful: a test that checks prose, implementation details, or the mere presence of a change fails to protect behavior.

- **Test first.** Write the test before the code or the fix; unit tests written after the code are out.
- **Regression tests.** Add one for a bug fix only when it closes a genuine gap in behavior coverage.
- **Complex features.** Prefer E2E tests as the sole testing mechanism. End each E2E test with a verifiable, repeatable artifact.
- **Isolated tests.** When isolation is necessary, first enumerate the ways the system could fail, then write the test, then the code.

How much to run, and when: the Verification section of [workflow phases](docs/agents/workflow-phases.md).
