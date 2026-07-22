# Final Coco closing for dynamic conversation missions

**Status:** Implemented and verified; awaiting conversation-mode UAT

## Goal

End a successful dynamic conversation mission with a relevant spoken Coco
closing and an explicit **Finish mission** button before the existing completion
screen.

## Classification and approval

This is consequential student-flow and AI-generation work. The user approved
the correction threshold on 2026-07-23, approved the Finish button, and approved
splitting the UAT remediation into two sequential tasks. Task 1 is this closing
flow. Task 2 will separately address evaluation and follow-up quality.

The user approved the written specification. No implementation is approved
until the user reviews and approves the implementation plan.

## Scope

- Derive final closing behavior from the mission's `requiredTurns`.
- Generate a response-specific, no-question Coco farewell after the final
  accepted answer.
- Use a separate safe, non-interpolated closing fallback.
- Persist and speak the closing through existing `coco_line` and TTS ownership
  boundaries.
- Record completion, then show a closing step with **Finish mission**.
- Preserve safe completed-assignment re-entry behavior.
- Cover accepted-original and accepted-repeat endings.

## Non-goals

- Elementary correction thresholds or accepted recasts.
- Conversation-history contract changes.
- Follow-up policy repair, either/or relaxation, or follow-up fallback rewrite.
- Per-clip evidence history or database migration.
- Preset-mode behavior changes.
- Push, deployment, or external database mutation.

## Done checks

- [x] Production UAT symptom and root cause identified.
- [x] Closing UX and Finish-button behavior confirmed by the user.
- [x] Task decomposition reviewed with Claude and approved by the user.
- [x] Design presented and approved in conversation.
- [x] Written design specification created and self-reviewed.
- [x] User reviewed and approved the written specification.
- [x] Test-first implementation plan written and self-reviewed.
- [x] User approves the implementation plan.
- [x] Implementation completed with focused regression coverage.
- [x] Proportionate release verification completed.
- [ ] Conversation-mode UAT confirms the final spoken closing and button flow.

## Current position

Written specification:
`docs/superpowers/specs/2026-07-23-final-coco-closing-design.md`

Implementation plan:
`docs/superpowers/plans/2026-07-23-final-coco-closing.md`

Commits:
- `82b6dd25` feat(conversation): generate final Coco closing (Task 1)
- `d4e5d185` feat(student): show final Coco closing (Task 2)

## Verification evidence (2026-07-23)

- Focused Task 1 suite: `npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts`
  → 4 files, 78 tests, all passed.
- Focused Task 2 suite: `npx vitest run src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-page.test.ts`
  → 5 files, 79 tests, all passed.
- Combined focused regression matrix (Task 1 + Task 2 files together): 9 files, 157 tests, all passed, no preset/teacher-review/ownership/TTS/resume regressions.
- Full suite: `npm test -- --run` → 90 test files passed, 922 tests passed, 4 skipped, 0 failed.
- `npm run typecheck` → exit 0, no TypeScript errors.
- `npm run lint` → exit 0; only the pre-existing unrelated `label` unused-var warning in `scripts/check-student-feedback-states.mjs` remains.
- `npm run build` → exit 0, all 33 routes compiled, no type or route errors. Run only after the user stopped the checkout's own `next dev -p 3200` process so the build did not share a live `.next` cache.

## Next step

Run a five-turn conversation mission (real device or localhost) and confirm:
1. the final answer produces a relevant spoken no-question Coco closing;
2. **Finish mission** reveals the existing completion screen with no extra
   network mutation;
3. reopening the assignment afterward cannot return to a recorder or a
   phantom next turn.

Once confirmed, archive this task to `docs/tasks/archive/2026-07-23-final-coco-closing.md`
with status `Complete`. Do not push, deploy, merge, publish, or mutate
Supabase without separate explicit approval.
