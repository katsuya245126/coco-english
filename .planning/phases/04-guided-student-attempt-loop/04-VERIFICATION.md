---
phase: 04-guided-student-attempt-loop
verified: 2026-06-27T11:05:00Z
status: human_needed
score: 5/5
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Full mission walk on phone browser"
    expected: "Student opens homework list, taps Start, sees buddy question (Coco asks:), types an answer, sees improved sentence, types repeat, advances through all required turns, sees Mission complete!, taps Back to homework, returns to assignment list showing Done badge."
    why_human: "End-to-end runtime behavior through SSR + Supabase requires a running server and seeded data. Grep confirms all components exist and are wired, but the multi-step user flow needs visual confirmation on a real device or emulator."
  - test: "Resume mid-mission shows Welcome back notice"
    expected: "Re-entering an in-progress mission shows the resume notice (Welcome back! Picking up where you left off.) above the step card, auto-dismissing after 5 seconds or on first submit."
    why_human: "Timer-based auto-dismiss and client-state restoration on SSR re-entry are runtime behaviors that grep/presence checks cannot exercise."
  - test: "Closed/expired assignment shows non-interactive card with explanation"
    expected: "A past-due assignment displays as a non-interactive card with Closed badge and the explanation text (This homework is not open right now. Ask your teacher what to do next.) and cannot be tapped to launch the mission."
    why_human: "Read-time expired status computation depends on server clock vs due_at comparison at runtime."
  - test: "Empty assignment list preserves No homework yet state"
    expected: "A student with zero assigned homework sees the existing No homework yet empty state."
    why_human: "Visual regression check for the empty-state preservation."
---

# Phase 4: Guided Student Attempt Loop Verification Report

