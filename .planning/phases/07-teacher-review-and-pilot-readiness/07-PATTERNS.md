# Phase 07: Teacher Review and Pilot Readiness - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 13 / 14 (1 no-analog: vercel.json config)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/cron/mark-missed/route.ts` (NEW) | route | request-response | `src/app/api/foundation/route.ts` | role-match |
| `src/app/api/cron/purge-audio/route.ts` (NEW) | route | request-response | `src/app/api/foundation/route.ts` | role-match |
| `src/server/foundation/purgeExpiredAudio.ts` (NEW) | service | batch / file-I/O | `src/server/foundation/markMissedAssignments.ts` | exact (role) |
| `src/server/logging/logger.ts` (NEW) | utility | transform | (none — no existing logging) | no analog |
| `src/app/teacher/classes/[id]/page.tsx` (REPLACE) | component | CRUD (read) | current `[id]/page.tsx` (roster) + evidence query | exact |
| `src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx` (NEW) | component | CRUD (read) | `src/app/teacher/classes/[id]/page.tsx` | exact |
| `src/app/teacher/classes/[id]/manage/page.tsx` (NEW) | component | CRUD | current `[id]/page.tsx` (move verbatim) | exact (move) |
| `src/app/teacher/evidence/[attemptId]/page.tsx` (EXTEND) | component | CRUD (read) | itself | exact |
| `src/app/teacher/evidence/[attemptId]/actions.ts` (EXTEND) | controller | event-driven | itself + override pattern | exact |
| `src/server/teacher/audio-evidence.ts` (EXTEND) | service | CRUD (read) | itself | exact |
| `src/server/student-access/assignment-list.ts` (MODIFY) | service | transform | itself (line 95-99) | exact |
| `src/server/student-access/mission-flow.ts` (MODIFY) | service | event-driven | itself (line 248-251) | exact |
| `supabase/migrations/2026XXXX_*.sql` (NEW, if needed) | migration | DDL | `202606270001_student_audio_storage.sql` | role-match |
| `vercel.json` (NEW) | config | n/a | (none) | no analog (use RESEARCH.md) |

## Shared Patterns

### Service-role Supabase client (all server jobs + actions)
**Source:** `src/server/foundation/markMissedAssignments.ts:1-10`
**Apply to:** purge-audio, override action, cron routes
```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/server";
const supabase = createSupabaseServiceClient();
```
Cookie-auth client `createSupabaseServerClient()` from `@/lib/supabase/server-auth` is used instead for RLS-gated teacher read pages (see class page analog).

### Audited status transition (override action + any job writing status)
**Source:** `src/server/foundation/markMissedAssignments.ts:34-67`
**Apply to:** override action (REV-06), needs-retry reopen
The canonical two-write pattern — validate, UPDATE status, INSERT audit event:
```typescript
assertTransitionRequest({
  previousStatus: row.status,
  nextStatus: "missed",
  actorType: "job",            // "teacher" requires actorId (status.ts:78)
  reasonCode: "due_date_elapsed",
  occurredAt: now.toISOString(),
});
await supabase.from("assignment_students").update({ status: "missed" }).eq("id", row.id);
await supabase.from("assignment_status_events").insert({
  assignment_student_id: row.id,
  previous_status: row.status,
  next_status: "missed",
  actor_type: "job",
  reason_code: "due_date_elapsed",
  metadata: { ... },           // optional teacher note goes here (D-09)
});
```
**Legal transitions** (verified `status.ts:41-45`): `teacher_review -> {completed, needs_retry, started}`, `completed -> teacher_review`, `started -> {completed, missed, needs_retry, teacher_review}`, `needs_retry -> {started, teacher_review}`. Note: `teacher_review -> assigned` is NOT legal; needs-retry reopen must go `teacher_review -> needs_retry` then `needs_retry -> started`.

### Teacher auth gate (all teacher pages + actions)
**Source:** `src/app/teacher/evidence/[attemptId]/page.tsx:11,18-21` and `actions.ts:17`
**Apply to:** review dashboard, manage page, override action
```typescript
export const dynamic = "force-dynamic";
const profile = await requireTeacherProfile(); // from @/server/auth/teacher-profile
```
Ownership is enforced in-query via the teacher_id filter, not a separate check — see `audio-evidence.ts:228`.

---

## Pattern Assignments

### `src/app/api/cron/mark-missed/route.ts` + `purge-audio/route.ts` (route, request-response)

**Analog:** `src/app/api/foundation/route.ts` (the ONLY existing API route handler in this style)

