# Phase 06: AI Mission and Turn Intelligence - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Source:** Operator-supplied decisions at `$gsd-plan-phase 6` invocation

<domain>
## Phase Boundary

Phase 6 adds AI-backed mission generation and turn evaluation on top of the completed manual mission, student attempt, audio recording, transcription, and teacher evidence foundations.

The phase must deliver validated teacher-facing mission draft generation and structured student-turn evaluation without turning the student flow into open-ended chat or trusting unvalidated model output.

</domain>

<decisions>
## Implementation Decisions

### Conditional Feedback
- D-01: Only show an improved sentence when the student's original English answer actually needs correction.
- D-02: If the student's original answer already says the target response correctly, skip the correction-and-repeat requirement for that turn and give positive reinforcement instead.
- D-03: Replace the Phase 4 placeholder behavior that always shows a fixed model sentence; Phase 6 AI evaluation must drive whether correction and repeat are required.

### Language Validation
- D-04: Turn evaluation must check that the student's response is in English.
- D-05: Non-English responses, including Japanese or other non-target languages, must not be accepted as successful English speaking practice.

### Confidence And Review Routing
- D-06: Low-confidence, ambiguous, failed-schema, or malformed AI evaluation results must route to teacher review instead of auto-passing or auto-failing.
- D-07: App code owns assignment and attempt status transitions; AI output can recommend evaluation fields but cannot directly own workflow state.

### Mission Generation
- D-08: Generated missions must be previewable and editable by the teacher before assignment.
- D-09: Generated mission output must be validated against a strict mission schema before it can become assignable mission data.

### the agent's Discretion
- D-10: The exact OpenAI model names, response schemas, retry strategy, confidence threshold values, and test fixture structure are implementation details for the planner and executor, provided they satisfy the phase requirements and keep paid API calls out of automated tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Source Of Truth
- `.planning/ROADMAP.md` - Phase 6 goal, MVP mode, dependency on Phase 5, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` - Requirement definitions for MISS-02, MISS-03, MISS-05, AI-01, AI-02, AI-03, AI-04, and AI-05.
- `.planning/STATE.md` - Current phase status and accumulated cross-phase decisions.

### Prior Phase Contracts
- `.planning/phases/03-manual-mission-assignment/03-CONTEXT.md` - Manual mission and assignment snapshot decisions that generated mission drafts must preserve.
- `.planning/phases/04-guided-student-attempt-loop/04-CONTEXT.md` - Student attempt loop, placeholder evaluation isolation, buddy safety, correction/repeat flow, and completion rules.
- `.planning/phases/05-voice-capture-and-evidence-storage/05-CONTEXT.md` - Audio/transcription evidence constraints and transcript-gated progression.
- `.planning/phases/05-voice-capture-and-evidence-storage/05-VERIFICATION.md` - Phase 5 verified completion state and any residual pilot-device context.

</canonical_refs>

<specifics>
## Specific Ideas

- The evaluator should produce structured fields for meaning, target-pattern attempt, whether a correction is needed, the improved sentence when needed, repeat closeness, English-language validation, confidence, and teacher-review routing.
- Existing tests should prove that correct English answers do not display a model correction or force a repeat just because the placeholder used to do so.
- Non-English transcript fixtures should be part of the Phase 6 verification set.
- Low-confidence and failed-schema fixtures should assert teacher-review routing rather than silent pass/fail.

</specifics>

<deferred>
## Deferred Ideas

- Full teacher review dashboard buckets and manual override workflows remain Phase 7 scope.
- Numerical scoring, pronunciation percentages, ranking, long-form free chat, and autonomous voice-agent behavior remain out of v1 scope.

</deferred>

---

*Phase: 06-ai-mission-and-turn-intelligence*
*Context gathered: 2026-06-27 via operator-supplied plan-phase decisions*
