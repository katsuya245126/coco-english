# Deepen Mission Snapshot Interpretation

**Status:** Complete
**Started:** 2026-08-10
**Completed:** 2026-08-11
**Classification:** Consequential mission-behavior architecture work
**Branch:** `codex/deepen-mission-snapshot-interpretation`
**Design approval:** Approved by the owner on 2026-08-10
**Implementation approval:** Approved by the owner on 2026-08-10 for plan commit `a70219d7`
**Implementation base:** `a70219d7`
**Issue #22 approval:** Approved by the owner on 2026-08-10 for plan commit `88a7fc9c`
**Issue #22 base:** `88a7fc9c`
**Issue #23:** `#23` Protect spoken-answer processing
**Issue #23 plan:** `3d7655d2`
**Issue #23 approval:** Approved by the owner on 2026-08-10 for plan commit `3d7655d2`
**Issue #23 base:** `3d7655d2`
**Issue #24:** `#24` Protect Coco voice and translation
**Issue #24 plan:** `0c7dd8ff`
**Issue #24 approval:** Approved by the owner on 2026-08-10 for plan commit `0c7dd8ff`
**Issue #24 base:** `0c7dd8ff`
**Issue #25:** `#25` Support legacy student past work
**Issue #25 plan:** `77f14504`
**Issue #25 approval:** Approved by the owner on 2026-08-10 for plan commit `c968dde2`; the owner then approved the real-render test amendment now recorded in `77f14504`
**Issue #25 base:** `77f14504`
**Issue #26:** `#26` Support teacher evidence safely
**Issue #26 plan:** `1761493d`
**Issue #26 approval:** Approved by the owner on 2026-08-10 for plan commit `1761493d`
**Issue #26 base:** `1761493d`
**Issue #26 closure:** Closed on 2026-08-11 after exact owner authorization
**Issue #27:** `#27` Remove duplicate readers and verify the full change
**Issue #27 design:** approved duplicate-mission-snapshot-reader removal design
**Issue #27 design approval:** Approved by the owner on 2026-08-11
**Issue #27 plan:** approved duplicate-mission-snapshot-reader removal implementation plan
**Issue #27 plan commit:** `e697e525`
**Issue #27 written-spec approval:** Approved by the owner on 2026-08-11
**Issue #27 plan approval:** Approved by the owner on 2026-08-11 by selecting inline execution for plan commit `e697e525`
**Issue #27 verification base:** `e697e525`
**Issue #27 closure:** Closed on 2026-08-11 after exact owner authorization
**Specification issue:** `#20`
**Specification issue closure:** Closed on 2026-08-11 after exact owner authorization

## Desired outcome

Current and supported legacy mission snapshots receive one server-owned
interpretation, so student and teacher consumers agree on mission mode, turn
order, prompts, and other snapshot-derived behavior.

## Why this is active

The owner explicitly selected candidate 2 from
`docs/improve-codebase-architecture.md`. The review found strict schema parses,
two separate legacy-compatible readers, and a partial type cast across mission
snapshot consumers.

## Scope

- Define the supported current and legacy snapshot interpretation contract.
- Centralize compatibility and normalization in the existing mission domain.
- Derive the minimum teacher and student views from that interpretation.
- Replace caller-owned snapshot parsing only where the shared interpretation
  covers the existing behavior.
- Add focused contract and consumer checks for preset, conversation, invalid,
  and supported legacy snapshots.

## Non-goals

- No stored snapshot rewrite or database migration unless design evidence shows
  it is required.
- No change to assignment-time snapshot immutability.
- No change to mission authoring fields or UI.
- No change to preset/conversation evaluation, progression, hints, TTS, or Coco
  generation semantics.
- No unrelated teacher evidence or student-flow refactor.
- No new dependency, push, deployment, production mutation, or publication.

## Affected surfaces

- Mission snapshot schema and interpretation in `src/domain/mission/`.
- Student mission loading, resume flow, recap, TTS, and translation lookup.
- Teacher attempt and not-started assignment evidence.
- Focused domain and server tests for those consumers.

## Constraints

- Stored assignment snapshots remain immutable evidence of assigned homework.
- Preset and conversation behavior remain distinct and unchanged.
- Invalid or unsupported data must fail closed at authorization-sensitive and
  paid-operation boundaries.
- Compatibility must be explicit; permissive parsing of arbitrary JSON is not
  an acceptable contract.
