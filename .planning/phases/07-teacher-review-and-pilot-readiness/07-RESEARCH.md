# Phase 07: Teacher Review and Pilot Readiness - Research

**Researched:** 2026-06-30
**Domain:** Next.js App Router / Supabase — teacher dashboard, server status transitions, Vercel Cron, Storage deletion, structured logging
**Confidence:** MEDIUM (all core claims verified against live codebase; external API behavior from official Vercel/Supabase docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Review Dashboard and Navigation**
- D-01: Clicking a class navigates to the review dashboard (evidence/review-first), NOT the roster page.
- D-02: Class management (roster, PINs, join code) moves to its own separate page, demoted from default class-click landing.
- D-03: Status buckets are scoped per assignment, not aggregated across a class's assignments.
- D-04: Dashboard first lists the class's assignments, most recent first; teacher picks one to see per-student buckets.
- D-05: Buckets shown: completed, not started, missed, needs retry, teacher review.
- D-06: Per-student scan row shows status badge + submitted time only. Attempt count and highest hint level are NOT in the row.
- D-07: REV-02 attempt-count and highest-hint-level data is surfaced in the attempt detail view (REV-04), not the scan row.

**Manual Override**
- D-08: Override controls live on the attempt detail page (`/teacher/evidence/[attemptId]`).
- D-09: Overrides require a confirmation step; reason note is optional and stored in the audit event when provided.
- D-10: Marking "needs retry" reopens homework for the student so they can re-record.

**Missed-Homework Job**
- D-11: The existing `markMissedAssignments()` has no caller — Phase 7 must wire a trigger.
- D-12: Recommended default: Vercel Cron + a protected route calling `markMissedAssignments()` daily. Planner may deviate with rationale.

**Logging and Retention**
- D-13: Structured logger (level + event + context), no new dependency, stdout output, replaces ad-hoc `console.*`.
- D-14: Audio retention/deletion acts on existing `audio_expires_at` column. Same Vercel Cron mechanism recommended.

### Claude's Discretion
- Exact cron config (route paths, cadence, CRON_SECRET scheme).
- Logger shape/level taxonomy and exact instrumentation points.
- Attempt-detail layout for multi-turn attempts.
- How reopened/needs-retry state renders to the student.
- Whether audio deletions are audited and how deleted-clip evidence view degrades.

### Deferred Ideas (OUT OF SCOPE)
- Visual/mascot character for Coco.
- v2 review improvements (filter by target pattern/hint/retry reason; class-level trends).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ASGN-05 | System can mark homework missed when the due date passes without completion | `markMissedAssignments()` exists and is complete; only needs a Vercel Cron trigger wired to `/api/cron/mark-missed` |
| REV-01 | Teacher dashboard shows homework buckets: completed, not started, missed, needs retry, teacher review | New route `/teacher/classes/[id]/review/[assignmentId]` reading `assignment_students.status`; all five statuses already exist in the DB enum |
| REV-02 | Teacher can scan each student's status, attempt count, submitted time, and highest hint level | Scan row (status + submitted_at) per D-06; attempt_count and highest_hint_level are on `assignment_students` and exposed via attempt detail per D-07 |
| REV-03 | Teacher can open an attempt detail view | `/teacher/evidence/[attemptId]` exists; needs back-link from the new review page |
| REV-04 | Attempt detail shows original transcript, improved sentence, repeat transcript, target-pattern result, hint usage, attempt count | Evidence page already renders turns with transcripts + AI annotations; missing: highest_hint_level and attempt_count must be pulled from assignment_students and shown |
| REV-06 | Teacher can manually mark an attempt complete, needs retry, or teacher review | New server action on the evidence page; requires confirmation step (D-09), audited transition, and for needs_retry: reopen student flow |
| PILOT-03 | Basic logging for assignment completion, audio processing, transcription, AI evaluation failures | Structured logger module + replacement of non-existent console.* at instrumentation points |
| PILOT-04 | Basic retention/deletion path for stored audio clips | Vercel Cron route calling `purgeExpiredAudio()` using Storage `.remove()` + DB update; `audio_expires_at` and `deleted` enum already in schema |
</phase_requirements>

---

## Summary

Phase 7 is primarily a **data-reading and status-writing phase** — the underlying schema, status machine, and evidence data are already built. The most complex new work is the teacher review dashboard query (assignments newest-first, then per-student buckets for a selected assignment) and the manual override action (server-owned audited transition with a needs-retry student reopen path).

The Vercel Cron wiring for `markMissedAssignments()` is low-risk because the function is already written and tested; the risk is in the route-protection pattern (CRON_SECRET header) and idempotency (the function is already safe to call multiple times on the same rows because it only matches `assigned` or `started` status). The audio purge sweep is new server logic but follows the same pattern: query expired rows, batch-delete Storage objects, mark DB rows deleted.

The needs_retry reopen path requires the only schema-adjacent change in this phase: `assignment-list.ts` currently maps `needs_retry` to `displayStatus = "closed"`, blocking re-entry. The fix is a targeted one-line change: when `status === "needs_retry"` and not past due, display it as `"start"` (the student can begin a fresh attempt). The mission-flow gate (`startOrResumeAttempt`) also gates on `status !== "assigned"`, so the needs_retry transition must first move status to `assigned` (via `teacher_review -> assigned` is not in the legal table) — actually the correct path is `needs_retry -> started` is legal. See the Full Analysis below.

**Primary recommendation:** Build in four waves: (1) review dashboard + assignment list query, (2) attempt detail gaps + override action, (3) cron wiring for missed-job + audio purge, (4) structured logger.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Review dashboard (per-assignment buckets) | Next.js App Router server component | Supabase (RLS query) | Per-teacher data read; force-dynamic; service-role not needed, RLS-gated via teacher auth |
| Manual override (complete/needs_retry/teacher_review) | Next.js Server Action | Supabase service-role | Status write must be server-owned; service-role bypasses RLS for direct status write + audit insert |
| Missed-homework job trigger | Vercel Cron → API Route Handler | Service-role Supabase | Time-based; must fire even when no teacher is logged in; needs service-role for cross-teacher rows |
| Audio purge | Vercel Cron → API Route Handler | Supabase Storage + service-role | Privacy commitment; must not wait on teacher action |
| Structured logging | Server-only logger module | stdout (Vercel host logs) | Zero dependency; all server paths import it |
| Nav restructure | App Router route hierarchy | ClassList component link | Routing change only; no data migration |
| Needs-retry student reopen | `assignment-list.ts` displayStatus logic | mission-flow startOrResumeAttempt | Student re-entry gate is in two places; both must be updated |

---

## Standard Stack

### Core (already installed — no new packages in Phase 7)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | ^15.0.0 | App Router, server actions, API route handlers | Project foundation [VERIFIED: package.json] |
| `@supabase/supabase-js` | ^2.45.0 | Storage `.remove()`, service-role DB queries | Project foundation [VERIFIED: package.json] |
| `@supabase/ssr` | ^0.12.0 | Cookie-based server auth, `requireTeacherProfile` | Project foundation [VERIFIED: package.json] |

**Phase 7 adds no new npm packages.** All logic uses standard Next.js APIs and the existing Supabase client.

### External Configuration

| Item | Purpose | Where |
|------|---------|--------|
| `vercel.json` (new file) | Cron job schedule definitions | Project root |
| `CRON_SECRET` env var | Route protection for cron endpoints | Vercel dashboard + `.env.local` |

---

## Package Legitimacy Audit

Phase 7 installs no new npm packages. The packages flagged above (`next`, `@supabase/supabase-js`, `@supabase/ssr`) are already present in `package.json` and are legitimate well-established packages with 4M–39M weekly downloads and GitHub-hosted source repos. The "SUS / too-new" verdict from the legitimacy seam reflects a recent patch release date, not a legitimacy concern — these are the same packages used throughout the project.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| `next` | npm | SUS (recent patch release only) | Already installed — no new install needed |
| `@supabase/supabase-js` | npm | SUS (recent patch release only) | Already installed — no new install needed |
| `@supabase/ssr` | npm | SUS (recent patch release only) | Already installed — no new install needed |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious:** none requiring new installation

---

## Architecture Patterns

### System Architecture Diagram

```
Teacher browser
  │
  ├─ GET /teacher/classes/[id]          → NEW review dashboard server component
  │    ├─ lists assignments newest-first (title, due_at)
  │    └─ [select assignment] →
  │         GET /teacher/classes/[id]/review/[assignmentId]
  │              reads assignment_students JOIN students (status, submitted_at)
  │              renders status buckets (completed/not_started/missed/needs_retry/teacher_review)
  │              each row → link to /teacher/evidence/[attemptId]
  │
  ├─ GET /teacher/evidence/[attemptId]  → EXISTING evidence page (force-dynamic, RLS-gated)
  │    ├─ transcripts + AI annotations (already rendered) [REV-04 existing]
  │    ├─ ADD: attempt_count + highest_hint_level from assignment_students [REV-04 gap]
  │    └─ ADD: override controls (complete / needs_retry / teacher_review) [REV-06 new]
  │         └─ server action overrideAssignmentStatusAction
  │              → requireTeacherProfile() → assertTransitionRequest(actorType=teacher)
  │              → UPDATE assignment_students.status
  │              → INSERT assignment_status_events (reason_code, actor_id, optional note in metadata)
  │              → if needs_retry: reset latest_attempt_id, enable student re-entry
  │
  ├─ GET /teacher/classes/[id]/manage   → NEW roster/PIN/join-code management page (was default)
  │
  └─ [class click in ClassList]         → /teacher/classes/[id]  (was /teacher/classes/[id] roster)
                                                                  (now review dashboard — D-01)

Vercel Cron (UTC, once per day minimum on Hobby plan)
  │
  ├─ GET /api/cron/mark-missed          → Authorization: Bearer CRON_SECRET check
  │    └─ markMissedAssignments()       (already implemented; no caller yet — ASGN-05)
  │         → SELECT assignment_students WHERE status IN (assigned, started) + due_at < now
  │         → UPDATE status = missed + INSERT assignment_status_events (actor_type=job)
  │
  └─ GET /api/cron/purge-audio          → Authorization: Bearer CRON_SECRET check
       └─ purgeExpiredAudio()           (new function — PILOT-04)
            → SELECT audio_clips WHERE audio_expires_at < now AND processing_status != deleted
            → Storage.from('student-audio').remove([object_key, ...]) in batches of ≤1000
            → UPDATE audio_clips SET processing_status=deleted, deleted_at=now()
            → if object_key was null/already null: skip Storage call, update DB only

Student browser (needs_retry reopen path — D-10)
  Before override: assignment_students.status = teacher_review
  After override:  assignment_students.status = needs_retry
  assignment-list.ts: needs_retry → displayStatus = "start"   ← MUST CHANGE from "closed"
  mission-flow.ts startOrResumeAttempt: needs_retry status → create new attempt + transition to started
                                        (needs_retry → started is a legal transition in status.ts)
```

### Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── cron/
│   │       ├── mark-missed/route.ts   # Vercel Cron handler (GET, CRON_SECRET auth)
│   │       └── purge-audio/route.ts   # Vercel Cron handler (GET, CRON_SECRET auth)
│   └── teacher/
│       ├── classes/
│       │   ├── [id]/
│       │   │   ├── page.tsx            # REPLACE: now review dashboard (assignment list)
│       │   │   ├── review/
│       │   │   │   └── [assignmentId]/
│       │   │   │       └── page.tsx    # NEW: per-student status buckets for one assignment
│       │   │   └── manage/
│       │   │       └── page.tsx        # NEW: roster/PINs/join code (was default [id]/page.tsx)
│       │   └── actions.ts              # unchanged
│       └── evidence/
│           └── [attemptId]/
│               ├── page.tsx            # EXTEND: add attempt_count, hint_level, override controls
│               └── actions.ts          # EXTEND: add overrideAssignmentStatusAction
├── server/
│   ├── foundation/
│   │   ├── markMissedAssignments.ts   # UNCHANGED — just needs a caller
│   │   └── purgeExpiredAudio.ts       # NEW: Storage delete + DB update
│   ├── teacher/
│   │   └── audio-evidence.ts          # EXTEND: add assignment_students fields to evidence query
│   └── logging/
│       └── logger.ts                  # NEW: structured stdout logger
├── lib/
│   └── supabase/server.ts             # UNCHANGED — already has createSupabaseServiceClient
vercel.json                             # NEW: crons config
```

### Pattern 1: Vercel Cron Route Handler (CRON_SECRET protection)

**What:** A GET route handler that verifies `Authorization: Bearer <CRON_SECRET>` before running any logic. Vercel injects the header automatically on production invocations.

**When to use:** Any automated job that must run on a schedule without a logged-in user, using the service-role Supabase client for cross-teacher data access.

```typescript
// Source: vercel.com/docs/cron-jobs/manage-cron-jobs [CITED]
// src/app/api/cron/mark-missed/route.ts
import type { NextRequest } from "next/server";
import { markMissedAssignments } from "@/server/foundation/markMissedAssignments";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await markMissedAssignments();
    return Response.json({ ok: true, markedCount: result.markedCount });
  } catch (err) {
    // Structured logger call goes here (PILOT-03)
    return Response.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
```

```json
// vercel.json [CITED: vercel.com/docs/cron-jobs]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/mark-missed", "schedule": "0 2 * * *" },
    { "path": "/api/cron/purge-audio",  "schedule": "0 3 * * *" }
  ]
}
```

**Hobby plan note:** Hobby accounts can have at most 2 cron jobs running once per day. The expression `0 2 * * *` (daily at 02:00 UTC) satisfies this. Expressions running more than once per day fail deployment on Hobby. [CITED: vercel.com/docs/cron-jobs/usage-and-pricing]

### Pattern 2: Audio Purge Function (Storage + DB)

**What:** Batch-delete expired audio clips from the Supabase Storage bucket and mark DB rows as deleted. Must use the Storage API (not SQL DELETE) to avoid orphaned objects.

```typescript
// src/server/foundation/purgeExpiredAudio.ts [ASSUMED pattern — no existing code]
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000; // Supabase Storage remove() limit

