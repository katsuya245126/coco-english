---
status: complete
phase: 04-guided-student-attempt-loop
source: [04-VERIFICATION.md]
started: 2026-06-27T11:10:00Z
updated: 2026-06-27T11:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Full mission walk on phone browser
expected: Student opens homework list, taps Start, sees buddy question (Coco asks:), types an answer, sees improved sentence, types repeat, advances through all required turns, sees Mission complete!, taps Back to homework, returns to assignment list showing Done badge.
result: issue
reported: "Progress bar on 'Turn 2 of 2' only fills to ~halfway even when the turn is done. Happy path otherwise works and Done badge appears. (Separate observation: the improved/'right' sentence is fixed, not variable — confirmed out-of-scope, deferred to Phase 6 AI evaluation, D-02 swap point.)"
severity: cosmetic

### 2. Resume mid-mission shows Welcome back notice
expected: Re-entering an in-progress mission shows the resume notice (Welcome back! Picking up where you left off.) above the step card, auto-dismissing after 5 seconds or on first submit.
result: pass

### 3. Closed/expired assignment shows non-interactive card with explanation
expected: An assignment past its due_at (or otherwise closed) renders as a non-interactive card with a Closed/Expired badge and explanation; Start/Continue does not launch the mission route.
result: pass
note: "Closed card + non-interactive behavior verified. SEPARATE finding surfaced while testing: teacher has no way to EDIT an existing assignment's due date — user had to re-assign the same mission to get a past due_at, which created a DUPLICATE assignment instead of updating the original. Tracked as out-of-scope backlog (Phase 3 assignment management gap), not a Phase 4 defect."

### 4. Empty assignment list preserves No homework yet state
expected: A student with zero assigned homework sees the existing No homework yet empty state.
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Turn progress bar reflects true progress and reaches 100% on the final completed turn"
  status: failed
  reason: "User reported: progress bar on 'Turn 2 of 2' only fills to ~halfway even when the turn is complete. Root cause: TurnProgressBar fill = (current - 1) / total, so the final turn caps at (N-1)/N and never reaches 100%."
  severity: cosmetic
  test: 1
  root_cause: "src/components/student/TurnProgressBar.tsx:21 — fillPercent uses (current - 1) / total, which represents only turns completed BEFORE the current one. The in-progress/last turn is never counted, so a 2-turn mission caps at 50%."
  artifacts:
    - path: "src/components/student/TurnProgressBar.tsx"
      issue: "completedFraction = (current - 1) / total under-fills; final turn never reaches 100%"
  missing:
    - "Fill should represent progress through the current turn (e.g. current / total, or advance to 100% on completion) so the last turn reaches full."
  debug_session: ""

# NOTE (out-of-scope, not a gap): User observed the 'better way to say it' sentence
# is fixed (e.g. 'I usually wake up early' regardless of input). This is by design in
# Phase 4 — buildPlaceholderEvaluation accepts any non-empty answer and targetExample
# is a static teacher-authored model sentence. Variable/AI evaluation is deferred to
# Phase 6 (D-02 swap point, version 'ai-eval-v1'). Not a Phase 4 defect.