- Existing ownership checks remain server-side and unchanged.
- Use the existing mission domain rather than adding a parallel abstraction.
- Preserve unrelated working-tree changes.

## Assumptions

- `turnOrder` is the current stored field and `order` is a legacy/seeded alias.
- Legacy compatibility is needed for reads, not for newly created snapshots.
- The current assignment builder continues to emit snapshots accepted by
  `missionSnapshotSchema`.
- The architecture review's listed consumers are the starting inventory; the
  design trace must confirm all callers before implementation.

## Missing evidence

- Whether every consumer should require a complete interpreted snapshot or
  consume a smaller, explicitly derived view.
- Whether strict consumers intentionally reject legacy snapshots today or do so
  only because compatibility is duplicated elsewhere.
- The observable failure behavior that must remain for each consumer.

## Decision frontier

Settled:

1. A known legacy mission snapshot can provide evidence and recap data. It
   cannot run a mission. The interpreter rejects other incomplete formats.
2. The public interpreter returns one tagged result: complete mission, legacy
   evidence, or invalid data. Each caller must accept an applicable result.
3. The mission flow ends when the student completes the homework. The student
   recap appears next, and teacher evidence remains a separate feature.
4. The student recap shows the latest homework attempt. For each question, it
   can show the original and repeated speaking tries.
5. If a legacy mission snapshot has no target pattern, the student recap omits
   the target-pattern line. It shows the known recap data.
6. Past-work pages show the known questions and answers from the exact legacy
   mission snapshot format. The mission flow never uses this format.
7. A mission snapshot remains unchanged after assignment. A later mission edit
   changes only future assignments.
8. If a mission snapshot is broken, teacher evidence still shows stored
   transcripts and audio. The missing mission question stays absent.
9. If the mission snapshot is broken, the student recap keeps its current
   not-found behavior.
10. A complete older mission snapshot uses its historical defaults when newer
    settings are absent. The application does not create missing mission
    content.
11. Completed homework with an exact legacy mission snapshot stays visible in
    the student's Past list and opens its available recap.
12. Unfinished homework with a legacy mission snapshot stays hidden from the
    current homework list because it cannot run.
13. The teacher view shows the known title, questions, and examples from a
    valid legacy mission snapshot. It omits unavailable fields.
14. If a legacy mission snapshot has a broken question, the interpreter marks
    the complete snapshot as invalid. Teacher transcripts and audio remain
    available without snapshot questions.
15. Final verification runs focused tests first. It then runs the full test
    suite, typecheck, lint, and the production build.
16. ADR 0002 records the narrow legacy compatibility boundary and its reason.

Open: None. Issue #27 is verification-only unless an audit or required check
proves that a code change is needed.

Issue #27 verification is blocked until the owner reviews the written design
and approves its exact plan.

## Done checks

- [x] The design tree has no unanswered behavior or compatibility decisions.
- [x] The owner approves the written design and implementation plan.
- [x] One mission-domain surface interprets current and supported legacy
      snapshots.
- [x] Preset and conversation snapshots retain their existing meaning.
- [x] Teacher evidence and student recap agree on turn order and prompts.
- [x] Mission loading, resume, TTS, and translation require a complete snapshot
      before live state changes or paid work.
- [x] Unsupported snapshots fail closed without starting paid work or changing
      assignment/attempt state.
- [x] Focused tests cover current preset, current conversation, supported
      legacy, and invalid snapshots.
- [x] Typecheck, source lint, and proportionate broader tests pass. Unfiltered
      lint is blocked only by ignored generated artifacts recorded below.
- [x] The final issue `#21` diff contains no unrelated refactor.

## Plan

- [x] Confirm clean `main`, no inherited `TASK.md`, and candidate-2 source.
- [x] Create `codex/deepen-mission-snapshot-interpretation` from `d0b7fcd2`.
- [x] Record the initial consequential task brief and evidence gaps.
- [x] Complete the candidate's required design interview.
- [x] Compare interpretation results and obtain owner design approval.
- [x] Write and self-review the design spec; obtain owner review.
- [x] Publish the approved spec as GitHub issue `#20` with `ready-for-agent`.
- [x] Publish tracer-bullet issues `#21` through `#27` with native parent and
      blocking relationships.
- [x] Write the exact test-first implementation plan.
- [x] Obtain owner approval for the implementation plan.
- [x] Implement the smallest approved deepening for issue `#21`.
- [x] Run focused and proportionate verification and review the issue `#21`
      diff.