export async function purgeExpiredAudio(): Promise<{ deletedCount: number }> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from("audio_clips")
    .select("id, object_key")
    .lt("audio_expires_at", now)
    .neq("processing_status", "deleted")
    .limit(BATCH_SIZE);

  if (error || !expired || expired.length === 0) {
    return { deletedCount: 0 };
  }

  // Separate clips that have a Storage object from those that don't
  const withObject = expired.filter((c) => c.object_key);
  const withoutObject = expired.filter((c) => !c.object_key);

  let deletedCount = 0;

  // Delete from Storage
  if (withObject.length > 0) {
    const keys = withObject.map((c) => c.object_key as string);
    const { error: storageError } = await supabase.storage
      .from(process.env.STUDENT_AUDIO_BUCKET || "student-audio")
      .remove(keys);

    // Log storage error but still mark DB rows to avoid re-attempting
    // the same already-missing keys on the next run
    if (storageError) {
      // structured logger call goes here
    }
  }

  // Update DB for all rows (whether Storage delete succeeded or not)
  const ids = expired.map((c) => c.id);
  await supabase
    .from("audio_clips")
    .update({
      processing_status: "deleted",
      deleted_at: now,
      deleted_reason: "audio_expires_at_elapsed",
    })
    .in("id", ids);

  deletedCount = ids.length;

  // If we hit the batch limit, there may be more rows; caller can loop or next
  // daily run will catch the remainder (reconciliation-based idempotency).
  return { deletedCount };
}
```

**Partial failure behavior:** The Supabase Storage `remove()` error is at the batch level — if it fails, DB rows are still marked deleted to avoid re-queueing stale keys. The transcript evidence remains intact (deletion only nulls the Storage object, not the audio_clips row or the clip.processing_status='deleted' indicator). [CITED: supabase.com/docs/guides/storage/management/delete-objects]

### Pattern 3: Teacher Override Server Action (Audited Status Transition)

**What:** A "use server" action called from the evidence page after a confirmation dialog. Uses `requireTeacherProfile()` for auth, `assertTransitionRequest()` for gate keeping, and writes both the status update and the audit event.

```typescript
// src/app/teacher/evidence/[attemptId]/actions.ts (EXTEND)
"use server";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { assertTransitionRequest } from "@/domain/foundation/status";
import type { AssignmentStudentStatus } from "@/domain/foundation/status";

