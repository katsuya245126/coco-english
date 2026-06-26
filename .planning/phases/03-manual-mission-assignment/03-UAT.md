---
status: complete
phase: 03-manual-mission-assignment
source: [03-VERIFICATION.md]
started: 2026-06-26T16:21:00Z
updated: 2026-06-26T17:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Full mission authoring flow persists all fields
expected: Open /teacher/missions/new in a browser. Fill in title, target pattern, topic, select a level, author 2 turns with prompts, target examples, and all 3 hint tiers. Click Save mission. The edit page loads with the saved content — all fields persist, both turns intact, level is the selected value, and no due date field appears on the mission form.
result: pass
note: "User confirmed mission saved, appears in missions list, and all fields/both turns present when reopened via Edit. Observed a UX gap (logged below): on Save it navigates to the mission detail page (/teacher/missions/{id}) with no success-confirmation message — user perceived this as 'jumps to top of page'."

### 2. Assignment success message and auto-dismiss
expected: From the missions list, click Assign to class on a mission, select a class with active students, optionally set a due date, click Assign homework. Success message reads "Homework assigned to {class name}. {N} student(s) will see it on their next visit." The dialog closes and the message auto-dismisses after ~5 seconds.
result: pass
note: "Initially failed (blocker) — see resolved gap below. Root-caused to an ambiguous column reference in the assign_mission_to_class RPC and a misleading reused error message. Fixed in-session (migration 202606260001 + service/action updates) and re-verified: assigning 'How often' to Kyle's class showed 'Homework assigned to Kyle's class. 4 student(s) will see it on their next visit.' and the dialog closed."

### 3. Edit-after-assign non-blocking notice (D-15)
expected: After assigning a mission, navigate to its edit page. A non-blocking notice appears reading "This mission has N active assignment(s). Edits apply to future assignments only; existing homework is unchanged." The mission remains fully editable.
result: pass

### 4. Snapshot immutability at the database level (D-05/D-06/D-14)
expected: Edit a mission that has active assignments (change title or a turn) and Save. Then inspect the existing assignment in Supabase (assignments table, mission_snapshot column). The stored mission_snapshot JSONB still shows the original title/turn content from assign-time; the live mission rows reflect the edit. Snapshot immutability is preserved.
result: pass

### 5. Responsive layout on mobile viewport
expected: On a 375px-wide mobile viewport, the mission form, turn editor, and assign dialog stack vertically without horizontal overflow. All fields, buttons, and dialog content are usable; no horizontal scrollbar; buttons have minimum 44px touch targets.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Assigning a mission to a class with active students creates homework and shows a success message"
  status: resolved  # Fixed in-session: migration 202606260001 (renamed RPC OUT cols) + assign-service/actions updates; re-verified pass.
  reason: "User reported: clicking Assign homework shows 'We could not save the mission. Check the highlighted fields and try again.' Assignment does not complete. (Reproduced with Kyle's class, 4 active students.)"
  severity: blocker
  test: 2
  root_cause: "The Postgres RPC public.assign_mission_to_class throws 'column reference \"assignment_id\" is ambiguous'. The function's RETURNS TABLE OUT column is named assignment_id, which collides with the assignment_id column on assignment_students / assignment_status_events referenced inside the CTEs. The app-layer assignMissionAction catch{} swallows this and substitutes the misleading mission-save GENERIC_FAILURE message."
  artifacts:
    - path: "supabase/migrations/202606250005_mission_assign_rpc.sql"
      issue: "RETURNS TABLE OUT column 'assignment_id' collides with table column 'assignment_id' inside the assignment_students/assignment_status_events CTEs, causing 'column reference \"assignment_id\" is ambiguous' at runtime."
    - path: "src/app/teacher/missions/actions.ts"
      issue: "assignMissionAction reuses the mission-save GENERIC_FAILURE for assign errors and swallows the real error in catch{}, producing a misleading message for the assign flow."
  missing:
    - "Rename the RPC OUT columns (e.g. out_assignment_id / out_active_student_count / out_class_name) or fully-qualify references so no OUT param collides with a table column; ship as a new migration."
    - "Give assignMissionAction its own assign-specific failure message instead of reusing the mission-save GENERIC_FAILURE."

- truth: "After saving a mission, the teacher gets clear confirmation that the save succeeded"
  status: failed
  reason: "User reported: on Save the page jumps to the top with no success message. Mission does save correctly (navigates to /teacher/missions/{id} per MissionForm.tsx:77), but there is no toast/banner confirming 'Mission saved'. User suggested a save confirmation and/or returning to the missions list."
  severity: cosmetic
  test: 1
  root_cause: "MissionForm.handleSubmit (src/components/teacher/MissionForm.tsx:76-78) calls router.push + router.refresh on success with no success-feedback UI on the destination page."
  artifacts:
    - path: "src/components/teacher/MissionForm.tsx"
      issue: "No success confirmation surfaced after save; navigation lands at top of detail page silently"
  missing:
    - "Surface a success confirmation (toast or banner) after a mission is created/updated"