- [x] Close issue `#21` after owner authorization.
- [x] Write the exact test-first implementation plan for issue `#22`.
- [x] Obtain owner approval for the issue `#22` implementation plan.
- [x] Implement and independently review issue `#22`.
- [x] Close issue `#22` after owner authorization.
- [x] Write and review the exact test-first implementation plan for issue `#23`.
- [x] Obtain owner approval for the issue `#23` implementation plan.
- [x] Implement and independently review issue `#23`.
- [x] Close issue `#23` after owner authorization.
- [x] Write and review the exact test-first implementation plan for issue `#24`.
- [x] Obtain owner approval for the issue `#24` implementation plan.
- [x] Implement and independently review issue `#24`.
- [x] Close issue `#24` after owner authorization.
- [x] Write and review the exact test-first implementation plan for issue `#25`.
- [x] Obtain owner approval for the issue `#25` implementation plan.
- [x] Implement and independently review issue `#25`.
- [x] Close issue `#25` after owner authorization and two-axis review.
- [x] Write and review the exact test-first implementation plan for issue `#26`.
- [x] Obtain owner approval for the issue `#26` implementation plan.
- [x] Implement and independently review issue `#26`.
- [x] Close issue `#26` after owner authorization.
- [x] Audit the Issue `#27` reader inventory and confirm its dependencies are closed.
- [x] Compare Issue `#27` approaches and obtain owner design approval.
- [x] Write and self-review the Issue `#27` design specification.
- [x] Obtain owner review of the Issue `#27` written specification.
- [x] Write and obtain approval for the exact Issue `#27` verification plan.
- [x] Run the Issue `#27` audit and required verification.
- [x] Review Issue `#27` and confirm its acceptance evidence.
- [x] Close Issue `#27` after owner authorization.
- [x] Archive this task when complete or paused.

## Verification evidence

- `main` was clean at `d0b7fcd2` before branch creation.
- No active root `TASK.md` existed.
- The architecture review identifies ten application/server consumers and
  specifically records duplicated `order`/`turnOrder` compatibility.
- `student-history.ts` and `audio-evidence.ts` independently parse partial
  snapshots and accept both turn-order fields.
- `mission-flow.ts` reads `requiredTurns` through a partial type cast with a
  fallback of `3`.
- Other inspected consumers use strict `missionSnapshotSchema.parse` or
  `safeParse`.
- Git history identifies one genuine partial legacy generation: the removed
  foundation smoke writer stored `missionId`, `title`, `characterId`,
  `requiredTurns`, and turns with `order`, `prompt`, and `targetExample`, but no
  `targetPattern`, `level`, or `hintLadder` (`4e27cde9`, removed by `a4861e46`).
- Later complete generations added `conversationMode`,
  `requireCompleteSentenceAnswers`, and per-turn `answerShape`; their schema
  defaults establish `false`, `true`, and `open` respectively for older data.
- Old complete snapshots may contain now-unused `topic` and `scenePremise`;
  current Zod object parsing safely ignores them.
- Repository history supports explicit normalization of known generations. It
  does not support treating arbitrary partial JSON as a valid mission.
- The complete caller trace found two readers that the architecture review did
  not list: the student assignment list and the audio-upload service. The
  database completion operation also reads `requiredTurns` from the snapshot.
- Live mission loading, audio evaluation, and translation already require a
  complete snapshot. Resume reads only `requiredTurns` through a type cast and
  can continue live work without complete validation.
- The TTS route requires a complete snapshot for mission prompts, but some
  generic speech lines can reach cache or provider work without one.
- The past assignment list currently omits the exact legacy format. Teacher
  evidence already preserves transcripts and audio when snapshot data is
  invalid.
- The owner selected focused tests followed by the full suite, typecheck, lint,
  and production build.
- `docs/adr/0002-interpret-mission-snapshots-by-use.md` records the approved
  compatibility boundary.
- Issue `#24` baseline verification passed: 116 test files, 1,495 tests passed,
  and 15 environment-gated tests skipped at plan commit `0c7dd8ff`.
- Issue `#24` implementation commits are `cf571ad7` (voice requests) and
  `013701d9` (translation source lookup).
- Issue `#24` focused verification passed 50/50 tests. The full suite passed
  1,509 tests with 15 environment-gated skips; typecheck, source lint,
  production build, and `git diff --check 0c7dd8ff...HEAD` passed.
