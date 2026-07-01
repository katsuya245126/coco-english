---
phase: 06-ai-mission-and-turn-intelligence
verified: 2026-07-01T02:00:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
mode: mvp
re_verification: false
human_verification:
  - test: "With a real OPENAI_API_KEY loaded, generate 3 mission drafts and evaluate fixture transcripts covering correct-English, needs-correction, non-English, low-confidence/ambiguous, and repeat-accepted/retry paths."
    expected: "Drafts match the classroom target and the four evaluation dimensions (meaning, target-pattern attempt, improved sentence, repeat closeness) are sensible; low-confidence/ambiguous/failed-schema cases route to teacher review, not a false pass/fail. Record chosen model and confidence thresholds before pilot."
    why_human: "Automated tests use injected fake clients and must not make paid OpenAI calls. Live model quality and the exact confidence thresholds cannot be verified programmatically without real provider calls (per 06-VALIDATION.md manual-only row)."
  - test: "Open a mission with mode=create in a browser, click Generate draft (with live key), review the read-only preview, click Use draft, then edit fields and save/assign through the existing manual mission path."
    expected: "Preview renders title/target pattern/topic/level/turns/hints with no raw JSON, model name, or token counts; Use draft fills the editable form; save/assign works through createMissionAction unchanged."
    why_human: "The submitted Playwright specs are source-contract checks (string/import assertions), not runtime browser tests (06-REVIEW WR-04). A real render + generate + use-draft + save round-trip has not been exercised end-to-end."
notes:
  cosmetic_debt:
    - "06-UI-REVIEW (16/24): six student-facing contracted strings in StepAiEvaluationFeedback.tsx diverge from 06-UI-SPEC (e.g. 'Great!' vs 'Nice answer!', 'Better way to say it:' vs 'Nice try! Here is a clearer way to say it:', 'Please say it in English.' vs 'Try that in English.'). Non-goal-blocking copy debt; does not break any success criterion."
    - "repeatRetry now HAS a dedicated branch (StepAiEvaluationFeedback.tsx:152-176) with the spec heading 'Try the repeat again.' and body — the UI-REVIEW 'falls to generic fallback' finding is stale for the retry branch specifically."
    - "reviewPending heading now uses fontSize:20 (MissionFlowShell.tsx:598), on the 4-size scale — the UI-REVIEW fontSize:24 finding is stale."
    - "Remaining off-scale tokens noted by UI-REVIEW (annotation label 13/15, countdown bar #EF4444, evidence padding 20) are cosmetic and carried as Phase-7/backlog polish."
  code_review_blockers_resolved:
    - "CR-01 (mission-flow writes not scoped to owned attempt) — RESOLVED: loadOwnedAttempt (mission-flow.ts:81-96) scopes to both id and assignment_student_id; used in recordAnswer:374, recordRepeat:435, recordHintReveal:498, completeAttempt:574."
    - "CR-02 (uploads mutate closed/review attempts) — RESOLVED: audio-upload.ts enforces assignment status='started' (320-322) and attempt status='in_progress' (337-339) before any write."
    - "CR-03 (concurrent starts create duplicate attempts) — RESOLVED: startOrResumeAttempt checks the conditional-claim result (mission-flow.ts:296) and abandons the losing insert, then resumes the authoritative latest_attempt_id."
    - "CR-04 (no server-side byte/duration/MIME limits) — RESOLVED: MAX_AUDIO_BYTES/MAX_AUDIO_DURATION_MS/ALLOWED_AUDIO_MIME_TYPES enforced in isValidInput (audio-upload.ts:42-51,243-260) with file.type cross-check."
    - "WR-01 (out-of-snapshot turn orders) — RESOLVED: snapshot turn is resolved and rejected before the first attempt_turns upsert (audio-upload.ts:341-347)."
    - "WR-02 (completion returns ok even when writes fail) — RESOLVED: completeAttempt captures and checks update/insert/attempt-update errors (mission-flow.ts:624,642,660)."
    - "WR-03 (teacher-review flows into unpassable completion) — RESOLVED: finishTeacherReviewFeedback routes to reviewPending terminal state; teacherReview/repeatReview never call completeMissionAction (MissionFlowShell.tsx:367-373,540-546,570-576)."
    - "WR-04 (Playwright specs are source-contract only) — OPEN as WARNING: still string/import assertions; carried to human_verification item 2."
---

# Phase 6: AI Mission and Turn Intelligence Verification Report

