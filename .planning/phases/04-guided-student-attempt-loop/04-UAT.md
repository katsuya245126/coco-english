---
status: testing
phase: 04-guided-student-attempt-loop
source: [04-VERIFICATION.md]
started: 2026-06-27T11:10:00Z
updated: 2026-06-27T11:10:00Z
---

## Current Test

number: 1
name: Full mission walk on phone browser
expected: |
  Student opens homework list, taps Start, sees buddy question (Coco asks:), types an
  answer, sees improved sentence, types repeat, advances through all required turns,
  sees Mission complete!, taps Back to homework, returns to assignment list showing
  Done badge.
awaiting: user response

## Tests

### 1. Full mission walk on phone browser
expected: Student opens homework list, taps Start, sees buddy question (Coco asks:), types an answer, sees improved sentence, types repeat, advances through all required turns, sees Mission complete!, taps Back to homework, returns to assignment list showing Done badge.
result: [pending]

### 2. Resume mid-mission shows Welcome back notice
expected: Re-entering an in-progress mission shows the resume notice (Welcome back! Picking up where you left off.) above the step card, auto-dismissing after 5 seconds or on first submit.
result: [pending]

### 3. Closed/expired assignment shows non-interactive card with explanation
expected: An assignment past its due_at (or otherwise closed) renders as a non-interactive card with a Closed/Expired badge and explanation; Start/Continue does not launch the mission route.
result: [pending]

### 4. Empty assignment list preserves No homework yet state
expected: A student with zero assigned homework sees the existing No homework yet empty state.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