- Unfiltered lint again found only ignored generated artifacts under `.ua/`,
  `.worktrees/`, and `supabase/.temp/`, plus the pre-existing source warning at
  `scripts/check-student-feedback-states.mjs:435`. Source lint excluding the
  confirmed generated paths exited successfully with that one warning.
- Task reviews and final standards/spec reviews found no issues. The broad
  review raised one non-blocking concern about exact import-source seam tests;
  it was retained because the approved plan requires proof that callers use
  the shared interpreter and the old/new parsers reject the boundary fixtures
  identically at runtime.
- The owner approved the complete design summary and the proposed test seams.
- The design spec is the approved mission-snapshot interpretation design
  summarized in the issue record.
- The spec self-review found no placeholder, contradiction, ambiguous scope, or
  unapproved file-specific implementation instruction.
- GitHub issue `#20` contains the approved specification and has the
  `ready-for-agent` label.
- GitHub issues `#21` through `#27` are child issues of `#20` and have the
  `ready-for-agent` label.
- Before issue `#21` closed, issues `#22` through `#26` were blocked by it.
  Final integration issue `#27` remains blocked by `#22` through `#26`.
- The exact issue `#21` test-first implementation plan passed its placeholder,
  type-consistency, scope, and staged-diff checks. It is commit `a70219d7`.
- The owner approved plan commit `a70219d7` on 2026-08-10. This commit is the
  implementation review base.
- `npm test -- --run src/domain/mission/mission-snapshot.test.ts` first failed
  because the planned public interpreter module did not exist.
- After the minimum interpreter was added, the same focused command passed 13
  tests with no skips. `npm run typecheck` also exited with status 0.
- Implementation commit `f972a719` creates only
  `src/domain/mission/mission-snapshot.ts` and its co-located public-seam test.
- Final focused verification passed 13 tests with no skips.
- Final full verification passed 116 test files: 1,483 tests passed and 15
  environment-gated integration tests skipped.
- Final `npm run typecheck` exited with status 0.
- Unfiltered `npm run lint` found only ignored generated artifacts under
  `.ua/`, `.worktrees/`, and `supabase/.temp/`. Git confirmed that all three
  paths are ignored and untracked. `npx eslint .` with those paths excluded
  exited with status 0, with one pre-existing warning in
  `scripts/check-student-feedback-states.mjs`.
- Final `npm run build` compiled, generated all pages, and confirmed that
  ffmpeg was traced into the audio route.
- The standards review found 0 documented-standard violations and 0 code-smell
  findings.
- The issue `#21` specification review found 0 missing requirements, 0 scope
  creep, and 0 incorrect requirements.
- The owner authorized closing GitHub issue `#21` on 2026-08-10. Issue `#21`
  is closed, and GitHub reports that issue `#22` has zero open blockers.
- The issue `#22` plan passed its acceptance-criteria, placeholder,
  type-consistency, scope, and staged-diff checks. It is commit `88a7fc9c`.
- The owner approved plan commit `88a7fc9c` on 2026-08-10 and authorized the
  fastest execution method. This commit is the issue `#22` review base.
- Issue `#22` Task 1 is commit `751e0c8b`. Its focused tests passed 22/22,
  typecheck exited with status 0, and the task review found no issues.
- Issue `#22` Task 2 is commit `9348966d`. Its focused tests passed 30/30,
  typecheck exited with status 0, and the task review found no issues.
- Final issue `#22` focused verification passed 43 tests with no skips.
- Final full verification passed 116 test files: 1,492 tests passed and 15
  environment-gated integration tests skipped.
- Final issue `#22` typecheck and production build exited with status 0.
- Unfiltered lint again found only ignored generated artifacts under `.ua/`,
  `.worktrees/`, and `supabase/.temp/`. Source lint with those paths excluded
  exited with status 0 and one pre-existing warning.
- The issue `#22` broad review found no Critical, Important, or Minor issues.
- The issue `#22` standards review found 0 violations and 0 smell findings.
- The issue `#22` specification review found 0 missing requirements, 0 scope
  creep, and 0 incorrect requirements.
- The owner authorized closing GitHub issue `#22` on 2026-08-10. GitHub reports
  issue `#22` closed at `2026-08-10T03:19:39Z`.
- GitHub issue `#23` is open, has the `ready-for-agent` label, and reports zero
  open blockers.
- The current audio-upload path already rejects legacy and invalid snapshots
  before budget, writes, and providers through a direct strict schema parse.
  Issue `#23` replaces that duplicate parse with the shared interpreter and
  adds observable no-work boundary coverage.
