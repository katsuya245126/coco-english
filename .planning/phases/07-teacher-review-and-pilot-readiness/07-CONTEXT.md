# Phase 07: Teacher Review and Pilot Readiness - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 gives teachers a fast way to verify class completion and handle exceptions, and makes the MVP safe to run in a real classroom pilot.

In scope:
- Per-assignment status buckets (completed, not started, missed, needs retry, teacher review) on a teacher review dashboard (REV-01, REV-02).
- Attempt detail review showing original transcript, improved sentence, repeat transcript, target-pattern result, hint usage, and attempt count (REV-03, REV-04).
- Manual teacher override to mark an attempt complete, needs retry, or teacher review (REV-06).
- Automatic marking of overdue incomplete homework as missed (ASGN-05).
- Operational logging for completion, audio processing, transcription, AI evaluation, and retention/deletion failures (PILOT-03).
- A retention/deletion path for stored audio clips past their expiry (PILOT-04).

Out of scope (deferred): visual/mascot character work, v2 review filters/trends, and anything beyond verifying the homework loop is pilot-ready.

</domain>

<decisions>
## Implementation Decisions

### Review Dashboard & Navigation
- **D-01:** Clicking a class in the teacher panel navigates to the **review dashboard** (evidence/review-first), NOT the roster page. This implements the long-standing nav-restructure request: review is the daily job; roster setup is rare.
- **D-02:** Class management (roster, PINs, join code) moves to its **own separate page**, demoted from the default class-click landing.
- **D-03:** Status buckets are scoped **per assignment**, not aggregated across all of a class's assignments (avoids a student being ambiguously bucketed across missions).
- **D-04:** When clicking a class lands on review, the dashboard first **lists the class's assignments, most recent first**; the teacher picks one assignment to see its per-student buckets.
- **D-05:** Buckets shown: completed, not started, missed, needs retry, teacher review.
- **D-06:** The scannable per-student **row shows status badge + submitted time only**. Attempt count and highest hint level are intentionally NOT in the row.
- **D-07:** REV-02's required attempt-count and highest-hint-level data is surfaced in the **attempt detail view** (REV-04), not the scan row. (Note: this is a deliberate operator choice to keep the row minimal; the planner should ensure REV-02 is still satisfied via the detail view rather than dropping the data entirely.)

### Manual Override
- **D-08:** Override controls (mark complete / needs retry / teacher review) live **on the attempt detail page** (`/teacher/evidence/[attemptId]`), where the teacher has already seen transcript + audio + AI annotations. No override without reviewing.
- **D-09:** Overrides require a **confirmation step**; a **reason note is optional** and, when provided, is stored in the audit event. Status transitions remain server-owned and audited (actor type teacher).
- **D-10:** Marking an attempt **"needs retry" reopens the homework** for the student so they can re-record. This needs a student-visible reopened state and a status transition the student flow honors (not just a label).

