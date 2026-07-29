# Test Suite Inventory

Date: 2026-07-29
Baseline SHA: `c34930bd`

## Purpose

This inventory ranks test case groups by maintenance disposition. It does not
rank product importance and does not impose a test-count target.

Dispositions:

- **Keep** — unique or intentionally independent behavior coverage.
- **Consolidate** — retain the behavior but reduce same-boundary duplication.
- **Convert** — retain the behavior at a stable public boundary instead of
  source/CSS/JSX text.
- **Delete** — no supported behavior or equal/stronger retained ownership.

When a file contains several kinds of tests, the exceptions below override its
default file-level disposition.

## Fresh Baseline

| Check | Result |
| --- | --- |
| Vitest inside restricted sandbox | 1,394 passed, 4 skipped, 3 failed because localhost `listen()` returned `EPERM` |
| Vitest with local-port permission | 102 files passed; 1,397 passed, 4 skipped; 9.82s |
| Playwright inventory | 26 tests in 9 files |
| Test/spec files | 111 |
| Test lines | 28,329 |
| Declared `it`/`test` calls | 1,201 |

The three sandbox failures belonged to
`tests/scripts/uat-worktree-runtime.test.ts`; the identical full command passed
when temporary localhost binding was permitted.

## Protected Keep Groups

| Case group | Boundary and ownership |
| --- | --- |
| `tests/schema/*.test.ts` | Migration/RPC/RLS contracts. Migration SQL is currently the executable artifact; keep until equal database-backed coverage exists. |
| `tests/server/teacher-ownership.test.ts`, `student-access.test.ts`, `assignment-student-evidence.test.ts`, `audio-evidence.test.ts`, `student-history.test.ts`, `purge-audio.test.ts`, `teacher-override.test.ts`, `teacher-review-actions.test.ts` | Independent authorization, ownership, private audio, signed URL, evidence, and auditable transition checks. |
| `tests/server/assignment-list.test.ts`, `teacher-assignment-operations.test.ts`, `mission-assign.test.ts`, `mission-service.test.ts`, `mark-missed-*.test.ts` | Server-owned assignment lifecycle and queue behavior. |
| `tests/server/audio-upload.test.ts` | Preset-mode upload, validation, persistence, pronunciation, private storage, and learner-safe projection owner. |
| `src/server/student-access/audio-upload.test.ts` | Conversation-mode moderation, generation, fallback, hard-cap, history, and persistence owner. Kept separate from the preset suite because the Supabase shapes and assertions intentionally diverge. |
| `src/server/student-access/mission-flow.test.ts` | Mission-flow persistence owner. |
| Remaining cases in `tests/server/mission-flow.test.ts` | Resume-state derivation and completion RPC owner. |
| `tests/server/student-mission-flow.test.ts` | Student route/action projection and AI-routing owner. |
| `tests/domain/turn-evaluation.test.ts` | Deterministic decision-policy owner. |
| `tests/server/turn-evaluator.test.ts` | Provider adapter, prompt envelope, schema, repair, and failure-mapping owner. |
| `src/domain/ai/conversation-generation.test.ts` | Deterministic generated-line policy owner. |
| Remaining cases in `src/server/ai/conversation-generator.test.ts` | Provider-call, correction retry, logging, and stateless payload owner. |
| Translation hint domain/cache/generator/source suites | Separate page/phrase policy, caching, provider adapter, and route-source boundaries. Fixtures differ enough that a shared abstraction would add indirection without removing behavior. |
| Pronunciation, transcription, TTS, audio-transcode, and reprocess suites | Provider boundary, scoring, cache, failure, and packaging behavior. |
| `tests/domain/ai-boundary.test.ts` | Intentional architecture scan preventing student-side provider imports and chat routes. |
| Other `tests/domain/*.test.ts` and `src/domain/**/*.test.ts` | Pure algorithms, parsing, schemas, pagination, detection, hints, transcript interpretation, fallbacks, and regression matrices. Table-generated cases are retained as cheap boundary examples. |
| `tests/scripts/*.test.ts` | UAT launcher selection/preflight and packaging behavior. Port-binding tests require local-port permission under the managed sandbox. |
| Component tests under `src/components/student/` | Rendered state, semantic controls, accessibility, failure, and interaction behavior. Exact CSS exceptions are deleted below. |
| Browser cases in `tests/e2e/` that navigate or use `page` | Actual authentication, join, mission, history, teacher, mobile, and permission behavior. Environment-gated cases remain explicitly skipped when fixtures are unavailable. |

## Source Contract Review