**Phase Goal:** Students can move through the assigned speaking mission with a supportive buddy, meaning-first correction, required repetition, hints, and deterministic completion.
**Verified:** 2026-06-27T11:05:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Student can see assigned homework and start the mission on common phone and tablet browser sizes | VERIFIED | `src/server/student-access/assignment-list.ts` reads assignment_students joined to assignments via service-role scoped to `unlock.studentId`. `src/components/student/AssignmentListItem.tsx` renders Start/Continue as `<a href="/student/missions/{id}">` links, Done/Closed as non-interactive divs. `src/app/student/home/page.tsx` SSR-loads via `listStudentAssignments` behind unlock gate. Layout enforced at 420px maxWidth via `panelStyle`. E2e test `tests/e2e/student-mission.spec.ts` asserts mobile viewport 375x812 content within 420px (PILOT-01). |
| 2 | Buddy asks short classroom-safe questions tied to the assigned mission and cannot continue into open-ended private chat | VERIFIED | `src/domain/character/profile.ts` defines static Coco profile with reviewed classroom-safe copy. `src/components/student/StepBuddyQuestion.tsx` renders `{prompt}` from snapshot turn data via profile `questionLabel`. AI-06 structural test (`tests/domain/ai-boundary.test.ts`, 2 tests GREEN) scans all student-facing dirs for forbidden AI/LLM/chat imports -- zero violations. No chat route, no AI client import, no `dangerouslySetInnerHTML` in any student component. CHAR-03 guard test in `tests/domain/character-profile.test.ts` asserts disallowed substring absence. |
| 3 | System shows a better target-form sentence after the student's original answer and requires a repeat attempt | VERIFIED | `src/components/student/StepImprovedRepeat.tsx` receives `targetExample` prop (snapshot's target-form sentence) and renders it in `improvedSentenceCardStyle`. Repeat input requires non-empty text with validation error "Type the sentence before submitting." `src/components/student/MissionFlowShell.tsx` advances from "question" to "repeat" step only after `submitAnswerAction` succeeds, storing `originalAnswer` for read-only display. Step machine is `useState`-based, one card at a time (D-12). |
| 4 | Student can reveal progressive hints in order: target pattern, word bank, then full example | VERIFIED | `src/components/student/HintRevealer.tsx` defines TIER_LABELS (tier1 Pattern, tier2 Word bank, tier3 Full example) with strict sequential disclosure: `onReveal(hintLevel + 1)`, disabled at level 3 ("All hints shown"). `aria-expanded` toggles on button, `aria-hidden` on unrevealed tiers. Parent `MissionFlowShell.tsx` calls `revealHintAction` fire-and-forget (record-only, D-08 -- never gates completion). Server-side `recordHintReveal` in `mission-flow.ts` uses `Math.max` (GREATEST semantics) for hint rollup, validates hintLevel 1..3. |
| 5 | Mission completes only after the required number of turns and repeat attempts are satisfied | VERIFIED | `src/domain/flow/completion.ts` implements `isAttemptComplete` gating on non-empty trimmed `original_transcript` + non-empty trimmed `repeat_transcript` + `repeat_accepted === true` for every required turn. Zero references to `evaluation` field in code (3 comment-only mentions). `src/server/student-access/mission-flow.ts` `completeAttempt` re-derives completeness server-side via `isAttemptComplete` from DB turns, writes audited `started->completed` transition via `assertTransitionRequest` + `assignment_status_events` row, stamps `attempts.completed_at` + `assignment_students.submitted_at`. Idempotent via conditional UPDATE `WHERE status='started'`. `MissionFlowShell.tsx` calls `completeMissionAction` only on final-turn repeat success. 15 completion tests + 6 completeAttempt tests all GREEN (26 total in `mission-flow.test.ts`). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/character/profile.ts` | CharacterProfile + getCharacterProfile resolver with Coco default buddy | VERIFIED | 47 lines, exports `CharacterProfile` type, `DEFAULT_BUDDY` (Coco), `getCharacterProfile`, `CHARACTER_PROFILES`. Imports only `DEFAULT_CHARACTER_ID` from `@/domain/mission/schemas`. Zero server/DB/AI imports. |
| `src/domain/flow/evaluation.ts` | Placeholder-v1 evaluation builder (D-02 swap point) | VERIFIED | 32 lines, exports `PLACEHOLDER_EVALUATION_VERSION` ("placeholder-v1" as const), `PlaceholderEvaluation` type, `buildPlaceholderEvaluation`. Zero server/DB/AI imports. |
| `src/domain/flow/completion.ts` | isAttemptComplete + nextUnfinishedTurnOrder pure helpers | VERIFIED | 74 lines, pure module. `isAttemptComplete` checks all required turns have answer + repeat + accepted. `nextUnfinishedTurnOrder` finds first gap. Zero `evaluation` field access in code. Zero server/DB/AI imports. |
| `src/server/student-access/assignment-list.ts` | Service-role read of student's assignments with read-time display status | VERIFIED | 111 lines. Real DB query via `createSupabaseServiceClient`. Read-time closed/expired computation from `due_at`. Zero mutation calls (no update/insert/delete). `missionSnapshotSchema.safeParse` for turn count. |
| `src/server/student-access/mission-flow.ts` | Start/resume, answer, repeat, hint, complete service functions | VERIFIED | 463 lines. All 5 functions exported with ownership checks. Uses `buildPlaceholderEvaluation`, `assertTransitionRequest`, `isAttemptComplete`, `Math.max` (GREATEST). Zero AI imports. |
| `src/app/student/missions/[assignmentStudentId]/actions.ts` | Server actions wrapping flow service behind unlock gate | VERIFIED | 152 lines, `"use server"`. 5 actions exported (start, answer, repeat, hint, complete). All Zod-validated, `readStudentUnlock` gated, delegate to `mission-flow.ts`. Zero AI imports. |
| `src/app/student/missions/[assignmentStudentId]/page.tsx` | SSR mission route with unlock gate, ownership, snapshot parse | VERIFIED | 145 lines, SSR server component (no `"use client"`). `readStudentUnlock` gate, ownership check (`student_id = unlock.studentId`), `missionSnapshotSchema.parse`, `getCharacterProfile`, resume position via `nextUnfinishedTurnOrder`. |
| `src/components/student/MissionFlowShell.tsx` | Client step-state machine driving per-turn cards | VERIFIED | 296 lines, `"use client"`. `useState` FlowState, `useTransition` for pending. Imports all 5 server actions + 4 step components + progress bar. One card at a time via `flow.step` discriminator. |
| `src/components/student/StepBuddyQuestion.tsx` | Buddy question + answer input + hint area | VERIFIED | 120 lines. Renders `questionLabel` + `prompt` from snapshot. `HintRevealer` embedded. Validates non-empty answer. No `dangerouslySetInnerHTML`. |
| `src/components/student/StepImprovedRepeat.tsx` | Improved sentence + required repeat | VERIFIED | 123 lines. Shows `originalAnswer` read-only, `targetExample` in improved sentence card. Validates non-empty repeat. No `dangerouslySetInnerHTML`. |
| `src/components/student/HintRevealer.tsx` | 3-tier progressive hint disclosure | VERIFIED | 116 lines. Strict tier1->tier2->tier3 order. `aria-expanded`, `aria-hidden`. "All hints shown" terminal state. Record-only via `onReveal` callback. |
| `src/components/student/TurnProgressBar.tsx` | Turn progress bar with ARIA attributes | VERIFIED | 46 lines. `role="progressbar"`, `aria-valuenow`, `aria-valuemin=1`, `aria-valuemax`. Fill width = completed fraction. |
| `src/components/student/StepTurnTransition.tsx` | Between-turn success screen with Next turn button | VERIFIED | 46 lines. Renders `transitionMessage` + "Next turn" button. `aria-live="polite"`. |
| `src/components/student/StepMissionComplete.tsx` | Completion screen with back-to-homework navigation | VERIFIED | 59 lines. Renders `completionHeading` + `completionBody`. "Back to homework" button via `useRouter().push("/student/home")`. |
| `src/components/student/AssignmentListItem.tsx` | Assignment card with status badge and navigation | VERIFIED | 151 lines. Start/Continue as `<a>` links to `/student/missions/{id}`. Done/Closed as non-interactive `<div>`. All 4 badge styles imported. Closed explanation copy verbatim. |
| `tests/domain/character-profile.test.ts` | CHAR-01/02/03/04 unit coverage | VERIFIED | 113 lines, 14 tests GREEN. Resolution, fallback, static copy, CHAR-03 guard (disallowed substring scan). |
| `tests/domain/ai-boundary.test.ts` | AI-06 structural grep test | VERIFIED | 123 lines, 2 tests GREEN. Scans 5 dirs for forbidden AI tokens. |
| `tests/domain/placeholder-evaluation.test.ts` | D-02 evaluation shape tests | VERIFIED | 31 lines, 4 tests GREEN. Version, shape, timestamp. |
| `tests/server/mission-flow.test.ts` | Completion + service export tests | VERIFIED | 229 lines, 26 tests GREEN. 15 completion-helper tests + 11 structural/export tests. |
| `tests/e2e/student-mission.spec.ts` | FLOW-04/PILOT-01 e2e walk | VERIFIED | 446 lines. Full multi-turn walk + mobile viewport assertion. `hasSupabaseEnv` guard preserved. No `fixme`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/student/home/page.tsx` | `src/server/student-access/assignment-list.ts` | SSR calls `listStudentAssignments(unlock.studentId)` | WIRED | Line 22: `const assignments = await listStudentAssignments(unlock.studentId);` |
| `src/components/student/AssignmentListItem.tsx` | `src/app/student/missions/[assignmentStudentId]/page.tsx` | Start/Continue items link to `/student/missions/{id}` | WIRED | Line 128: `href={"/student/missions/${item.assignmentStudentId}"}` |
| `src/components/student/MissionFlowShell.tsx` | `src/app/student/missions/[assignmentStudentId]/actions.ts` | Step handlers call all 5 server actions | WIRED | Lines 17-21: imports `startAttemptAction`, `submitAnswerAction`, `submitRepeatAction`, `revealHintAction`, `completeMissionAction` |
| `src/app/student/missions/[assignmentStudentId]/page.tsx` | `src/domain/character/profile.ts` | Resolves `getCharacterProfile(snapshot.characterId)` | WIRED | Line 76: `const characterProfile = getCharacterProfile(snapshot.characterId);` |
| `src/app/student/missions/[assignmentStudentId]/actions.ts` | `src/server/student-access/mission-flow.ts` | Each action delegates to a service function after unlock gate | WIRED | Lines 16-26: imports all 5 service functions from `@/server/student-access/mission-flow` |
| `src/server/student-access/mission-flow.ts` | `src/domain/foundation/status.ts` | Audited transition via `assertTransitionRequest` | WIRED | Lines 14, 161, 418: imports and calls `assertTransitionRequest` for assigned->started and started->completed |
| `src/server/student-access/mission-flow.ts` | `src/domain/flow/evaluation.ts` | Writes `buildPlaceholderEvaluation()` into evaluation jsonb | WIRED | Lines 15, 241: imports and calls `buildPlaceholderEvaluation()` in `recordAnswer` |
| `src/server/student-access/mission-flow.ts` | `src/domain/flow/completion.ts` | `completeAttempt` calls `isAttemptComplete` before transition | WIRED | Lines 17-19, 412: imports `isAttemptComplete` + `nextUnfinishedTurnOrder`, gates completion on `isAttemptComplete` |
| `src/domain/character/profile.ts` | `src/domain/mission/schemas.ts` | Reuses `DEFAULT_CHARACTER_ID` constant | WIRED | Line 12: `import { DEFAULT_CHARACTER_ID } from "@/domain/mission/schemas"` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/app/student/home/page.tsx` | `assignments` | `listStudentAssignments(unlock.studentId)` -> Supabase `assignment_students` + `assignments` | Yes (real DB query via service-role) | FLOWING |
| `src/app/student/missions/[assignmentStudentId]/page.tsx` | `snapshot`, `characterProfile`, `startingTurnIndex` | Supabase `assignments.mission_snapshot` -> `missionSnapshotSchema.parse` + `getCharacterProfile` + `nextUnfinishedTurnOrder` | Yes (real DB query, parsed snapshot, profile lookup) | FLOWING |
| `src/components/student/MissionFlowShell.tsx` | `turns`, `characterProfile`, `requiredTurns` | Props from SSR page (real DB data) | Yes (props populated by SSR) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-specific tests pass | `npx vitest run tests/domain/character-profile.test.ts tests/domain/ai-boundary.test.ts tests/domain/placeholder-evaluation.test.ts tests/server/mission-flow.test.ts` | 46 passed, 0 failed | PASS |
| Full test suite passes | `npx vitest run` | 162 passed, 4 skipped, 0 failed (18 files) | PASS |
| AI-06 structural boundary holds | `grep -rnE "openai\|@anthropic-ai\|/api/chat\|/api/buddy" src/app/student/ src/server/student-access/ src/components/student/ src/domain/character/ src/domain/flow/` | No matches (exit code 1 = no violations) | PASS |
| No evaluation field in completion logic | `grep -n "evaluation" src/domain/flow/completion.ts` | 3 matches, all in comments only (lines 6, 7, 33) | PASS |
| No mutation in assignment-list service | `grep -E "update\(\|insert\(\|delete\(" src/server/student-access/assignment-list.ts` | No matches | PASS |
| No dangerouslySetInnerHTML in student components | `grep -r "dangerouslySetInnerHTML" src/components/student/` | 0 matches | PASS |
| Mission route is SSR (no "use client") | `grep '"use client"' src/app/student/missions/[assignmentStudentId]/page.tsx` | 0 matches | PASS |
| completeAttempt exports exist | `npx vitest run tests/server/mission-flow.test.ts -t "completeAttempt"` | All completeAttempt tests GREEN | PASS |

### Probe Execution

Step 7c: SKIPPED (no probe scripts declared in phase PLAN/SUMMARY, no `scripts/*/tests/probe-*.sh` found).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| FLOW-01 | 02, 03, 04 | Student can see assigned homework and start a mission | SATISFIED | Assignment list service + SSR home page + mission route all wired |
| FLOW-02 | 01, 03, 04 | Buddy asks short classroom-safe questions tied to the assigned mission | SATISFIED | Static character profile, snapshot prompt rendering, CHAR-03 guard test |
| FLOW-04 | 03, 04 | System shows a better target-form sentence after the original answer | SATISFIED | StepImprovedRepeat renders snapshot `targetExample` as improved sentence |
| FLOW-05 | 03, 04, 05 | Student must repeat the improved target-form sentence | SATISFIED | Required non-empty repeat input, `submitRepeatAction`, `recordRepeat` sets `repeat_accepted=true` |
| FLOW-06 | 05 | Mission completes after the required number of speaking turns and repeat attempts are satisfied | SATISFIED | `isAttemptComplete` deterministic gate, server-owned `completeAttempt`, 21 tests GREEN |
| FLOW-07 | 03, 04 | Student can reveal progressive hints: target pattern, word bank, then full example | SATISFIED | HintRevealer strict tier1->2->3 disclosure, `recordHintReveal` with GREATEST rollup |
| AI-06 | 01, 03, 04 | System keeps AI responses bounded and blocks open-ended private chat | SATISFIED | Structural boundary test GREEN, zero AI imports in student flow, no chat/buddy route |
| CHAR-01 | 01, 03, 04 | MVP uses one recurring supportive classmate buddy | SATISFIED | Coco character profile with static copy, resolved by `getCharacterProfile` |
| CHAR-02 | 01, 04 | Buddy tone is friendly, simple, encouraging, and classroom-safe | SATISFIED | Static copy matches UI-SPEC verbatim; CHAR-03 guard test checks disallowed substrings |
| CHAR-03 | 01 | Buddy does not use romance, dating mechanics, harsh correction, complex jokes, or long off-topic chatting | SATISFIED | Unit test scans all static lines for disallowed substring list (love, date, kiss, etc.) |
| CHAR-04 | 01 | Character profile is separated from mission logic | SATISFIED | `profile.ts` is a pure domain module importing only `DEFAULT_CHARACTER_ID`; zero server/DB/AI/flow imports |
| PILOT-01 | 02, 04, 05 | System has a mobile-responsive student flow for common phone/tablet browser sizes | SATISFIED | 420px `maxWidth` on `panelStyle`, e2e asserts content within 420px on 375x812 viewport |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | -- | -- | -- | No TBD/FIXME/XXX markers, no TODO/HACK/PLACEHOLDER stubs, no empty handlers, no hardcoded empty returns in production code |

### Human Verification Required

### 1. Full Mission Walk on Phone Browser

**Test:** Open the student home on a phone-sized browser. Verify the assignment list shows with correct badges. Tap Start on an assigned mission. Walk through: buddy question (Coco asks:) -> type answer -> see improved sentence -> type repeat -> transition -> next turn -> ... -> Mission complete! -> Back to homework -> Done badge on the completed assignment.
**Expected:** The full multi-turn flow works end-to-end with no blank screens, no console errors, and correct step-by-step progression.
**Why human:** SSR + Supabase runtime integration, real data seeding, and visual rendering on a mobile viewport require a running server.

### 2. Resume Mid-Mission Shows Welcome Back Notice

**Test:** Start a mission, answer one turn, close the browser tab, re-enter the same mission.
**Expected:** "Welcome back! Picking up where you left off." notice appears above the step card, auto-dismisses after 5 seconds or on first submit.
**Why human:** Timer-based auto-dismiss and SSR client-state restoration are runtime behaviors.

### 3. Closed/Expired Assignment Display

**Test:** Seed a past-due assignment for the student and load the home page.
**Expected:** The assignment shows as a non-interactive card with "Closed" badge and explanation text.
**Why human:** Read-time expired computation depends on server clock vs due_at.

### 4. Empty Assignment List Preserves No Homework Yet State

**Test:** Access the student home with a student who has no assignments.
**Expected:** The existing "No homework yet" empty state renders unchanged.
**Why human:** Visual regression check.

---

_Verified: 2026-06-27T11:05:00Z_
_Verifier: Claude (gsd-verifier)_