export type OverrideResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "invalid_transition" | "not_found" | "db_error" };

export async function overrideAssignmentStatusAction(input: {
  assignmentStudentId: string;
  nextStatus: "completed" | "needs_retry" | "teacher_review";
  reasonNote?: string;
}): Promise<OverrideResult> {
  const profile = await requireTeacherProfile();
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  // Load current status (service-role so we can read cross-teacher for validation,
  // but ownership is verified via the RLS-gated attempt that got us here)
  const { data: asRow } = await supabase
    .from("assignment_students")
    .select("id, status")
    .eq("id", input.assignmentStudentId)
    .maybeSingle();

  if (!asRow) return { ok: false, error: "not_found" };

  try {
    assertTransitionRequest({
      previousStatus: asRow.status as AssignmentStudentStatus,
      nextStatus: input.nextStatus,
      actorType: "teacher",
      actorId: profile.id,
      reasonCode: "teacher_override",
      occurredAt: now,
    });
  } catch {
    return { ok: false, error: "invalid_transition" };
  }

  const { error: updateError } = await supabase
    .from("assignment_students")
    .update({ status: input.nextStatus })
    .eq("id", input.assignmentStudentId);

  if (updateError) return { ok: false, error: "db_error" };

  await supabase.from("assignment_status_events").insert({
    assignment_student_id: input.assignmentStudentId,
    previous_status: asRow.status,
    next_status: input.nextStatus,
    actor_type: "teacher",
    actor_id: profile.id,
    reason_code: "teacher_override",
    metadata: input.reasonNote ? { note: input.reasonNote } : {},
  });

  return { ok: true };
}
```

### Pattern 4: Structured Logger (Zero Dependency)

**What:** A tiny server-only module that writes `JSON.stringify` lines to stdout. Vercel captures stdout as structured log entries viewable in the project runtime logs.

```typescript
// src/server/logging/logger.ts [ASSUMED pattern — no existing code]
// SECURITY: never import from client components
type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  event: string;
  [key: string]: unknown;
};

