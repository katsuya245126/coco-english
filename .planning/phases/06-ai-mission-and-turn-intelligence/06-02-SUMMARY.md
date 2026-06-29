---
phase: 06-ai-mission-and-turn-intelligence
plan: 02
subsystem: ai
tags: [openai, zod, mission-generation, teacher-ui, server-actions]
requires:
  - phase: 06-ai-mission-and-turn-intelligence
    provides: RED mission-generation tests and source contracts from 06-01
  - phase: 03-manual-mission-assignment
    provides: manual mission form schema, create/update save path, and assignment snapshots
provides:
  - Strict generated mission draft schemas compatible with existing mission authoring
  - Server-only OpenAI Responses adapter with fake-client injection and local Zod validation
  - Teacher-authenticated mission draft action returning UI-safe errors
  - Create-mode AI mission draft panel with preview and editable form handoff
affects: [06-03, 06-04, phase-07-teacher-review]
tech-stack:
  added: []
  patterns:
    - Server-only AI adapters accept injected fake Responses clients for tests
    - Provider structured output is revalidated locally before UI handoff
    - Generated drafts fill existing editable form state; save/assign paths stay unchanged
key-files:
  created:
    - src/domain/ai/mission-generation.ts
    - src/server/ai/mission-generator.ts
    - src/components/teacher/MissionDraftPanel.tsx
  modified:
    - src/app/teacher/missions/actions.ts
    - src/components/teacher/MissionForm.tsx
key-decisions:
  - "06-02: Mission draft generation returns validated drafts only; generated data is never saved until the teacher uses the existing mission save path."
  - "06-02: OpenAI Responses integration stays server-only in src/server/ai/mission-generator.ts with fake-client injection for automated tests."
patterns-established:
  - "Mission draft schemas reuse existing mission field constraints and required-turns-equals-turns validation."
  - "Teacher AI generation UI presents provider/schema failures as safe classroom-facing copy without raw JSON, model, token, prompt, or stack details."
requirements-completed: [MISS-02, MISS-03, MISS-05]
duration: 7min
completed: 2026-06-29
status: complete
---

# Phase 06 Plan 02: Teacher Mission Generation Summary

**Validated teacher AI mission draft generation with server-only OpenAI parsing, strict Zod rejection, and editable preview-to-form handoff**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-29T11:13:24Z
- **Completed:** 2026-06-29T11:20:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added strict mission draft input/output schemas and a local `parseGeneratedMissionDraft` guard so malformed provider output cannot become assignable mission data.
- Added `generateMissionDraft` as a server-only OpenAI Responses adapter with injected fake-client tests, env-backed model selection, and narrow `missing_api_key`, `provider_failed`, and `schema_failed` errors.
- Added `generateMissionDraftAction`, requiring teacher auth before generation and mapping backend failures to UI-SPEC-safe copy.
- Added `MissionDraftPanel` to create-mode mission authoring with generate/regenerate, read-only draft preview, failed-schema alert copy, and `Use draft` form-fill.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement strict mission draft schema and server-only adapter** - `682c5b52` (`feat`)
2. **Task 2: Add teacher action, draft panel, preview, and editable form-fill** - `1eeccd5f` (`feat`)

## Files Created/Modified

- `src/domain/ai/mission-generation.ts` - Strict draft input/output schemas and local draft parser.
- `src/server/ai/mission-generator.ts` - Server-only OpenAI Responses adapter with fake-client injection and narrow errors.
- `src/app/teacher/missions/actions.ts` - Teacher-authenticated `generateMissionDraftAction` with UI-safe result mapping.
- `src/components/teacher/MissionDraftPanel.tsx` - AI draft generation panel, status handling, preview, and use/regenerate controls.
- `src/components/teacher/MissionForm.tsx` - Create-mode panel composition and validated draft form-fill behavior.

## Decisions Made

- Kept generated drafts as editable form state only; `createMissionAction`, `updateMissionAction`, and assignment flows remain the only save/assignment paths.
- Used OpenAI `zodTextFormat` for provider structured parsing but still revalidated `output_parsed` with local Zod before returning success.
- Treated full `tsc --noEmit` failures from 06-03/06-04 RED tests as out of scope for this plan, per current gate context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworked draft schema composition after ZodEffects blocked `.omit()`**
- **Found during:** Task 1
- **Issue:** The first implementation tried to call `.omit()` on the existing refined `missionFormSchema`, but Zod returns a `ZodEffects` wrapper for refined schemas.
- **Fix:** Defined the generated draft object explicitly while reusing the same mission field schemas and refinement constraints.
- **Files modified:** `src/domain/ai/mission-generation.ts`
- **Verification:** `npx vitest run tests/domain/mission-generation.test.ts tests/server/ai-mission-generator.test.ts` passed.
- **Committed in:** `682c5b52`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix preserved the planned schema behavior without scope expansion.

## Issues Encountered

- Sandboxed Playwright could not bind the configured local web server (`listen EPERM 0.0.0.0:3000`). Re-running with approved escalation passed.
- `npx tsc --noEmit --pretty false` still fails because 06-03/06-04 RED tests reference planned turn-evaluation modules and helpers not in this plan: `@/domain/ai/turn-evaluation`, `@/server/ai/turn-evaluator`, `applyOriginalTurnEvaluation`, `applyRepeatTurnEvaluation`, and `CompletionTurn.evaluation`.
- `npm run build` passes and reports an existing unrelated lint warning in `src/components/student/AssignmentListItem.tsx` for unused `labelStyle`.

## Verification

- `npx vitest run tests/domain/mission-generation.test.ts tests/server/ai-mission-generator.test.ts` - passed, 7 tests.
- `npx playwright test tests/e2e/teacher-ai-mission-draft.spec.ts` - passed with escalation, 2 tests.
- `npm run build` - passed; existing unrelated unused variable warning remains.
- `npx tsc --noEmit --pretty false` - failed only on planned 06-03/06-04 RED turn-evaluation references listed above.

## Known Stubs

None. The service-failure copy "AI generation is not available right now..." is intentional UI error copy, not placeholder data.

## Threat Flags

None. The new trust boundaries are those already listed in the plan threat model: teacher browser to server action, server action to provider, and provider output to locally validated form data.

## User Setup Required

None - automated tests use fake clients. Live mission generation requires `OPENAI_API_KEY`; `OPENAI_MISSION_MODEL` is optional.

## Next Phase Readiness

Plan 06-03 can implement student original-answer turn evaluation without touching the teacher mission-generation slice. Plan 06-04 can then add repeat evaluation, completion compatibility, and teacher-review evidence annotations.

## Self-Check: PASSED

- Key files exist: `src/domain/ai/mission-generation.ts`, `src/server/ai/mission-generator.ts`, `src/components/teacher/MissionDraftPanel.tsx`, `src/app/teacher/missions/actions.ts`, and `src/components/teacher/MissionForm.tsx`.
- Task commits exist: `682c5b52` and `1eeccd5f`.
- No tracked files were deleted by either task commit.

---
*Phase: 06-ai-mission-and-turn-intelligence*
*Completed: 2026-06-29*
