---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Coco Comes Alive
current_phase: 10.1
current_phase_name: assignment-operations-student-history
status: phase_complete
stopped_at: Completed 10.1-10-PLAN.md — Phase 10.1 complete
last_updated: "2026-07-14T14:20:30+09:00"
last_activity: 2026-07-14
last_activity_desc: Completed Phase 10.1 with the live per-class review-policy UI, bidirectional queue regression, and full repository gate passing
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 34
  completed_plans: 27
  percent: 79
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.
**Current focus:** Phase 10.1 — assignment-operations-student-history

## Current Position

Phase: 10.1 (assignment-operations-student-history) — COMPLETE
Previous phase: 10 (mascot-vn-style) — COMPLETE
Plan: 12 of 12 complete
Status: Phase 10.1 complete — ready for phase verification and Phase 11
Active feature work: dismiss-incomplete and clickable no-attempt assignment evidence are implemented on `feature/dismiss-incomplete-assignment`; migrations `202607120003`, `202607120004`, and `202607120005` are live. Both by-ID and attempt-keyed dismiss/undo paths are state-sensitive. Final verification is 547 passed / 4 skipped with typecheck and build clean, lint at zero errors / one pre-existing warning, and the live review-policy Playwright regression 5/5.
Quick task 260710-hbn completed the interrupted student retry/audio feedback work in commit `33779fa1`. The follow-up `retry-feedback-flow` debug session fixed final-turn review gating, repeat retry audio/actions, and transcript carryover. The subsequent code-review follow-up removed the unsafe grammar-only fill-in bypass, moved mission completion into a deployed atomic RPC, restored persisted feedback/audio on refresh, included evaluation in resume decisions, and fixed Coco playback teardown. Those follow-ups are complete and Phase 10 remains closed.
The `mobile-mascot-position` debug follow-up reproduced Coco at 226px wide on desktop but only 133px on a 375px phone. Responsive clamped insets now preserve the desktop framing at 226px on both standard phone and desktop widths without changing stage, dialogue, or recorder geometry.
The `mobile-mascot-dialogue-gap` follow-up measured the portrait sprites' visible alpha edge and raised the dialogue box from bottom 24px to 32px, increasing its overlap with visible fur while leaving Coco's frame and scale unchanged.
The `mission-create-retry-cleanup` follow-up found mission creation itself was healthy: an active dev server had been corrupted when production builds rewrote its `.next` chunks, leaving the form unhydrated and causing native GET submission. A clean restart restored two verified real saves. The retry route now honors `needs_retry` past the original deadline, and the teacher AI mission-draft feature was removed end-to-end. Phase 11's roadmap now requires standalone scene-premise generation rather than restoring full mission drafting.

Last activity: 2026-07-14 — Completed Phase 10.1 with the live per-class review-policy UI, bidirectional queue regression, and full repository gate passing

Progress: [████████░░] 79%

**Codex handoff (merged to main 2026-07-05, branch feature/per-student-sound-profile deleted):**