export function log(level: LogLevel, event: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(context ?? {}),
  };
  // stdout — Vercel aggregates this in runtime logs
  process.stdout.write(JSON.stringify(entry) + "\n");
}
```

**Instrumentation points** (discovered by searching for `console.*` — there are currently NONE in `src/`; this is additive):

| Point | Event name | Level | Context fields |
|-------|-----------|-------|---------------|
| `completeAttempt` success | `assignment.completed` | info | `assignmentStudentId`, `attemptId` |
| `completeAttempt` db error | `assignment.completion_failed` | error | `assignmentStudentId`, error message |
| Audio upload success (audio-upload.ts) | `audio.uploaded` | info | `clipId`, `processingStatus` |
| Transcription failure (transcription.ts) | `audio.transcription_failed` | error | `clipId`, error message |
| AI evaluation failure (turn-evaluator.ts) | `ai.evaluation_failed` | error | `attemptTurnId`, `reviewReason` |
| `markMissedAssignments` run | `job.mark_missed.complete` | info | `markedCount` |
| `markMissedAssignments` error | `job.mark_missed.failed` | error | error message |
| `purgeExpiredAudio` run | `job.purge_audio.complete` | info | `deletedCount` |
| Storage delete error in purge | `job.purge_audio.storage_error` | warn | error message, `clipCount` |
| Retention/deletion audit | `job.purge_audio.deleted` | info | `clipId`, `audioExpiresAt` |

### Anti-Patterns to Avoid

- **SQL-deleting audio_clips rows instead of using Storage.remove():** Deleting via SQL orphans the object in the bucket. Always call Storage `.remove()` first, then update the DB row. [CITED: supabase.com/docs/guides/storage/management/delete-objects]
- **Running the cron endpoint without CRON_SECRET check:** Without the Authorization header check, any unauthenticated actor can trigger the missed-job or purge. Always verify `authHeader !== \`Bearer \${cronSecret}\`` and return 401 immediately if it doesn't match.
- **Setting needs_retry without fixing the student re-entry gate:** The override server action sets `assignment_students.status = needs_retry`, but the student flow has TWO gates that currently block re-entry for this status: (1) `assignment-list.ts` line 96 maps `needs_retry` to `displayStatus = "closed"`, and (2) `mission-flow.ts` line 249 returns `not_assigned_or_started` if `status !== "assigned"`. Both must be fixed. See the Needs-Retry Reopen analysis below.
- **Querying all statuses across all assignments for review buckets:** The current class page does a flat evidence list across all assignments. The new review dashboard must scope to one assignment at a time (D-03) to avoid a student being counted in multiple buckets across missions.
- **Using `teacher_review -> assigned` transition for needs_retry:** This transition is NOT in the legal transition table. The correct path is `teacher_review -> needs_retry`, then the student flow must accept `needs_retry` as a launchable state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status transition validation | Custom if/else chains | `assertTransitionRequest()` from `@/domain/foundation/status` | Already encodes all legal transitions; throws on illegal ones |
| Audit event writing | Ad-hoc insert per callsite | The established pattern: insert to `assignment_status_events` with all required fields | Consistency with existing Phase 1–6 audit trail |
| Audio Storage deletion | SQL DELETE on `audio_clips` | `supabase.storage.from(bucket).remove([keys])` then DB update | SQL DELETE orphans the storage object |
| Teacher auth check | Manual cookie reading | `requireTeacherProfile()` from `@/server/auth/teacher-profile` | Already handles redirect, RLS, and profile loading |
| Service-role Supabase client | New client factory | `createSupabaseServiceClient()` from `@/lib/supabase/server` | Established pattern; confined to server-only paths |
| Cron protection | IP allowlist or custom token scheme | `CRON_SECRET` Authorization header pattern | Vercel injects it automatically; no infra change needed |
| Structured logging | External observability service (Datadog, etc.) | Stdout JSON via `process.stdout.write` | Vercel captures stdout as runtime logs at no extra cost |

