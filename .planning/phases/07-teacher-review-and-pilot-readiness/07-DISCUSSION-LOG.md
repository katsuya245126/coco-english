# Phase 07: Teacher Review and Pilot Readiness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 07-teacher-review-and-pilot-readiness
**Areas discussed:** Dashboard buckets & nav, Manual override UX, Missed-job trigger, Logging & retention

---

## Dashboard buckets & nav

### Where buckets live

| Option | Description | Selected |
|--------|-------------|----------|
| On the class detail page | Class page evidence-first, roster demoted behind a tab | |
| Separate review dashboard | New /teacher/review route holds buckets | ✓ |

### Bucket scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per assignment | Buckets group students within one assignment | ✓ |
| Per class (all assignments) | Buckets aggregate every student across all assignments | |
| You decide | Planner picks | |

### Scan row columns (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Status badge | Completed/in-progress/needs-retry/teacher-review/missed/not-started | ✓ |
| Attempt count | How many attempts | |
| Submitted time | Last submitted | ✓ |
| Highest hint level | Max hint revealed | |

### REV-02 reconciliation (attempt count + highest hint required by spec)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep row minimal, details on open | Attempt count + hint level in attempt detail (REV-04) | ✓ |
| Add them back to the row | Compact columns in each row | |
| You decide | Planner chooses | |

### Class nav reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Separate dashboard supersedes the note | Leave class page as-is | |
| Both — link class → review, demote roster | Class points to review; roster demoted | (see note) |
| You decide | Planner picks | |

**User's choice (free text):** "It should go to teacher/review when you click the class, and show class management in separate page."

### Assignment selection on landing

| Option | Description | Selected |
|--------|-------------|----------|
| List assignments, pick one | Newest-first list, tap one → buckets | ✓ |
| Default to latest assignment | Show latest immediately + switcher | |
| You decide | Planner picks | |

**Notes:** Click-class → review dashboard; roster/PIN/join-code management on its own page. Per-assignment buckets, assignments listed newest-first. Row stays status + submitted time; attempt count and highest hint level surfaced in attempt detail to keep REV-02 satisfied.

---

## Manual override UX

### Location

| Option | Description | Selected |
|--------|-------------|----------|
| On the attempt detail page | Buttons on /teacher/evidence/[attemptId] | ✓ |
| Both detail page + dashboard row | Quick-action on rows too | |
| You decide | Planner picks | |

### Confirmation / reason

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm, reason optional | Confirmation step, optional audited reason | ✓ |
| One click, no confirm | Immediate apply | |
| Confirm + reason required | Force reason every time | |

### "Needs retry" effect

| Option | Description | Selected |
|--------|-------------|----------|
| Reopens homework for the student | Student can re-record | ✓ |
| Label only, no reopen | Status label only | |
| You decide | Planner picks | |

**Notes:** Override on attempt detail page; confirm required, reason optional + audited; needs-retry reopens the homework so the student can record again (student-visible reopened state honored by the Phase 4/5 flow).

---

## Missed-job trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy sweep on dashboard load | Run job when teacher opens dashboard | |
| Vercel cron (scheduled) | Scheduled route calls the job | (recommended default) |
| Both: cron + lazy fallback | Cron primary, lazy fallback | |
| You decide | Planner picks | ✓ |

**User's choice:** You decide. Operator then approved recording a recommended default.

**Notes:** Delegated to planner. Recommended default recorded in CONTEXT.md: Vercel Cron + protected route calling the existing markMissedAssignments(), because missed is time-based and must run without teacher activity.

---

## Logging & retention

### Logging (PILOT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Structured console logs | Small logger to stdout/Vercel logs, no new dep | ✓ |
| Persist log events to a DB table | Supabase table for events | |
| External log service | Hosted observability | |

### Audio purge (PILOT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Scheduled purge job | Job deletes clips past audio_expires_at | (recommended default) |
| On-access expiry check | Check expiry on request | |
| Manual purge button | Teacher/admin triggers cleanup | |
| You decide | Planner picks | ✓ |

### Trigger default decision

| Option | Description | Selected |
|--------|-------------|----------|
| Record cron as recommended default | Cron noted as recommended for both missed + purge | ✓ |
| Leave fully open | Record only the requirement | |

**Notes:** Structured console logs for PILOT-03. Audio purge delegated; recommended default is the same Vercel Cron mechanism deleting Storage clips and clearing rows past audio_expires_at, independent of teacher activity.

---

## Claude's Discretion

- Missed-job trigger implementation (cron config, route protection) — recommended default cron, planner may deviate.
- Audio-purge trigger implementation — recommended default cron, planner may deviate.
- Logger shape/taxonomy and exact instrumentation points.
- Attempt-detail layout for multi-turn attempts and how reopened/needs-retry state renders to the student.
- Whether audio deletions are audited and how a deleted-clip evidence view degrades.

## Deferred Ideas

- **Visual / mascot character for Coco** — raised by operator ("when are we making the mascot?"). Out of Phase 7 scope, not a v1 requirement. Deferred to v2 / post-pilot, tied to the existing v2.0 vision (Coco Chat + character layer). Character data/behavior already exists from Phase 4; this is the visual presentation layer.
- v2 review improvements (filter by pattern/hint/retry reason; class trends) — REVV2-01/02, out of v1 scope.
