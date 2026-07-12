# Design: Dismiss Incomplete Assignment + Test-Data Cleanup

**Date:** 2026-07-12
**Phase context:** 10.1 (assignment-operations-student-history) — verifying
**Author:** John + Claude

## Problem

Three observations from the teacher UI led here:

1. **"Mark reviewed" on a missed/incomplete attempt does nothing useful.** From the
   Incomplete queue, opening a `missed` attempt and clicking **Mark reviewed** only writes
   a `reviewed_at` receipt (RPC `202607120002`). It does **not** change the assignment
   status, and it bounces the teacher to `/teacher?reviewed=…` (the Needs Review page).
2. **The missed row never leaves the Incomplete queue.** `listIncompleteForTeacher` →
   `groupIncompleteAssignments` filters purely on `assignment_students.status`
   (keeps `assigned` / `started` / `missed`). A review receipt is invisible to it, so a
   "reviewed" missed item stays in the Incomplete list forever. Net effect: Mark reviewed
   from Incomplete is a confusing no-op.
3. **Teacher wants to close out incomplete work that will never be done** — a student who
   dropped/was absent, or (right now) a pile of unfinished test-student assignments
   crowding the real work.

These are really **one product need**: a teacher must be able to *dismiss* an incomplete
assignment (missed OR never-started) so it leaves the queues — which is exactly what
"Mark reviewed" was clumsily attempting.

Separately, there is **accumulated test/dev noise** in the live database (11 classes, most
synthetic) that should be cleaned up once — but that is data cleanup, not a shipped feature.

## Scope decision: two separate deliverables

Deliberately NOT building a "hide test classes" feature. In production a teacher has no
fake classes to mute; such a feature is dev scaffolding that would ship and rot. Instead:

- **Part A — one-time data cleanup** (a throwaway script, run once, no migration, nothing shipped).
- **Part B — a real "Dismiss incomplete assignment" feature** (shipped; also fixes the broken Mark-reviewed path).

---

## Part A — One-time test-data cleanup

Read-first, transactional, preview-then-write throwaway Node script (PostgREST via `fetch`,
service-role key from `.env.local`; supabase-js realtime init fails on Node 20, so REST direct).
Not committed as product code; lives in scratchpad. The script **prints every row it will
change and every class it will delete, then waits for explicit confirmation before writing.**

### Classes to DELETE entirely (pure E2E/throwaway artifacts, cascade delete):
| Class | code | id |
|-------|------|----|
| Foundation Demo Class 2026-06-26T00:56:19 | null | a70310f3-cec0-4cc0-a132-c3fe4fe05d50 |
| Foundation Demo Class 2026-06-26T01:23:11 | null | 65feacad-e5df-4419-b79d-c28772d9b868 |
| MissionE2E Class 1782873724066 | NQ4U5X | d6f3b99b-69af-40e4-9317-3be4513441b8 |
| Mobile Class 1782873726326 | X5TJPN | 9b8435a3-e4b9-4693-bf07-71b765b641ba |
| MissionE2E Class 1782873883345 | P3NSNX | 54efe4ae-469f-48a9-a4df-b4aa18dff2cb |
| MissionE2E Class 1782873995517 | D5SESG | e4b9bdb5-8afb-4925-91cb-af4a42699de4 |
| Mobile Class 1782874025906 | 3EJEE3 | 27bd68cc-b2e5-4980-aff7-045d4565a3ca |
| Mobile Class 1782874136985 | B5JYEE | e57bd074-d022-4e57-a300-fae148deab7a |

`delete from classes where id in (...)` — foundation schema cascades to students →
assignments → assignment_students → attempts.

### "Test class" (ZJE9FT, id 06739d49-…) — KEEP class, CLEAR incomplete only:
- Keep the class and its **36 completed** attempts (useful review-UI test evidence).
- The **19 incomplete** rows (`assigned`:15, `started`:3, `missed`:1) are **dismissed**
  via the **new dismiss mechanism from Part B** (set `dismissed_at`, leave a
  `test_data_cleanup` audit event). Status is left unchanged — NOT faked to `completed`.
  This keeps the cleanup consistent with the shipped model and honest in history, and it is
  undo-able. This means **Part B ships first**, then the Part A script calls the same
  dismiss RPC.

### Explicitly NOT touched:
- "John's Speaking Class" (real) — untouched, even though it contains a `test` student.
- "John's Speaking Class 2" (real) — untouched.

### Reversibility
Deletes are irreversible; that is acceptable for the 8 synthetic E2E classes (throwaway by
construction). The "Test class" incomplete rows use dismiss (undo-able), so no irreversible
change touches data worth keeping.

---

## Part B — "Dismiss incomplete assignment" feature (shipped)