- The exact Issue `#23` test-first implementation plan covers all seven issue
  acceptance criteria, contains no unresolved placeholder, preserves existing
  public types, and limits production work to the existing audio-upload seam.
  It is commit `3d7655d2`.
- The owner approved plan commit `3d7655d2` on 2026-08-10. The current dedicated
  branch was selected instead of creating another worktree. Dependency setup
  was already current, and the clean baseline passed 116 test files: 1,492
  tests passed and 15 environment-gated tests skipped.
- Issue `#23` Task 1 is commit `1a17db7d`. Its RED run failed only on the
  missing shared-interpreter seam while the observable legacy/invalid safety
  cases already passed. Its GREEN run and the controller rerun passed 123/123
  focused preset/conversation tests, and typecheck exited with status 0.
- The Issue `#23` Task 1 review found no Critical, Important, or Minor issues;
  specification compliance and task quality were approved.
- Final Issue `#23` focused verification passed 136 tests with no skips.
- Final full verification passed 116 test files: 1,495 tests passed and 15
  environment-gated integration tests skipped.
- Final Issue `#23` typecheck and production build exited with status 0.
- Unfiltered lint again found only ignored generated artifacts under `.ua/`,
  `.worktrees/`, and `supabase/.temp/`. Source lint with those paths excluded
  exited with status 0 and one pre-existing warning.
- `git diff --check 3d7655d2...1a17db7d` passed.
- The final whole-branch review found no Critical, Important, or Minor issues
  and assessed the branch ready to merge.
- The Issue `#23` standards review found 0 violations and 0 smell findings.
- The Issue `#23` specification review found 0 missing requirements, 0 scope
  creep, and 0 incorrect requirements.
- The owner authorized closing GitHub issue `#23` on 2026-08-10. GitHub reports
  issue `#23` closed at `2026-08-10T04:13:27Z`.
- GitHub issue `#24` is open, has the `ready-for-agent` label, and reports zero
  open blockers.
- The TTS route currently rejects invalid snapshots for prompt and dynamic
  lines, but generic feedback, transition, and completion lines can continue
  to budget and cache work because their text comes from the character profile.
- Translation source lookup already fails closed through a direct strict schema
  parse. Issue `#24` moves both paths to the shared interpreter and adds the
  missing generic-line boundary coverage.
- The exact Issue `#24` test-first implementation plan covers all eight issue
  acceptance criteria, contains no unresolved placeholder, preserves existing
  public types, and limits production work to the TTS route and translation
  source seams. It is commit `0c7dd8ff`.
- The owner authorized closing GitHub issue `#24` on 2026-08-10. GitHub reports
  issue `#24` closed at `2026-08-10T04:32:07Z`.
- GitHub issue `#25` is open, has the `ready-for-agent` label, and is unblocked
  because issue `#21` is closed.
- Issue `#25` has two existing duplicate readers: the assignment list uses the
  strict schema, while the recap uses a permissive local `parseSnapshot`.
- The smallest approved-design path is to use the shared interpreter in both
  readers, admit legacy data only for completed Past work and recaps, represent
  its missing target pattern as `null`, and reuse `HomeworkReview` so original
  and repeated tries remain visible without changing complete preset recaps.
- The exact Issue `#25` plan covers all nine acceptance criteria in two
  independently reviewable TDD tasks, contains no unresolved placeholders,
  preserves complete preset/conversation behavior, and is commit `77f14504`.
- The Issue `#25` focused baseline passed 23/23 tests with no skips.
- The amended Issue `#25` full baseline at `77f14504` passed 116 test files:
  1,509 tests passed and 15 environment-gated tests skipped.
- Issue `#25` pre-flight found one plan/test-guidance conflict in the planned
  mocked component-marker assertion. The owner selected a real-render page
  test; the amended plan removes the conflict without changing production
  scope.
- During Task 2, Vitest rejected the planned `tests/**/*.test.tsx` path because
  the repository includes TSX tests only under `src/`. The plan now places the
  unchanged real-render test beside the page; path correction commit is
  `1ced441c` and no test-runner configuration changed.
- Issue `#25` Task 1 is commit `5408d47c`; its review approved the complete-only
  Current boundary and completed legacy Past behavior. Controller verification
  passed 7/7 focused tests and typecheck.
