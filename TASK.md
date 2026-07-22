# Final Coco closing for dynamic conversation missions

**Status:** Written specification approved; implementation plan awaiting user approval

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
- [ ] User approves the implementation plan.
- [ ] Implementation completed with focused regression coverage.
- [ ] Proportionate release verification completed.
- [ ] Conversation-mode UAT confirms the final spoken closing and button flow.

## Current position

Written specification:
`docs/superpowers/specs/2026-07-23-final-coco-closing-design.md`

Implementation plan:
`docs/superpowers/plans/2026-07-23-final-coco-closing.md`

## Next step

User reviews and approves the implementation plan, then selects inline or
explicitly authorized subagent-driven execution.