### Data model
New migration adds to `public.assignment_students`:
- `dismissed_at timestamptz` (null = active)
- `dismissed_by uuid` (teacher_profiles.id)
- `dismiss_reason text`

Rationale for a **separate column** rather than reusing `status='completed'`: dismissing a
never-started assignment must not lie and report it as completed in history/reports. Dismiss
is its own honest terminal marker, orthogonal to `status`.

### RPC: `dismiss_assignment_student(p_teacher_id, p_attempt_id, p_reason)`
`security definer`, `search_path = public`, service-role only. Semantics:
- Resolve the attempt's `assignment_student` and verify `classes.teacher_id = p_teacher_id`
  (ownership) `for update`.
- If not owned → `not_found`.
- Set `dismissed_at = now(), dismissed_by = p_teacher_id, dismiss_reason = p_reason`.
- Insert an `assignment_status_events` row: actor_type `teacher`, reason_code
  `teacher_dismissed`, previous_status = current status, next_status = current status
  (status is unchanged; the event records the dismiss action for audit).
- Idempotent: dismissing an already-dismissed row just refreshes the receipt, returns `ok`.
- Returns `text`: `'ok'` | `'not_found'`.

Undo: `undo_dismiss_assignment_student(...)` clears the three columns + audit event
(reason_code `teacher_dismiss_undone`).

### Server layer (`src/server/teacher/assignment-operations.ts`)
- `dismissAssignmentStudent({ teacherId, attemptId, reason? })` → ownership pre-check via
  existing `loadOwnedAttempt`, then RPC. Mirrors `requestSubmissionRetry` shape.
- `undoDismiss({ teacherId, attemptId })`.
- `listIncompleteForTeacher` query gains `.is("dismissed_at", null)` so dismissed rows drop
  out of the Incomplete queue and the sidebar count (count already derives from the same
  data via `countIncompleteItems`).

### Domain layer (`src/domain/teacher/assignment-operations.ts`)
- `groupIncompleteAssignments` already receives only non-dismissed rows (filtered at the
  query), so no change strictly required; add a defensive `dismissedAt` field to the row
  type + skip dismissed rows if present, to keep the pure function self-consistent for tests.

### UI (evidence page only — per decision)
`src/components/teacher/SubmissionReviewControls.tsx` +
`src/app/teacher/evidence/[attemptId]/actions.ts` + `page.tsx`:
- The evidence page already knows the attempt's assignment status. When the attempt is
  **incomplete** (`assigned`/`started`/`missed`, i.e. not a completed/teacher_review
  submission), the Teacher action section shows **Dismiss** (primary) instead of the
  misfiring "Mark reviewed". Copy: **"Mark as done"** with helper text
  "Removes this from your incomplete list. You can undo this." Keep "Request retry" secondary.
- On success: `router.push('/teacher')` (or back to the class incomplete view) and the item
  is gone from Incomplete; the fingerprint-keyed snapshot sync (already built) drops the count.
- For a **completed/teacher_review** submission the controls are unchanged (Mark reviewed +
  Request retry as today).
- If the row is already dismissed, show an **Undo** affordance instead.

### Not in scope (YAGNI)
- No inline Dismiss button in the Incomplete queue rows (evidence-page only for now).
- No bulk dismiss UI.
- No "hide class/student" feature.

## Testing

**Part A:** manual — script prints preview, human confirms, re-run inspection shows queues clean.

**Part B (automated):**
- Schema test: `dismiss_assignment_student` / `undo_dismiss_assignment_student` RPC
  signatures + return contract (mirror existing `*-rpc-schema.test.ts`).
- Domain: `groupIncompleteAssignments` skips dismissed rows; `countIncompleteItems` unaffected
  by dismissed rows.
- Server: `dismissAssignmentStudent` rejects non-owned attempt (`not_found`); success path;
  `listIncompleteForTeacher` excludes dismissed rows (injected fake client).
- UI-source test: evidence controls render **Mark as done** for an incomplete attempt and
  **Mark reviewed** for a completed one (extend `teacher-review-actions.test.ts` /
  `teacher-workspace-ui.test.ts` style source assertions).

**Migration:** push to live Supabase (same flow as `202607120002`), then re-run full suite +
typecheck + lint + build (baseline: 488 pass / 4 skip, all clean).

## Verification (human, after implementation)
- Open an incomplete (missed/not-started) attempt → **Mark as done** → lands back on
  `/teacher`, item gone from Incomplete, sidebar count dropped instantly.
- Undo works (item reappears).
- A completed submission still shows Mark reviewed (unchanged).
- After Part A cleanup: teacher queues show only the two real "John's Speaking Class" classes'
  genuine work.