**Phase Goal:** AI accelerates mission creation and turn evaluation while structured validation, confidence handling, and server rules keep outcomes reliable.
**Verified:** 2026-07-01T02:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (filling the missing VERIFICATION.md gap)
**Mode:** mvp

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Teacher can generate a draft mission from target pattern, topic, level, required turns, and due date | ✓ VERIFIED | `missionDraftInputSchema` accepts all five fields (`src/domain/ai/mission-generation.ts:7-32`); `generateMissionDraftAction` requires teacher auth then calls generator (`src/app/teacher/missions/actions.ts:166-193`); `MissionDraftPanel` gathers targetPattern/topic/level/requiredTurns and calls the action (`src/components/teacher/MissionDraftPanel.tsx:41-64`). Tests: `tests/server/ai-mission-generator.test.ts`, `tests/domain/mission-generation.test.ts` pass. |
| 2 | Teacher can preview and edit the generated mission before assignment | ✓ VERIFIED | Read-only `DraftPreview` renders title/target/topic/level/turns/hints (`MissionDraftPanel.tsx:144-196`); `Use draft` calls `onUseDraft` → `applyMissionDraft` fills editable form state (`MissionForm.tsx:56-62,109-117`); save/assign stays on unchanged `createMissionAction`/`assignMissionAction` paths (`actions.ts:72-95,130-164`). |
| 3 | System rejects generated mission output that does not match the strict mission schema | ✓ VERIFIED | `generatedMissionDraftSchema` with `requiredTurns===turns.length` and target-examples refinements (`mission-generation.ts:39-74`); `parseGeneratedMissionDraft` returns `schema_failed` (82-92); generator revalidates `output_parsed` locally after provider parse (`mission-generator.ts:121-127`); action maps `schema_failed` → safe copy (`actions.ts:188-189`). Malformed-output rejection test passes. |
| 4 | System evaluates meaning, target-pattern attempt, improved target-form sentence, and repeat closeness for each turn | ⚠️ see note | Structure fully present: `originalTurnEvaluationSchema` carries `meaningUnderstood`, `targetPatternAttempted`, `improvedSentence`, plus `repeatCloseEnough` in `repeatTurnEvaluationSchema` (`turn-evaluation.ts:25-53`); evaluated per turn in `uploadAttemptAudioClip` (`audio-upload.ts:441-524`); all four surfaced in teacher evidence (`audio-evidence.ts:71-192`, evidence page renders "Communicated clearly?/Used the target language?/Repeated correctly?" + improved sentence). Domain/routing tests pass with fake clients. LIVE model quality is manual-only (human item 1). |
| 5 | System routes low-confidence, failed-schema, or ambiguous AI results to teacher review instead of pretending certainty | ✓ VERIFIED | `decideOriginalTurnOutcome`/`decideRepeatTurnOutcome` route low-confidence, uncertain, reviewReason, and teacher_review outcomes to a `teacher_review` decision (`turn-evaluation.ts:119-211`); schema/provider failures produce `failed_schema`/`provider_failed` review decisions (103-117,170-184); service-owned `routeAssignmentStudentToTeacherReview` writes audited `teacher_review` status + `needs_review_reason` from app code, never raw AI output (`mission-flow.ts:100-178`); completion refuses teacher_review/malformed turns (`completion.ts:16-53`). Routing behavior is exercised by passing tests. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified). SC-4's structure and routing are code-verified and test-covered; only live model *quality/thresholds* remain manual (human item 1), which does not reduce the structural score.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/domain/ai/mission-generation.ts` | Strict draft schemas + parser | ✓ VERIFIED | Substantive; refinements enforce turn count and examples; wired into generator + action. |
| `src/server/ai/mission-generator.ts` | Server-only OpenAI adapter, fake-client injectable | ✓ VERIFIED | Injected client via deps; local revalidation; narrow errors. |
| `src/domain/ai/turn-evaluation.ts` | Versioned eval schemas + decision helpers | ✓ VERIFIED | Four dimensions + review routing; pure module. |
| `src/server/ai/turn-evaluator.ts` | Server-only original/repeat evaluators | ✓ VERIFIED | Fake-client injection; schema-failed/provider-failed handling. |
| `src/components/teacher/MissionDraftPanel.tsx` | Generate/preview/use-draft UI | ✓ VERIFIED | Preview + Use draft + safe failure copy; no raw JSON/model/tokens. |
| `src/components/teacher/MissionForm.tsx` | Draft handoff to editable form | ✓ VERIFIED | `applyMissionDraft` fills state; create-mode composition only. |
| `src/components/student/StepAiEvaluationFeedback.tsx` | Outcome feedback UI | ✓ VERIFIED (copy debt) | All outcome branches present incl. dedicated repeatRetry; some copy strings diverge from UI-SPEC (cosmetic). |
| `src/server/student-access/audio-upload.ts` | Post-transcription evaluation + routing | ✓ VERIFIED | Status/size/MIME/snapshot guards; app-owned writes; review routing. |
| `src/server/student-access/mission-flow.ts` | Owned writes + audited review routing | ✓ VERIFIED | loadOwnedAttempt scoping; audited teacher_review routing; checked completion writes. |
| `src/domain/flow/completion.ts` | App-owned completion accepting accepted-original/accepted-repeat | ✓ VERIFIED | Rejects teacher_review/malformed evaluation. |
| `src/app/teacher/missions/actions.ts` | Teacher-auth draft action | ✓ VERIFIED | requireTeacherProfile before generation; UI-safe error mapping. |
| `src/server/teacher/audio-evidence.ts` | Evidence annotation mapping | ✓ VERIFIED | Maps meaning/target/repeat/review-reason from stored bounded fields. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| MissionDraftPanel | generateMissionDraftAction | onClick → action (teacher-auth) | WIRED |
| generateMissionDraftAction | generateMissionDraft | server-only adapter | WIRED |
| MissionDraftPanel `Use draft` | MissionForm state | onUseDraft → applyMissionDraft | WIRED |
| audio route/service | evaluateOriginalTurn/evaluateRepeatTurn | post-transcription, fake-injectable | WIRED |
| audio-upload teacher_review | routeAssignmentStudentToTeacherReview | service-owned audited status write | WIRED |
| turn evaluation | teacher evidence page | stored eval → audio-evidence mapping → page render | WIRED |
| client/student components | OpenAI | (must be absent) | CORRECTLY ABSENT (no openai import in src/components or src/app/student) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 6 domain + server + evidence suites (fake clients only, no paid calls) | `npx vitest run tests/domain/mission-generation.test.ts tests/domain/turn-evaluation.test.ts tests/server/ai-mission-generator.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts tests/server/audio-upload.test.ts tests/server/audio-evidence.test.ts` | 47 passed (7 files) | ✓ PASS |
| Teacher-review routing state transition (SC-5) | included in student-mission-flow + audio-upload suites | route-to-review cases pass | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| MISS-02 | Generate draft from target/topic/level/turns/due | ✓ SATISFIED | SC-1 evidence |
| MISS-03 | Preview and edit before assigning | ✓ SATISFIED | SC-2 evidence |
| MISS-05 | Strict schema validation before assign | ✓ SATISFIED | SC-3 evidence |
| AI-01 | Evaluate meaning understandable | ✓ SATISFIED | `meaningUnderstood` → evidence "Communicated clearly?" |
| AI-02 | Evaluate target-pattern attempt | ✓ SATISFIED | `targetPatternAttempted` → "Used the target language?" |
| AI-03 | Produce better target-form sentence | ✓ SATISFIED | `improvedSentence` (needs_correction path + evidence transcript) |
| AI-04 | Evaluate repeat closeness for level | ✓ SATISFIED | `repeatCloseEnough` → repeat decision + "Repeated correctly?" |
| AI-05 | Route low-confidence/failed-schema/ambiguous to teacher review | ✓ SATISFIED | SC-5 evidence |