### Missed-Homework Job
- **D-11:** Overdue incomplete homework must be marked missed automatically (ASGN-05). The existing `markMissedAssignments()` (src/server/foundation/markMissedAssignments.ts) already implements the logic but is **never invoked** — the phase must wire a trigger.
- **D-12:** Trigger mechanism delegated to the planner (Claude's discretion). **Recommended default: Vercel Cron + a protected route** calling `markMissedAssignments()` daily, because "missed" is time-based and must become true even when no teacher logs in. A lazy on-read sweep alone is insufficient.

### Logging & Retention
- **D-13:** Operational logging (PILOT-03) uses a **small structured logger** (level + event + context) replacing ad-hoc `console.*` at the key failure points (completion, audio processing, transcription, AI evaluation, retention/deletion). Output to stdout / host (Vercel) logs. No new dependency.
- **D-14:** Audio retention/deletion (PILOT-04) acts on the existing `audio_expires_at` column (30-day default in 202606250001_foundation_schema.sql). Trigger mechanism delegated to the planner (Claude's discretion). **Recommended default: the same Vercel Cron mechanism**, a scheduled route that deletes Storage clips and clears rows past `audio_expires_at`, run independent of teacher activity (deletion is a privacy commitment and must not wait on a teacher).

### Claude's Discretion
- Exact trigger implementation for the missed-job and audio-purge (cron config, route protection scheme such as a CRON_SECRET header, scheduling cadence) — recommended default is cron, but the planner may deviate with rationale during research.
- Logger shape/level taxonomy and exact instrumentation points.
- Attempt-detail layout for multi-turn attempts (per-turn vs summarized) and how reopened/needs-retry state renders to the student — keep within existing status-transition rules.
- Whether audio deletions are themselves audited and how a deleted-clip evidence view degrades (transcript remains, audio gone) — sensible defaults expected.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Source Of Truth
- `.planning/ROADMAP.md` — Phase 7 goal, MVP mode, dependency on Phase 6, requirements (ASGN-05, REV-01–04, REV-06, PILOT-03, PILOT-04), and success criteria.
- `.planning/REQUIREMENTS.md` — Requirement definitions for ASGN-05, REV-01, REV-02, REV-03, REV-04, REV-06, PILOT-03, PILOT-04.
- `.planning/STATE.md` — Current phase status and accumulated cross-phase decisions (server-owned status, audit events, AI annotations from Phase 6).

### Prior Phase Contracts
- `.planning/phases/06-ai-mission-and-turn-intelligence/06-CONTEXT.md` — AI evaluation fields, teacher-review routing, and the explicit deferral of dashboard buckets + manual override to Phase 7.
- `.planning/phases/05-voice-capture-and-evidence-storage/05-CONTEXT.md` — Audio/transcription evidence constraints, private student-audio bucket, transcript-gated progression (relevant to retention/deletion and evidence detail).
- `.planning/phases/04-guided-student-attempt-loop/04-CONTEXT.md` — Student attempt loop, completion rules, hint rollup, and resume behavior (relevant to "needs retry" reopening homework).
- `.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md` — Server-owned status transitions, audit event model, retention fields, demo/real boundary.

### Key Existing Code (verified during scout)
- `src/server/foundation/markMissedAssignments.ts` — overdue→missed logic; exists, audited, but currently has **no caller** (ASGN-05 wiring point).
- `src/app/teacher/classes/[id]/page.tsx` — current class detail page (roster editor + evidence list); the nav restructure (D-01/D-02) reshapes this entry point.
- `src/app/teacher/evidence/[attemptId]/page.tsx` — attempt detail page; host for override controls (D-08) and REV-04 completeness.
- `src/server/teacher/audio-evidence.ts` — existing evidence service.
- `supabase/migrations/202606250001_foundation_schema.sql` — defines `audio_expires_at timestamptz not null default (now() + interval '30 days')` (PILOT-04 retention basis) and the `assignment_status_events` audit table.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `markMissedAssignments()`: full overdue→missed logic with audit events already written — Phase 7 only needs to add a trigger and invoke it.
- `StatusBadge` (inline in class detail page) + assignment_students.status: starting point for bucket rendering; statuses already include the bucket states.
- `audio_expires_at` column + private student-audio bucket: retention metadata already in place; PILOT-04 is a deletion sweep over existing fields, not a schema change.
- Phase 4 hint rollup (GREATEST/Math.max) and attempt records: source for highest-hint-level and attempt-count shown in attempt detail.
- Phase 6 AI annotations on the evidence page: REV-04 target-pattern result / improved sentence likely already surfaced; verify and fill gaps rather than rebuild.

### Established Patterns
- Status transitions are server-owned and audited via `assignment_status_events` (actor_type job/teacher/ai_evaluator). Overrides (teacher) and the missed-job (job) MUST write audit events through this path.
- Teacher pages are `force-dynamic` server components gated by `requireTeacherProfile()` and run under RLS so cross-teacher access resolves to notFound.

### Integration Points
- New review dashboard route + reworked class-click navigation; class management split to its own route.
- Override action on the attempt detail page → server action → audited status transition → (for needs-retry) student-visible reopened state honored by the Phase 4/5 student flow.
- Cron route(s) (recommended) → `markMissedAssignments()` and an audio-purge function over `audio_expires_at`.

</code_context>

<specifics>
## Specific Ideas

- Review dashboard landing for a class shows assignments newest-first (e.g. "Past tense · due Jun 30 ▸"), then drill into one assignment's per-student buckets.
- "Needs retry" must be actionable: the student should actually be able to record again, not just see a label.
- Logging should make a pilot debuggable from the host log viewer without standing up external observability.

</specifics>

<deferred>
## Deferred Ideas

- **Visual / mascot character for Coco** — operator asked when the mascot gets built. Out of Phase 7 scope and not a v1 requirement. Deferred to **v2 / post-pilot**, tied to the existing v2.0 vision (Coco Chat + character layer). Character data/behavior (characterId, tone, safety) already exists from Phase 4; this is the visual presentation layer, to revisit after the pilot validates the homework loop.
- v2 review improvements (filter by target pattern / hint usage / retry reason; class-level trends) — REVV2-01/02, out of v1 scope.

None of these affect Phase 7 planning.

</deferred>

---

*Phase: 07-teacher-review-and-pilot-readiness*
*Context gathered: 2026-06-30*