---

## Needs-Retry Reopen Analysis (D-10 — Critical Detail)

**Current behavior (broken for needs_retry re-entry):**

1. `assignment-list.ts` line 96: `else { displayStatus = "closed"; }` — catches `needs_retry`, `missed`, `teacher_review` — student sees it as non-launchable.
2. `mission-flow.ts` line 249: `if (asRow.status !== "assigned") { return { ok: false, error: "not_assigned_or_started" }; }` — blocks new attempt creation for non-`assigned` status.

**Legal transition path from `teacher_review -> needs_retry`:**

Per `status.ts` LEGAL_TRANSITIONS (verified): `teacher_review -> needs_retry` is legal. `needs_retry -> started` is also legal.

**Required fixes:**

1. `assignment-list.ts`: Change the catch-all `else` branch to check `needs_retry` explicitly:
   ```typescript
   } else if (row.status === "needs_retry") {
     displayStatus = isPastDue ? "closed" : "start";
   } else {
     displayStatus = "closed"; // missed, teacher_review — still non-launchable
   }
   ```

2. `mission-flow.ts` `startOrResumeAttempt`: Extend the gate condition to accept `needs_retry`:
   ```typescript
   // Before: if (asRow.status !== "assigned")
   // After:
   if (asRow.status !== "assigned" && asRow.status !== "needs_retry") {
     return { ok: false, error: "not_assigned_or_started" };
   }
   ```
   When `needs_retry`, create a new attempt and transition `needs_retry -> started` (legal per transition table). The `reasonCode` should be `"reopened_by_teacher"`.

3. The override server action that sets `needs_retry` should also reset `latest_attempt_id = null` so the student gets a fresh start rather than resuming the rejected attempt.

**Student-visible state:** Student sees "Start" badge on the assignment, enters PIN, and can record from turn 1 again. The previous attempt's data is retained in the DB (not deleted) for teacher audit history.

---

## Server-Owned Status Audit Path (D-08, D-09, D-10, REV-06)

**Verified existing audit infrastructure** (foundation_schema.sql + status.ts):

The `assignment_status_events` table has columns: `assignment_student_id`, `previous_status`, `next_status`, `actor_type` (enum: system/teacher/student_session/job/ai_evaluator), `actor_id` (uuid, optional), `reason_code` (text, required), `metadata` (jsonb), `created_at`.

`assertTransitionRequest()` requires `reasonCode` and `occurredAt` (non-empty, valid timestamp). For `actorType = "teacher"`, it additionally requires `actorId`. The teacher override action must pass `profile.id` as `actorId`.

Optional reason note (D-09): store in `metadata: { note: reasonNote }`. This keeps the schema clean — no new column needed.

**All five legal teacher-triggered transitions for Phase 7:**

| From | To | Reason Code | Actor Type |
|------|----|-------------|-----------|
| `teacher_review` | `completed` | `teacher_override` | `teacher` |
| `teacher_review` | `needs_retry` | `teacher_override` | `teacher` |
| `teacher_review` | `started` | `teacher_override` | `teacher` |
| `completed` | `teacher_review` | `teacher_override` | `teacher` |
| `started` | `teacher_review` | `teacher_override` | `teacher` |

The evidence page operates on `attempts.status` for display (the route loads an `attemptId`), but the override action writes to `assignment_students.status`. The server action must join from `attemptId → attempts.assignment_student_id → assignment_students.id` to find the correct row. The existing `getAttemptEvidenceForTeacher` service already traverses this join chain.

---

## REV-04 Gap Analysis (What's Already There vs What's Missing)

**Already rendered on `/teacher/evidence/[attemptId]/page.tsx`:**

- Student name, mission title (from `AttemptEvidence.studentName/missionTitle`) [VERIFIED: code]
- Attempt status + review reason (header summary section) [VERIFIED: code]
- Submitted at / completed at [VERIFIED: code]
- Per-turn: original transcript, improved sentence, repeat transcript [VERIFIED: code]
- Per-turn: AI annotations (communicated clearly, used target language, repeated correctly) [VERIFIED: code]
- Per-turn: teacher review reason and audio clips [VERIFIED: code]

**Missing from REV-04 (must be added in Phase 7):**

- `attempt_count` — lives on `assignment_students`, not on `attempts` or `attempt_turns`. The `getAttemptEvidenceForTeacher` service needs to add `assignment_students.attempt_count` to its query.
- `highest_hint_level` — also on `assignment_students`. Same service extension needed.
- Override controls (mark complete / needs retry / teacher review) — entirely new UI with confirmation step (D-08, D-09). Must be wired to the new server action.