| Group | Disposition | Rationale |
| --- | --- | --- |
| `tests/domain/tts-ui-source.test.ts` | Keep pending individual conversion | The file is brittle, but its cases encode distinct phone-UAT regressions: stale request cancellation, translation paging, audio privacy, latest-attempt lookup, replay-silence prevention, final-closing descriptors, and first-paint/layout constraints. Removing it wholesale would lose unique coverage. New behavior work must replace cases one by one, then delete the predecessor. |
| `tests/server/teacher-workspace-ui.test.ts` | Keep as demonstrated packaging/UI regression contracts | These checks primarily guard first-paint FOUC, real stylesheet packaging, bounded queue surfaces, and prior UAT layout regressions. The four duplicate Playwright source cases were deleted instead. |
| `tests/domain/conversation-submission-recovery.test.ts` source case | Convert when a testable shell seam exists | The behavior matters, but `MissionFlowShell` is not currently mounted by a focused component harness. The approved task forbids production refactoring solely for testability, so the source canary remains until a separate UI-flow change supplies the seam. |
| Schema SQL source reads | Keep | SQL text is the migration artifact and the suite lacks a mandatory local Supabase harness. |
| `tests/domain/ai-boundary.test.ts` | Keep | Static architecture policy is the behavior. |

## Completed Conversion Ledger

| Removed case | Disposition | Retained owner or replacement |
| --- | --- | --- |
| `student-coco-voice.spec.ts`: rejected autoplay source scan | Convert | `CocoSpeechAudio.test.tsx`: renders signed audio, rejects `play()`, and proves replay remains enabled without error copy. |
| `student-coco-voice.spec.ts`: playback-error source scan | Convert | `CocoSpeechAudio.test.tsx`: dispatches an audio error and proves the visible unavailable status and disabled control. |
| Four source-only cases in `teacher-assignment-operations.spec.ts` | Delete duplicate | UI/source owners remain in `teacher-workspace-ui.test.ts`; policy decisions remain in `assignment-operations.test.ts`; server filtering remains in `teacher-assignment-operations.test.ts`; mutation ownership remains in `teacher-review-actions.test.ts`. The live policy-switch Playwright case remains. |

No source-reading test remains under `tests/e2e/`.

## Completed Deletion Ledger

| Deleted case group | Reason and retained evidence |
| --- | --- |
| Six export-existence tests in `tests/server/mission-flow.test.ts` | Imports compile under `npm run typecheck`; retained service/action and route tests actually call the exports. |
| Placeholder hint-order test containing only `expect(true).toBe(true)` | It exercised no production code and could never catch a regression. |
| Database generated-type runtime test in `tests/server/audio-upload.test.ts` | Production imports compile under typecheck; migration/private-bucket behavior and real upload code remain covered. |
| `previous_response_id` implementation-file scan in `conversation-generator.test.ts` | Three retained provider-call assertions inspect serialized request payloads and prove stateless calls at the supported boundary. |
| `HomeworkReview` exact CSS-module test | Copy, transcript projection, correction rendering, and semantic recap output remain covered; exact widths, radii, and class identifiers are not supported behavior. |
| `HomeworkReviewAttempt` exact CSS-module test | Loading, caching, error, expiry, clip isolation, authorized playback, and transcript omission remain rendered behavior tests. |
| Exact CSS layout assertions embedded in `CompactAudioPlayer` error test | The retained test proves semantic controls, error placement outside the control row, and stable interaction; exact CSS display/min-width values were implementation detail. |

## Consolidation Decisions

| Candidate | Decision |
| --- | --- |
| Two audio-upload suites | Keep separate. Their duplicated setup is visible, but one generic Supabase builder would need many mode flags and obscure preset/conversation ownership. That abstraction would be more overengineered than the duplication. |
| Domain and server AI suites | Keep separate. Domain policy and provider-adapter behavior fail for different reasons. Only the redundant source scan was removed. |
| Three mission-flow suites | Retain explicit boundary ownership after deleting export/scaffold cases: persistence, resume derivation, and route projection. |
| Translation suites | Retain layer separation; do not introduce a cross-layer fixture package for a small line reduction. |

## Final Ranking Rule

All unlisted cases are **Keep** by default. Future deletion requires adding a
row naming an equal-or-stronger retained owner. Future source-contract
conversion must land the behavioral replacement before removing the canary.

## Final Comparison

| Metric | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Vitest passed | 1,397 | 1,388 | -9 |
| Vitest skipped | 4 | 4 | 0 |
| Vitest files | 102 | 103 | +1 behavioral component suite |
| Playwright inventory | 26 | 20 | -6 source-only cases |
| Test/spec files | 111 | 112 | +1 behavioral component suite |
| Declared `it`/`test` calls | 1,201 | 1,186 | -15 |
| Test lines | 28,329 | 28,207 | -122 |
| Full Vitest duration | 9.82s | 9.27s | -0.55s |

The count reduction is deliberately modest. The cleanup removes clear
zero-value and duplicate cases while retaining source contracts that still own
documented UAT or architecture behavior.