No orphaned requirements. All 8 declared requirements have code + test evidence.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| (none) | No TBD/FIXME/XXX debt markers in Phase 6 files | — | Completion is auditable. |
| StepAiEvaluationFeedback.tsx | Copy strings diverge from UI-SPEC | ℹ️ Info (cosmetic) | Does not break any success criterion; carried as UI polish debt. |

### Human Verification Required

1. **Live AI quality + thresholds (SC-4)** — With a real key, generate 3 drafts and evaluate fixture transcripts across all outcome paths; confirm the four dimensions and review routing are sensible and record model/thresholds before pilot. *Why human:* paid calls are excluded from automated tests.
2. **Runtime teacher draft round-trip (SC-1/SC-2)** — In a browser, generate → preview → Use draft → edit → save/assign; confirm no raw JSON/model/tokens surface. *Why human:* submitted Playwright specs are source-contract only (06-REVIEW WR-04).

### Gaps Summary

No goal-blocking gaps. All five success criteria are met in code and covered by passing fake-client tests. The four Phase-6 code-review BLOCKERs (CR-01..CR-04) and three warnings (WR-01..WR-03) are resolved in the current source; only WR-04 (source-contract-only e2e) remains as a testing-quality warning, folded into human verification item 2. Remaining UI-copy/typography divergences from 06-UI-SPEC are cosmetic debt and do not fail any criterion. Status is `human_needed` (not `passed`) solely because live-model quality and a runtime browser round-trip cannot be verified programmatically — both are pre-pilot manual checks, not missing implementation.

Milestone-completion assessment: **does not block** milestone v1.0 completion on implementation grounds. The two human items are pilot-readiness confirmations, consistent with the 06-VALIDATION.md manual-only rows.

---

_Verified: 2026-07-01T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