The `AttemptEvidence` type and the service query in `audio-evidence.ts` need two additional fields exposed. The evidence page is already `force-dynamic` and RLS-gated, so no auth changes are needed — only a query extension and a UI section.

---

## Nav Restructure Plan (D-01, D-02)

**Current route:** `/teacher/classes/[id]` renders `ClassRosterPage` — shows roster editor + evidence link list. `ClassList` component links to `href="/teacher/classes/${classItem.id}"`.

**Required changes (no data migration needed, only file structure):**

1. Move current `/teacher/classes/[id]/page.tsx` content to `/teacher/classes/[id]/manage/page.tsx`. This becomes the class management page (roster, PINs, join code).

2. Replace `/teacher/classes/[id]/page.tsx` with the new review dashboard: lists assignments newest-first, each linking to `/teacher/classes/[id]/review/[assignmentId]`.

3. Create `/teacher/classes/[id]/review/[assignmentId]/page.tsx` — the per-assignment student bucket page.

4. Update `ClassList.tsx` link destination: `href="/teacher/classes/${classItem.id}"` — no change needed since the new page takes over at this URL.

5. Update the back-link in the current `ClassRosterPage` (moving to manage): the header's `← Classes` link stays as `/teacher`.

**Existing links that use `/teacher/classes/[id]`:** Only `ClassList.tsx` (verified: line 118). No other hardcoded references found in `src/`.

---

## Common Pitfalls

### Pitfall 1: Cron Not Firing on Hobby Plan
**What goes wrong:** Cron expression like `0 * * * *` (hourly) causes deployment failure: "Hobby accounts are limited to daily cron jobs." [CITED: vercel.com/docs/cron-jobs/usage-and-pricing]
**Why it happens:** Hobby tier enforces once-per-day maximum. The expression must evaluate to exactly one trigger per 24 hours.
**How to avoid:** Use `0 H * * *` format where H is any hour 0–23. Two separate daily crons (mark-missed + purge-audio) are fine — Hobby allows up to 100 cron jobs, just limited to daily frequency.
**Warning signs:** Deployment error message during `vercel deploy` or `next build`.

### Pitfall 2: Orphaned Storage Objects via SQL Delete
**What goes wrong:** `supabase.from("audio_clips").delete()...` removes the DB row but leaves the object in Storage, consuming quota forever. [CITED: supabase.com/docs/guides/storage/management/delete-objects]
**Why it happens:** The `audio_clips` table and Storage bucket are separate — the DB has `object_key` pointing to Storage, but there is no FK cascade to Storage.
**How to avoid:** Always call `supabase.storage.from(bucket).remove([keys])` before or instead of the DB delete. The `purgeExpiredAudio` pattern above updates `processing_status = 'deleted'` rather than deleting the row, which preserves the audit trail.
**Warning signs:** Storage bucket size grows even after purge runs.

### Pitfall 3: Needs-Retry Reopen Broken for Students
**What goes wrong:** Teacher sets needs_retry, student sees "closed" on their homework list, cannot re-record. [VERIFIED: assignment-list.ts line 96]
**Why it happens:** The catch-all else branch in `listStudentAssignments` covers `needs_retry` as well as `missed` and `teacher_review`.
**How to avoid:** Add explicit `needs_retry` branch returning `"start"` when not past due (see pattern above).
**Warning signs:** After override, student sees a non-interactive "closed" badge instead of a "Start" button.

### Pitfall 4: Override Action Finds Wrong assignment_students Row
**What goes wrong:** The evidence page URL is `/teacher/evidence/[attemptId]`, but the override must write to `assignment_students` not `attempts`. Confusing the two leads to writing an audit event to the wrong row ID.
**Why it happens:** The evidence page is attempt-scoped; the override is assignment-student-scoped.
**How to avoid:** The override server action must resolve `attemptId → attempts.assignment_student_id → assignment_students.id` (or the UI can pass `assignmentStudentId` extracted from `evidence.assignmentStudentId`, which must be added to the evidence query).
**Warning signs:** `assertTransitionRequest` throws "Illegal assignment status transition" because the loaded status doesn't match what the teacher sees.

### Pitfall 5: Cron Delivery Not Guaranteed
**What goes wrong:** A day's missed-job or purge run silently skips because of a transient Vercel network error. Homework stays stuck in `assigned/started` past due date.
**Why it happens:** Vercel documents cron as "best effort" — can miss or duplicate runs. [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]
**How to avoid:** `markMissedAssignments()` is already idempotent by design (SELECT → filter `shouldMarkMissed` → UPDATE/INSERT only for qualifying rows). A next-day run will catch yesterday's misses. Audio purge is reconciliation-based for the same reason.
**Warning signs:** `assignment_students` rows stuck in `started/assigned` status days after `due_at` passed.

### Pitfall 6: Review Dashboard Query Spans All Assignments
**What goes wrong:** A student who completed Assignment A but is in `teacher_review` for Assignment B appears in two buckets — ambiguous teacher view.
**Why it happens:** Querying `assignment_students` without scoping to `assignment_id` returns rows across multiple assignments.
**How to avoid:** The review page at `/teacher/classes/[id]/review/[assignmentId]` filters `assignment_id = assignmentId` explicitly (D-03).
**Warning signs:** Student appears more than once in the bucket list.

---

## Runtime State Inventory