**Imports + handler shape** (analog lines 1-11):
```typescript
import { NextResponse } from "next/server";
// foundation route uses NextResponse.json; cron route adds CRON_SECRET header guard
```
The analog has no auth guard. The cron routes ADD the `Authorization: Bearer ${CRON_SECRET}` check from RESEARCH.md Pattern 1 (research lines 223-250) before calling the job function. Use `NextResponse.json(...)` for responses to match the codebase convention (foundation route uses it; RESEARCH.md's `Response.json` is equivalent but prefer `NextResponse`). Set `export const dynamic = "force-dynamic";`.

**Body:** call `markMissedAssignments()` / `purgeExpiredAudio()`, wrap in try/catch, emit logger event (`job.mark_missed.complete` / `.failed`), return JSON.

---

### `src/server/foundation/purgeExpiredAudio.ts` (service, batch + file-I/O)

**Analog:** `src/server/foundation/markMissedAssignments.ts` (exact role match — overdue sweep → action loop)

**Structure to copy** (analog lines 9-74): exported async fn returning a `{ ...Count }` result; service-role client; `select` with `.in()/.lt()` filter; loop performing the side-effect; throw `new Error(...)` with the supabase error message on each failure.

**Key difference (new):** Storage `.remove()` then DB update — NO existing `.remove()` analog in the codebase. Follow RESEARCH.md Pattern 2 (research lines 270-326) and the Storage delete anti-pattern (research line 444). Bucket id helper exists: `audio-evidence.ts:93-95` (`process.env.STUDENT_AUDIO_BUCKET || "student-audio"`). Reuse that helper or its logic, do not hardcode.

**Idempotency:** mirror `markMissedAssignments` — filter `.neq("processing_status", "deleted")` so re-runs skip already-purged rows (research lines 596-599).

---

### `src/server/logging/logger.ts` (utility, transform) — NO ANALOG

No existing logging in `src/` (verified: zero `console.*` matches). This is greenfield. Use RESEARCH.md Pattern 4 (research lines 405-425): a server-only `log(level, event, context)` writing `JSON.stringify` + `\n` to `process.stdout.write`. Add the file-header SECURITY comment convention seen in `assignment-list.ts:10-12` ("server-only by construction... Never import from a 'use client' module"). Instrumentation table at research lines 429-440.

---

### `src/app/teacher/classes/[id]/page.tsx` (REPLACE → review dashboard) + `review/[assignmentId]/page.tsx` (NEW)

**Analog:** current `src/app/teacher/classes/[id]/page.tsx` (the file being replaced — reuse its scaffolding) and the evidence-link query inside it.

**Page scaffold to copy** (analog lines 1-70): `force-dynamic`, `requireTeacherProfile()`, `createSupabaseServerClient()` (RLS cookie client — students-list page reads under RLS, so a foreign class resolves to `notFound()`), `.maybeSingle()` class load with `notFound()` on miss, the `one<T>()` nested-relation helper (lines 32-35) and `formatDateTime` (lines 37-43).

**Review dashboard ([id]/page.tsx):** query `assignments` for the class, order `due_at` / `created_at` desc (D-04), each row links to `/teacher/classes/[id]/review/[assignmentId]`.

**Bucket page (review/[assignmentId]/page.tsx):** query `assignment_students` filtered `.eq("assignment_id", assignmentId)` (D-03 — scope to ONE assignment), join `students(display_name)`, select `status, submitted_at`. Row shows status badge + submitted time ONLY (D-06). Each row links to `/teacher/evidence/[latest_attempt_id]`. The existing query in the analog (`EvidenceLinkRow`, lines 10-30) already selects `status, submitted_at, latest_attempt_id, students(display_name)` — copy and add the `assignment_id` filter.

**Styling:** copy the inline `React.CSSProperties` style objects from `evidence/[attemptId]/page.tsx:243-427` (the established teacher visual language: `#F7F8FA` shell, `#2563EB` links, card borders `#D1D5DB`).

---

### `src/app/teacher/classes/[id]/manage/page.tsx` (NEW — move)

**Analog:** the CURRENT `[id]/page.tsx` content (roster + RosterEditor). Move it verbatim per RESEARCH.md nav-restructure (research lines 555-565). Only change: this file keeps the roster/PIN/join-code UI; the `← Classes` back-link stays `/teacher`.

---

### `src/app/teacher/evidence/[attemptId]/page.tsx` (EXTEND) + REV-04 gaps

**Analog:** itself. Add two summary cells to the `summaryStyle` grid (lines 60-84) for **attempt count** and **highest hint level** (REV-04, D-07). Add an override-controls `<section>` after the turn list — confirmation step (D-09). Reuse `labelStyle`/`valueStyle` (lines 314-325).

---

### `src/server/teacher/audio-evidence.ts` (EXTEND `getAttemptEvidenceForTeacher`)

**Analog:** itself. The query (lines 207-229) joins `attempts → assignment_students → students/assignments/classes`. Two REV-04 gaps:
1. Add `attempt_count` + `highest_hint_level` to the `assignment_students(...)` select block (lines 216-225). They live on `assignment_students` (confirmed: `mission-flow.ts:284` writes `attempt_count`).
2. Add `assignment_students.id` to the select and expose it as `assignmentStudentId` on `AttemptEvidence` (type at lines 82-91) — the override action needs it (research Pitfall 4, lines 589-593).
Extend the `AttemptEvidence` type and `mapAttemptMetadata` (lines 102-112) accordingly.

---

### `src/app/teacher/evidence/[attemptId]/actions.ts` (EXTEND — override action, REV-06)

**Analog:** the existing `loadAudioClipUrlAction` (lines 1-28) for the `"use server"` + `requireTeacherProfile()` + result-union shape. Combine with the audited-transition pattern from `markMissedAssignments.ts:34-67`.

Follow RESEARCH.md Pattern 3 (research lines 335-397): `overrideAssignmentStatusAction({ assignmentStudentId, nextStatus, reasonNote? })`, `actorType: "teacher"` with `actorId: profile.id` (required per `status.ts:78`), optional note → `metadata.note`. Return a discriminated union `{ ok: true } | { ok: false; error: ... }` exactly like the existing action (lines 6-8).

**needs_retry reopen extra step:** when `nextStatus === "needs_retry"`, also reset `latest_attempt_id = null` (research line 498) so the student starts fresh.

---

### `src/server/student-access/assignment-list.ts` (MODIFY — line 95-99, needs_retry bug)

**Analog:** itself. Current catch-all `else { displayStatus = "closed"; }` (lines 95-99) wrongly closes `needs_retry`. Insert an explicit branch before the else (research lines 479-486):
```typescript
} else if (row.status === "needs_retry") {
  displayStatus = "start"; // isPastDue already handled at line 86
} else {
  displayStatus = "closed"; // missed, teacher_review
}
```
Note: the `isPastDue && status !== "completed"` guard at line 86 already maps past-due needs_retry to "closed", so the new branch only needs the not-past-due case.

---

### `src/server/student-access/mission-flow.ts` (MODIFY — line 249, status gate)

**Analog:** itself (`startOrResumeAttempt`). The gate at line 249 `if (asRow.status !== "assigned")` blocks needs_retry re-entry. Extend per research lines 488-496:
```typescript
if (asRow.status !== "assigned" && asRow.status !== "needs_retry") {
  return { ok: false, error: "not_assigned_or_started" };
}
```
The transition block (lines 268-289) currently hardcodes `previousStatus: "assigned"` / `.eq("status", "assigned")`. For needs_retry, use `previousStatus: asRow.status` and `reasonCode: "reopened_by_teacher"`; `needs_retry -> started` is legal (`status.ts:44`). The conditional `.eq("status", ...)` claim guard must match the actual prior status.

---

### `supabase/migrations/2026XXXX_*.sql` (NEW — only if a new column is needed)

**Analog:** `supabase/migrations/202606270001_student_audio_storage.sql` (header-comment + idempotent `on conflict do update` style).

**Likely NOT needed:** `audio_expires_at`, `deleted` enum, `deleted_at`, `processing_status` already exist (research lines 62, 611). `metadata` jsonb holds the optional teacher note (D-09, research line 512). Only add a migration if the override audit or purge needs a column not already present (e.g. `deleted_reason` — verify against `202606250001_foundation_schema.sql` before authoring).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vercel.json` | config | n/a | No cron config exists; use RESEARCH.md lines 252-263 verbatim (Hobby = daily only) |
| `src/server/logging/logger.ts` | utility | transform | No logging anywhere in `src/`; greenfield, use RESEARCH.md Pattern 4 |
| Storage `.remove()` call in purge | service op | file-I/O | No existing `.remove()` usage; only `.createSignedUrl()` exists (audio-evidence.ts:337). Use RESEARCH.md Pattern 2 |

## Metadata

**Analog search scope:** `src/app/api`, `src/app/teacher`, `src/server/foundation`, `src/server/teacher`, `src/server/student-access`, `src/domain/foundation`, `supabase/migrations`
**Files scanned:** 11 source files read in full or targeted
**Pattern extraction date:** 2026-06-30