- Per-student sound-profile work (committed by Codex): phoneme-level diagnostics, aggregator, teacher detail page, roster linking, clip reprocess.
- Sound-profile follow-on threaded through turn evaluator / audio upload / student flow (commit b67fce37).
- Mission archiving + cancel-assignments feature: migration 202607050001 (missions.archived_at, assignments.canceled_at) already pushed live to Supabase; archived view, archive/restore actions, assignment dialog (commit 63682dca). Fixes a `missions.archived_at does not exist` runtime error on /teacher/missions.
- Coco mascot sprite set (7 expressions + alpha variants) committed for Phase 10 (commit 8661cb65); .planning/debug/ alpha-pipeline scratch is now gitignored.
- Stale recorder-cap test corrected 20s → 60s to match shipped 52ea4c17. Full suite 411 passed / 4 skipped, tsc clean.
- None of the above is tracked as its own GSD phase/plan — it landed via the Codex handoff.

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
| Phase 09 P03 | 6min | 3 tasks | 8 files |
| Phase 09 P01 | 3min | 3 tasks | 2 files |
| Phase 09 P02 | 30min | 3 tasks | 2 files |
| Phase 09 P04 | 12min | 1 tasks | 2 files |
| Phase 10.1 P01 | 5min | 3 tasks | 5 files |
| Phase 10.1 P05 | 5min | 1 tasks | 4 files |
| Phase 10.1 P08 | 35min | 3 tasks | 3 files |
| Phase 10.1 P11 | 3min | 2 tasks | 4 files |
| Phase 10.1 P09 | 3min | 2 tasks | 6 files |
| Phase 10.1 P10 | 7 min | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 Roadmap]: Phases 8-12 map 1:1 to the five point releases (v2.1-v2.5) in dependency order: Voice -> Pronunciation (independent) -> Mascot (needs Voice) -> Coco Chat (needs Voice+Mascot) -> UI Overhaul (needs all). All 23 v2.0 requirements mapped, no orphans.
- [v2.0 Roadmap]: Phase 11 (Coco Chat) flagged as highest research risk (drift/moderation/transcript UX); Phase 9 (Pronunciation) needs an Azure-accuracy validation pass against real stored student audio; Phase 10 (Mascot) needs a Rive-vs-static-sprite spike before art starts.
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
- [Phase ?]: Phase 8 Plan 05: Task 1 voice wiring for transition/completion was already complete from Plan 04 (commit 36de2edb); Plan 05 fixed pre-existing tsc/eslint errors in tts-cache.test.ts blocking verification and recorded full automated verification evidence in 08-VERIFICATION.md.
- [Phase 08]: Closed 2026-07-02 after preview deployment smoke test on Samsung S23 and Mac. Chromebook/older-tablet VOICE-04 coverage was unavailable and explicitly accepted as residual risk; see 08-VERIFICATION.md.
- [Phase 09]: 09-03: Azure recognizer wired through an injectable PronunciationRecognizerFactory returning a plain PronunciationRecognitionRaw shape so tests never construct a real SDK SpeechRecognizer or call the paid Azure API; guard order missing_api_key -> audio_too_long -> transcode_failed -> provider_failed.
- [Phase 09]: 09-01: Azure AI Speech data-use note confirmed accurate by operator; Azure Speech resource (F0 tier) provisioned with AZURE_SPEECH_KEY/AZURE_SPEECH_REGION set in local .env — PRON-02 pre-send gate satisfied before any downstream plan calls the live Azure API.
- [Phase 09]: 09-02: pronunciation_scores table pushed live via user-run supabase db push; is_audio_clip_owner RLS helper extends is_attempt_turn_owner's ownership chain one join-hop; checkpoint independently verified read-only via supabase migration list rather than trusted blindly.
- [Phase ?]: 09-04: Reference text passed to scorePronunciation is the turn's target/improved sentence, not the raw transcript; scoring is started concurrently with turn evaluation and awaited only after turnWrite succeeds
- [Phase 09]: 09-05 calibration sample report generated 2026-07-03 from 12 pre-app homework recordings (9 m4a, 3 amr). Current thresholds (`great >=80`, `good >=60`) yielded 2x 3-star, 7x 2-star, 3x 1-star. Local reports live at `/Users/john/Downloads/calibration-samples/calibration-report.md` and `.json`; threshold approval remains pending.
- [Phase 09]: 09-05 calibration found the Azure SDK helper can fail on longer phrase-list samples with `throwIfNullOrUndefined:json` even when raw Azure JSON contains valid pronunciation/phoneme data. Future phoneme-level parsing should prefer raw `NBest[0].PronunciationAssessment`, `Words`, and `Phonemes` fields.