- Issue `#25` Task 2 is commit `b8576d10`; its review approved the exact legacy
  recap, invalid not-found behavior, real page rendering, and preservation of
  complete preset/conversation recaps. Controller verification passed 35/35
  focused tests and typecheck.
- Final Issue `#25` focused verification passed 42/42 tests with no skips. The
  full suite passed 117 files: 1,515 tests passed and 15 environment-gated
  tests skipped.
- Final Issue `#25` typecheck, source lint, production build, and
  `git diff --check 77f14504...HEAD` exited successfully.
- Unfiltered lint again found only ignored generated artifacts under `.ua/`,
  `.worktrees/`, and `supabase/.temp/`, plus the pre-existing source warning at
  `scripts/check-student-feedback-states.mjs:435`. Source lint excluding those
  generated paths exited successfully with that one warning.
- Broad, standards/security, and exact specification reviews found no Critical,
  Important, or Minor issues. The specification review mapped all nine Issue
  `#25` acceptance criteria to code and tests.
- The owner requested the named two-axis `code-review` skill before closure.
  Its Standards axis found zero documented violations and one non-blocking
  duplicated local test-fixture smell; its Spec axis found zero missing,
  scope-creep, or incorrect requirements.
- The owner authorized conditional closure, and GitHub reports Issue `#25`
  closed at `2026-08-10T05:07:51Z` after both review axes passed.
- GitHub Issue `#26` is open, labeled `ready-for-agent`, and unblocked because
  Issue `#21` is closed.
- Issue `#26` focused baseline passed 18/18 tests across no-attempt assigned
  work, attempt evidence, dynamic-question mapping, ownership, and signed audio.
- The no-attempt teacher reader currently uses the strict schema, so exact
  legacy title/questions/examples are dropped. Its invalid fallback is already
  structurally safe but duplicates interpretation policy.
- Attempt evidence currently uses permissive local question parsing plus a raw
  `conversationMode` read. It always adds stored dynamic questions afterward,
  so invalid snapshot data can still produce mission questions and can select
  conversation behavior.
- The smallest design is two existing-seam interpreter changes: no-attempt
  evidence accepts complete/legacy projections; attempt evidence derives one
  context and adds dynamic questions only for a complete conversation result.
  Invalid context stays empty while transcript, evaluation, pronunciation,
  clip, ownership, and signing flows continue unchanged.
- The exact Issue `#26` plan covers all eight acceptance criteria in two
  independently reviewable TDD tasks, has balanced code blocks and no
  unresolved placeholders, and is commit `1761493d`.
- The owner approved the verification-only Issue `#27` design and selected
  inline execution for exact plan commit `e697e525`.
- The final source audit found no `parseSnapshot` helper, second compatibility
  parser, unapproved direct schema parse, or raw application snapshot-field
  reader. Nine application/server consumer seams use
  `interpretMissionSnapshot`.
- `src/domain/mission/mission-snapshot.ts` owns the only complete/legacy parse.
  `src/server/mission/assign-service.ts` retains the approved strict creation
  parse. Generated database types contain no behavior.
- The only raw SQL reads are the historical completion RPC and its later
  replacement. Both read `requiredTurns` as approved and were unchanged.
- Issue `#27` focused verification passed 14 files and 293 tests with no skips.
- The full suite passed 117 files: 1,519 tests passed and 15
  environment-gated tests skipped.
- Typecheck exited successfully.
- Unfiltered lint found 163 errors and 33 warnings only in generated `.ua/`,
  `.worktrees/`, and `supabase/.temp/` artifacts, plus the pre-existing source
  warning at `scripts/check-student-feedback-states.mjs:435`. Source lint with
  those generated paths excluded exited successfully with 0 errors and that
  one warning.
- The production build compiled, generated all pages, and confirmed ffmpeg was
  traced into the audio route.
- `git diff --check HEAD`, `git diff --name-status HEAD`, and the diff from
  Issue `#27` base `e697e525` to `HEAD` were empty. The tracked worktree is
  clean, and Issue `#27` added no production, test, migration, or dependency
  change after its approved plan.
- All ten Issue `#27` acceptance criteria map to the final audit, focused/full
  tests, static checks, production build, and empty post-plan diff. The only
  caveat is the recorded generated-artifact failure in unfiltered lint; source
  lint passed.

## Current position

Issues `#21` through `#27` and parent specification Issue `#20` are closed.
The feature is implemented, reviewed, verified, and complete.

## Next action

Choose the branch integration or preservation action.
