---
status: testing
phase: 03-manual-mission-assignment
source: [03-VERIFICATION.md]
started: 2026-06-26T16:21:00Z
updated: 2026-06-26T16:21:00Z
---

## Current Test

number: 1
name: Full mission authoring flow persists all fields
expected: |
  All fields persist. The edit page shows the saved mission with both turns intact.
  Level is the selected value. No due date field appears on the mission form.
awaiting: user response

## Tests

### 1. Full mission authoring flow persists all fields
expected: Open /teacher/missions/new in a browser. Fill in title, target pattern, topic, select a level, author 2 turns with prompts, target examples, and all 3 hint tiers. Click Save mission. The edit page loads with the saved content — all fields persist, both turns intact, level is the selected value, and no due date field appears on the mission form.
result: [pending]

### 2. Assignment success message and auto-dismiss
expected: From the missions list, click Assign to class on a mission, select a class with active students, optionally set a due date, click Assign homework. Success message reads "Homework assigned to {class name}. {N} student(s) will see it on their next visit." The dialog closes and the message auto-dismisses after ~5 seconds.
result: [pending]

### 3. Edit-after-assign non-blocking notice (D-15)
expected: After assigning a mission, navigate to its edit page. A non-blocking notice appears reading "This mission has N active assignment(s). Edits apply to future assignments only; existing homework is unchanged." The mission remains fully editable.
result: [pending]

### 4. Snapshot immutability at the database level (D-05/D-06/D-14)
expected: Edit a mission that has active assignments (change title or a turn) and Save. Then inspect the existing assignment in Supabase (assignments table, mission_snapshot column). The stored mission_snapshot JSONB still shows the original title/turn content from assign-time; the live mission rows reflect the edit. Snapshot immutability is preserved.
result: [pending]

### 5. Responsive layout on mobile viewport
expected: On a 375px-wide mobile viewport, the mission form, turn editor, and assign dialog stack vertically without horizontal overflow. All fields, buttons, and dialog content are usable; no horizontal scrollbar; buttons have minimum 44px touch targets.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