Phase 7 does not rename or migrate any existing data. The `audio_expires_at` column and the `deleted` enum value already exist. No runtime state items to audit. N/A — greenfield additions only.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `next` | All routes | ✓ | ^15.0.0 | — |
| `@supabase/supabase-js` | Storage remove(), DB queries | ✓ | ^2.45.0 | — |
| `CRON_SECRET` env var | Cron route auth | Not yet set (new) | — | Must add to `.env.local` and Vercel dashboard before cron routes work |
| `vercel.json` | Cron schedule | Does not exist yet | — | Must create at project root |
| Vercel Hobby vs Pro plan | Cron frequency | Unknown [ASSUMED] | — | Hobby: once per day max; Pro: once per minute |

**Missing dependencies with no fallback:**
- `CRON_SECRET` env var must be set; the route returns 401 without it (also returns 401 if `process.env.CRON_SECRET` is undefined — the check `!cronSecret` catches this).

**Missing dependencies with fallback:**
- `vercel.json` must be created before deployment; local dev can test cron routes by directly hitting `http://localhost:3000/api/cron/mark-missed` with the correct Authorization header.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.8 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ASGN-05 | `markMissedAssignments()` called from cron route; route returns 401 without secret | unit (mock supabase) | `npx vitest run tests/server/mark-missed-cron.test.ts` | ❌ Wave 0 |
| REV-01 | Assignment-student rows bucketed by status correctly | unit (domain logic) | `npx vitest run tests/domain/review-buckets.test.ts` | ❌ Wave 0 |
| REV-02 | `assignment_students.attempt_count` and `highest_hint_level` appear in evidence | unit (mock service) | `npx vitest run tests/server/audio-evidence.test.ts` | ✅ extend |
| REV-04 | Evidence query returns new fields (attempt_count, highest_hint_level) | unit (mock supabase) | `npx vitest run tests/server/audio-evidence.test.ts` | ✅ extend |
| REV-06 | Override action writes correct status + audit event | unit (mock supabase) | `npx vitest run tests/server/teacher-override.test.ts` | ❌ Wave 0 |
| REV-06 | Illegal override transition rejected | unit | same as above | ❌ Wave 0 |
| ASGN-05 (D-10) | `needs_retry` maps to `displayStatus = "start"` in listStudentAssignments | unit | `npx vitest run tests/server/assignment-list.test.ts` | ✅ extend |
| ASGN-05 (D-10) | `startOrResumeAttempt` creates new attempt for `needs_retry` status | unit | `npx vitest run tests/server/student-mission-flow.test.ts` | ✅ extend |
| PILOT-03 | Logger emits JSON line to stdout | unit | `npx vitest run tests/server/logger.test.ts` | ❌ Wave 0 |
| PILOT-04 | `purgeExpiredAudio()` calls Storage.remove() then updates DB | unit (mock supabase) | `npx vitest run tests/server/purge-audio.test.ts` | ❌ Wave 0 |
| PILOT-04 | Purge handles Storage error without crashing | unit | same as above | ❌ Wave 0 |

**High-risk behaviors requiring specific test coverage:**

1. **Cron route 401 without secret** — prevents accidental invocation from unauthenticated callers.
2. **Idempotency of markMissedAssignments** — running twice on the same overdue rows does not double-insert audit events. (The existing `tests/server/student-mission-flow.test.ts` covers the transition logic; the new cron test covers the route auth.)
3. **needs_retry → student can launch** — both `assignment-list.ts` and `mission-flow.ts` changes tested in existing test files.
4. **Override with illegal transition rejects** — `assertTransitionRequest` throws; action returns `{ ok: false, error: "invalid_transition" }`.
5. **Storage batch limit** — `purgeExpiredAudio` limited to BATCH_SIZE=1000 rows per run; subsequent runs pick up remainder.

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/server/mark-missed-cron.test.ts` — cron route auth (401 without secret, 200 with correct secret)
- [ ] `tests/server/teacher-override.test.ts` — override server logic (status write, audit event, illegal transition rejection)
- [ ] `tests/server/purge-audio.test.ts` — Storage remove + DB update, Storage error resilience
- [ ] `tests/server/logger.test.ts` — stdout JSON emission (capture process.stdout.write mock)

*(Existing test files for `assignment-list.ts`, `student-mission-flow.test.ts`, `audio-evidence.test.ts` need extension but the files exist.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireTeacherProfile()` gates all teacher routes and actions |
| V3 Session Management | partial | Teacher session via `@supabase/ssr` cookies (established); cron routes have no session, protected by `CRON_SECRET` header |
| V4 Access Control | yes | Teacher override action must verify teacher owns the attempt's class (traverse attemptId → assignment_student → assignment → class.teacher_id). Use `getAttemptEvidenceForTeacher` teacher_id check pattern. |
| V5 Input Validation | yes | nextStatus must be one of the three allowed override values; `assertTransitionRequest()` validates the transition; optional note is stored in `metadata` jsonb (no injection risk) |
| V6 Cryptography | no | No new crypto; audio signed URLs use Supabase's built-in 5-minute TTL |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated cron invocation | Elevation of Privilege | `CRON_SECRET` Bearer check; return 401 immediately if absent/wrong |
| Teacher overriding another teacher's student | Spoofing / Info Disclosure | Resolve `attemptId → class.teacher_id` and compare to `requireTeacherProfile().id`; use existing `getAttemptEvidenceForTeacher` ownership check |
| Forced status transition skipping guard | Tampering | `assertTransitionRequest()` throws on illegal transitions; never pass nextStatus directly to DB without this guard |
| Storage object enumeration from audit trail | Info Disclosure | `object_key` values are UUIDs (not guessable); audio URLs are signed with 5-min TTL via Supabase |
| Duplicate cron invocation writing duplicate audit events | Tampering | `markMissedAssignments()` does a conditional UPDATE only for rows in `assigned/started` status; once transitioned to `missed`, subsequent runs skip them |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cron via external service (e.g., GitHub Actions cron calling a deploy hook) | Vercel Cron in `vercel.json` (built-in) | Vercel added native cron in 2023 | No external dependency needed; free on all plans |
| Storage deletion via SQL `DELETE` | `supabase.storage.from(bucket).remove()` then DB update | Supabase Storage v2 | SQL delete orphans bucket objects |
| Ad-hoc `console.log` for server logging | Structured JSON to stdout | Vercel runtime logs (always) | Logs become queryable/filterable in Vercel dashboard |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hobby Vercel plan is in use (once-per-day cron limit applies) | Vercel Cron | If Pro plan, could use more frequent crons — low impact, design is compatible with both |
| A2 | `process.stdout.write` in Next.js server components/actions emits to Vercel runtime logs | Structured Logger | If Vercel captures only `console.*`, must use `console.log` instead — trivial fix |
| A3 | Storage `remove()` partial failure returns a batch-level error (not per-key) | Audio Purge | If partial successes are returned in `data`, need to filter `data` array for failed keys — adjust DB update accordingly |
| A4 | The teacher who can view an attempt via the evidence page is authorized to override it | Security | Already enforced by `getAttemptEvidenceForTeacher(teacherId)` teacher_id filter — low risk |
| A5 | `purgeExpiredAudio` running BATCH_SIZE=1000 per invocation is sufficient for pilot scale | Audio Purge | Pilot with a small class (e.g., 30 students × 3 turns × 2 clips = 180 clips per assignment) — well within 1000 limit |

