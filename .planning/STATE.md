---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Coco Comes Alive
status: planning
last_updated: "2026-07-01T10:39:34.942Z"
last_activity: 2026-07-01
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.
**Current focus:** Between milestones — start next milestone planning

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-01 — Milestone v2.0 started

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: 20 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 1 | 20 min | 20 min |
| 02 | 4 | - | - |
| 07 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: 01-01 complete
- Trend: Initial foundation complete

*Updated after each plan completion*
| Phase 02 P01 | 13min | 4 tasks | 27 files |
| Phase 02 P02 | 14min | 3 tasks | 12 files |
| Phase 02 P03 | 7min | 2 tasks | 12 files |
| Phase 02 P04 | 25min | 5 tasks | 17 files |
| Phase 03 P03-03 | 7min | 3 tasks | 6 files |
| Phase 04 P01 | 4min | 3 tasks | 9 files |
| Phase 04 P02 | 3min | 3 tasks | 4 files |
| Phase 04 P03 | 5min | 3 tasks | 4 files |
| Phase 04 P04 | 8min | 3 tasks | 6 files |
| Phase 04 P05 | 8min | 3 tasks | 7 files |
| Phase 05 P01 | 9min | 3 tasks | 8 files |
| Phase 05 P02 | 10min | 4 tasks | 8 files |
| Phase 05 P03 | 11min | 3 tasks | 11 files |
| Phase 05 P05 | 6min | 4 tasks | 4 files |
| Phase 06 P01 | 6min | 2 tasks | 7 files |
| Phase 06 P02 | 7min | 2 tasks | 5 files |
| Phase 06 P04 | 15min | 2 tasks | 11 files |
| Phase 07 P04 | 4min | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Use a 7-phase vertical MVP sequence driven by classroom homework risk and requirement coverage.
- [Roadmap]: Build manual mission assignment before AI generation so teacher control and snapshots exist first.
- [Roadmap]: Add audio before AI evaluation so recording, storage, and teacher playback can be verified independently.
- [Phase 1 Context]: Use full workflow skeleton, immutable assignment snapshots, class-scoped students, server-owned status transitions, missed-status job, audited teacher overrides, 30-day audio retention, and explicit demo-vs-real data mode.
- [Phase 1 Execution]: Implemented Next.js/Supabase foundation, server-owned assignment status rules, RLS-enabled schema posture, and env-aware smoke verification.
- [Phase ?]: RLS ownership rooted in teacher_profiles.auth_user_id = auth.uid() via SECURITY DEFINER helpers; @supabase/ssr cookie clients with getClaims() server gating; service-role stays server-only (02-01)
- [Phase 02]: 02-03: Student PINs hashed with node:crypto scrypt (per-PIN salt + server-only PIN_HASH_PEPPER); only pin_hash stored, cleartext shown once.
- [Phase 02]: 02-03: Persist normalizeRosterName output as students.display_name so DB lower(display_name) active-name unique index matches the app-level dedup key.
- [Phase ?]: 02-04: App-owned student access uses the server-only service-role client (students have no auth session); confined server-only, never imported into a client module.
- [Phase ?]: 02-04: Every student-unlock failure returns one identical generic_mismatch value (D-16 non-enumeration).
- [Phase ?]: 02-04: Remembered class stored id-keyed in localStorage separate from the live join code (D-18); PIN re-entered every visit via a short-lived HttpOnly cookie (D-13/D-17, no student auth account).
- [Phase 03]: 03-02: Mission assignment is one atomic SECURITY DEFINER RPC (assign_mission_to_class, migration 202606250005) — assignment row + per-active-student rows + assigned status events in a single transaction (T-03-07).
- [Phase 03]: 03-02: Mission snapshot is assembled and validated server-side via missionSnapshotSchema before the RPC; the browser only passes mission id, class id, and optional due date (T-03-04). RPC verifies caller owns both class and mission before any insert (T-03-05).
- [Phase ?]: 03-03: Global focus-visible rings via root layout style block; aria-describedby wiring for field errors and help text; success auto-dismiss after 5 seconds.
- [Phase ?]: 04-01: Character profile uses DEFAULT_CHARACTER_ID import (no duplicate literal); placeholder evaluation version 'placeholder-v1' as const for Phase 6 swap detection
- [Phase ?]: 04-02: Read-time display status (start/continue/done/closed) computed from due_at + DB status without mutating rows (D-14)
- [Phase ?]: 04-03: Completion helpers key flow control on transcript + repeat_accepted only; evaluation field never read (D-06 isolation for Phase 6 swap)
- [Phase ?]: 04-03: GREATEST semantics for hint rollup via Math.max in app code (Supabase JS lacks SQL GREATEST in update)
- [Phase ?]: 04-03: Service functions accept studentId param from action layer; service-role logic stays isolated from cookie reads
- [Phase ?]: 04-04: Resume position computed SSR-side from existing attempt turns; 0-based startingTurnIndex passed to shell
- [Phase ?]: 04-04: Lazy attempt creation via ensureAttempt pattern -- startAttemptAction called only on first answer submit
- [Phase ?]: 04-04: HintRevealer uses display:none/block with aria-hidden for consistent disclosure DOM structure
- [Phase ?]: 04-05: completeAttempt re-derives completeness server-side via isAttemptComplete; client cannot force completion (T-04-15)
- [Phase ?]: 04-05: Completion audit event only written when conditional UPDATE succeeds (Pitfall 3 idempotency; no duplicate events)
- [Phase ?]: 04-05: Resume notice auto-dismisses after 5s or first answer submit, whichever comes first (D-04)
- [Phase ?]: 05-01: Upload/transcription remain later Phase 5 work; recorder callbacks pass Blob metadata without fake transcripts.
- [Phase ?]: 05-01: Browser recorder capability is runtime-detected with getUserMedia, MediaRecorder, and MIME support probing.
- [Phase 05]: 05-02: Store student audio in the private student-audio bucket; no public Storage URLs are returned to students.
- [Phase 05]: 05-02: Upload service verifies assignment_students.id and student_id before any Storage or audio_clips write.
- [Phase 05]: 05-02: Supabase db push was run successfully and remote storage.buckets reports student-audio public=false.
- [Phase 05-03]: OpenAI transcription is isolated in src/server/audio/transcription.ts and tests inject fake clients; no automated test calls the paid API. — Keep external API access server-only and paid-call-free during automated verification.
- [Phase 05-03]: Uploaded clips only return success after a transcript is present and audio_clips.processing_status is transcribed. — An uploaded clip alone is not useful speaking evidence until transcript text exists.
- [Phase 05-03]: Failed or empty transcription marks audio_clips.processing_status as failed and keeps students on the same recorder with retry copy. — This avoids fabricated transcript evidence and keeps failure recovery child-friendly.
- [Phase ?]: 05-05: Evidence navigation is exposed from the teacher class page because it is already scoped to an owned class and gives teachers student homework context.
- [Phase ?]: 05-05: Keep iOS Safari UAT deferred without real iPhone results or explicit risk acceptance; fixed product gaps are tracked separately.
- [Phase 06]: 06-01: Phase 6 behavior is locked first through RED tests; implementation remains in 06-02 through 06-04.
- [Phase 06]: 06-01: AI adapter tests use injected fake Responses clients and missing-key branches so automated verification makes no paid provider calls.
- [Phase 06]: 06-01: Source-contract checks guard client/server AI boundaries and keep OpenAI out of student client modules.
- [Phase 06]: 06-02: Mission draft generation returns validated drafts only; generated data is never saved until the teacher uses the existing mission save path.
- [Phase 06]: 06-02: OpenAI Responses integration stays server-only in src/server/ai/mission-generator.ts with fake-client injection for automated tests.
- [Phase 06]: 06-04: Repeat uploads evaluate the transcript against the improved sentence before setting repeat_accepted.
- [Phase 06]: 06-04: Teacher-review status changes are centralized in routeAssignmentStudentToTeacherReview and audited with actor_type ai_evaluator.
- [Phase 06]: 06-04: Existing teacher evidence shows AI annotations, while Phase 7 dashboard buckets and manual override UI remain out of scope.
- [Phase 07]: 07-03: overrideAssignmentStatusAction uses assertTransitionRequest for server-owned illegal-transition rejection; assignmentStudentId ownership anchored in RLS-authorized evidence load (T-07-06, T-07-07).
- [Phase 07]: 07-03: Dynamic .eq('status', asRow.status) claim guard in startOrResumeAttempt covers both assigned and needs_retry; reasonCode=reopened_by_teacher for needs_retry path (D-10, T-07-08).
- [Phase ?]: 07-04: Storage-first ordering in purgeExpiredAudio; CRON_SECRET !cronSecret check; zero-dependency stdout logger (PILOT-03, PILOT-04, T-07-10)
- [Phase 07]: Live UAT after 07-03 drove product changes beyond the plan: "closed" renamed to "late" (past-due assignments stay launchable), new "retry" display status for teacher-reopened attempts, completed->needs_retry added to LEGAL_TRANSITIONS, occurred_at column removed from override audit insert.
- [Phase 07]: Post-merge gate closed 2026-07-01 — assignment-list.test.ts expectations updated to match the late/retry rename, logger.test.ts vi.spyOn typecheck fixed via a typed helper function (commit c7039220). Full suite 33/33 files green, tsc clean.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 5]: RESOLVED 2026-07-01 — mobile mic/recording verified on real iOS Safari + Android Chrome; UAT 9/9 Pass, 05-04 closed.
- [Phase 6]: OpenAI model defaults, quality, and pricing should be rechecked before paid classroom pilots.
- [Milestone close]: Phase 02, Phase 04, and Phase 06 retain human_needed pilot-readiness checks; these were acknowledged and deferred at v1.0 closeout.

## Deferred Items

Items acknowledged and carried forward from v1.0 milestone close on 2026-07-01:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| verification | Phase 02 browser/manual sign-off items in 02-VERIFICATION.md | human_needed | 2026-07-01 |
| verification | Phase 04 device/manual sign-off items in 04-VERIFICATION.md | human_needed | 2026-07-01 |
| verification | Phase 06 live AI quality and browser draft round-trip in 06-VERIFICATION.md | human_needed | 2026-07-01 |

## Session Continuity

Last session: 2026-07-01T01:01:12.608Z
Stopped at: Milestone v1.0 archived locally; ready for /gsd-new-milestone.
Resume file: None