- [Phase 09]: 09-06 shipped starBand end-to-end through the upload result, route JSON, MissionFlowShell, and a new PronunciationStars sub-component in StepAiEvaluationFeedback; checkpoint manually verified. Phase 09 is now fully complete (6/6 plans).
- [Phase 09]: During 09-06 checkpoint verification, two bugs were found and fixed via debug sessions (see `.planning/debug/resolved/`): original-answer words-to-practice used the target sentence as reference text instead of the transcript (could yield empty chips on a diverging free-form answer); teacher-review outcomes still passed a retry handler that led to a guaranteed `audio_upload_failed`. Both fixed with regression tests.
- [Phase 09]: Additional out-of-roadmap fixes landed in the same commits: Korean-transcript rejection in transcription/audio-upload, mission deletion in the teacher mission list, and a login-page "back to role choice" link. None of these are tracked as their own phase/plan — see `09-06-SUMMARY.md` follow-up section.
- [Phase ?]: 10.1-08: Recap feedback heading is 'Pronunciation' and all-clear line is 'Great job!' (user-specified at checkpoint); practice lead-in 'Words to practice:' matches mission-flow idiom
- [Phase ?]: 10.1-08: Recap back control is an arrow-only 44x44 solid-primary button with aria-label and hover/active states; !important needed because inline base style beats stylesheet hover rules
- [Phase 10.1]: 10.1-09: Needs review derives from each class live review policy while All activity remains policy-independent; policy writes require authenticated ownership and an exact two-value allowlist.
- [Phase 10.1]: 10.1-12: Recap and live mission feedback share wordsToPractice with the displayed original-or-accepted-repeat transcript; the component consumes a practice-only list.
- [Phase 10.1]: 10.1-10: Class review-policy changes remain server-confirmed until persistence succeeds; successful changes refresh Needs review while All activity remains policy-independent.

### Pending Todos

None currently pending.

### Blockers/Concerns

- [Phase 5]: RESOLVED 2026-07-01 — mobile mic/recording verified on real iOS Safari + Android Chrome; UAT 9/9 Pass, 05-04 closed.
- [Phase 6]: OpenAI model defaults, quality, and pricing should be rechecked before paid classroom pilots.
- [Milestone close]: Phase 02, Phase 04, and Phase 06 retain human_needed pilot-readiness checks; these were acknowledged and deferred at v1.0 closeout.
- Phase 8 VOICE-04 residual risk: Samsung S23 + Mac smoke tests passed, but Chromebook/older-tablet coverage was unavailable and accepted at closeout. Re-test on older school hardware when available, especially before broad classroom rollout.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260710-hbn | Finish interrupted retry feedback UI and verification | 2026-07-10 | 33779fa1 | [260710-hbn-finish-the-interrupted-retry-feedback-ui](./quick/260710-hbn-finish-the-interrupted-retry-feedback-ui/) |

### Roadmap Evolution

- Phase 10.1 inserted after Phase 10 and planned in 7 plans across 4 waves: Assignment Operations & Student History (URGENT)

## Deferred Items

Items acknowledged and carried forward from v1.0 milestone close on 2026-07-01:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| verification | Phase 02 browser/manual sign-off items in 02-VERIFICATION.md | human_needed | 2026-07-01 |
| verification | Phase 04 device/manual sign-off items in 04-VERIFICATION.md | human_needed | 2026-07-01 |
| verification | Phase 06 live AI quality and browser draft round-trip in 06-VERIFICATION.md | human_needed | 2026-07-01 |

## Session Continuity

**Resume file:** None

**Handoff docs:** `.planning/handoff/` holds two 2026-07-10 session handoffs (mascot-audio-copy, audio-reclick-still-broken), committed 2026-07-11 as historical records — every open item in them has since landed: the replay re-click silence was resolved in `33779fa1` by removing Web Audio entirely from `CocoSpeechAudio.tsx` (native `<audio>` playback + synthetic mouth pulse; never reintroduce `createMediaElementSource` — a source test bans it), the terse "Say this sentence:" repeat-card label and the sprite-framing/dialogue-box overlap fixes landed in the same commit and the mobile follow-ups `f87766f5`/`7a599097`. Audible replay confirmation remains user-ear-only (agent preview and driven-Chrome tabs can't produce sound) and is folded into the existing Task 3 checkpoint.

Last session: 2026-07-14T05:20:27.241Z
Stopped at: Completed 10.1-10-PLAN.md — Phase 10.1 complete
Note: Branch `phase-10-mascot-wip` is fully merged and can still be deleted (not yet done — ask before deleting). `.planning/phases/11-coco-chat-dynamic-turns-scene-framing/` is active again now that Phase 10 is back to the mascot. Phase 13 (Pronunciation Remediation Videos, MEDIA-F1) is new — not yet planned, no phase directory exists yet. Two incidental fixes landed this session outside Plan 10-04's own scope: `d104f16d` (CocoSpeechAudio analyser-ordering bug, found uncommitted, directly tied to the MASCOT-02 wiring) and `58bcc921` (repeat-turn exact-match fast-path, committed independently by the user during the same session — unrelated to Phase 10, not reviewed here).