---

## Open Questions

1. **Vercel plan tier**
   - What we know: Hobby plan limits cron to once per day; Pro allows once per minute.
   - What's unclear: Which plan this deployment uses.
   - Recommendation: Default to once-per-day cadence (`0 2 * * *`, `0 3 * * *`); this is pilot-safe. If the project is on Pro, the planner may choose a more frequent missed-job sweep.

2. **Should `purgeExpiredAudio` loop until exhausted, or process one batch per invocation?**
   - What we know: Batch limit is 1000; pilot scale is unlikely to exceed this. Daily run catches remainder.
   - What's unclear: Expected clip volume at pilot time.
   - Recommendation: Single batch per invocation (simplest, safe at pilot scale). Log count so the operator can see if volume is approaching 1000.

3. **Should deletion events be written to `assignment_status_events` or a separate audit log?**
   - What we know: `assignment_status_events` tracks assignment-level transitions; audio deletion is clip-level.
   - What's unclear: Whether PILOT-04 requires a clip-level audit trail.
   - Recommendation: Log the deletion event to structured logger (stdout), not `assignment_status_events`. The `deleted_at`, `deleted_reason`, and `processing_status = 'deleted'` columns on `audio_clips` serve as the clip-level audit record.

---

## Sources

### Primary (verified against live codebase)
- `src/domain/foundation/status.ts` — LEGAL_TRANSITIONS table, assertTransitionRequest, shouldMarkMissed [VERIFIED: Read tool]
- `src/server/foundation/markMissedAssignments.ts` — existing implementation, confirmed no caller [VERIFIED: Read tool]
- `src/server/student-access/assignment-list.ts` — needs_retry catch-all bug, displayStatus logic [VERIFIED: Read tool]
- `src/server/student-access/mission-flow.ts` — `status !== "assigned"` gate at line 249 [VERIFIED: Read tool]
- `src/server/teacher/audio-evidence.ts` — existing evidence query structure and missing fields [VERIFIED: Read tool]
- `src/app/teacher/evidence/[attemptId]/page.tsx` — what REV-04 already renders [VERIFIED: Read tool]
- `src/app/teacher/classes/[id]/page.tsx` — current nav structure, ClassList link destination [VERIFIED: Read tool]
- `supabase/migrations/202606250001_foundation_schema.sql` — audio_expires_at column, deleted enum, assignment_status_events schema [VERIFIED: Read tool]
- `package.json` — confirmed no new packages needed, existing versions [VERIFIED: Read tool]

### Secondary (official Vercel documentation)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) — cron expression format, GET handler pattern [CITED]
- [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — CRON_SECRET Authorization header, idempotency requirements, local dev approach [CITED]
- [Cron Jobs Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby: once per day, 100 crons max; Pro: once per minute [CITED]
- [Supabase Storage Delete Objects](https://supabase.com/docs/guides/storage/management/delete-objects) — remove() API, 1000-object batch limit, SQL-delete warning [CITED]

### Tertiary (LOW confidence — assumptions log)
- Storage remove() partial failure behavior — behavior inferred from documentation absence; marked [ASSUMED: A3]
- Vercel plan tier — unknown; designed to work on Hobby [ASSUMED: A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing installed
- Architecture: HIGH — verified against actual code files
- Nav restructure: HIGH — single link in ClassList.tsx confirmed
- Needs-retry reopen path: HIGH — both blocking lines verified in source
- REV-04 gap: HIGH — evidence page code read and missing fields identified
- Vercel Cron pattern: MEDIUM — from official Vercel docs
- Storage remove() partial failure: LOW — not explicitly documented
- Hobby plan assumption: LOW — unverified

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (Next.js 15 and Supabase SDK stable; Vercel Cron API stable)
