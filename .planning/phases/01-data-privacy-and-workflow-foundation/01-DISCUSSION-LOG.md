# Phase 1: Data, Privacy, and Workflow Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 1-Data, Privacy, and Workflow Foundation
**Areas discussed:** Data Boundaries, Status Rules, Child Data Posture, Demo vs Real Classes

---

## Data Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Full workflow skeleton | Create core tables for the full homework loop now, but keep many fields minimal until later phases use them. | yes |
| Only Phase 1 essentials | Create only the smallest foundation and add mission/audio/AI tables later. | |
| Prototype-light schema | Use loose JSON-heavy storage first and normalize later. | |

**User's choice:** Full workflow skeleton.
**Notes:** Chosen to avoid privacy, status, and review rewrites later.

| Option | Description | Selected |
|--------|-------------|----------|
| Mission plus immutable assignment snapshot | Teacher can edit missions later, but each assignment stores the exact mission version students complete. | yes |
| Mission only, assignments reference latest mission | Simpler, but assigned homework can change unexpectedly after teacher edits. | |
| Only snapshots, no reusable mission object | Every assignment is standalone. | |

**User's choice:** Mission plus immutable assignment snapshot.
**Notes:** Assigned homework must be stable after publication.

| Option | Description | Selected |
|--------|-------------|----------|
| Class-scoped students | A student belongs to one class roster entry; same child in two classes is two records for v1. | yes |
| Global student identity | One student record can belong to multiple classes. | |
| Class nickname only | Store only display names per class, no stable student identity beyond assignment. | |

**User's choice:** Class-scoped students.
**Notes:** Avoids global student accounts and keeps v1 privacy simpler.

---

## Status Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Server-owned state machine | App/server code controls legal transitions; client and AI cannot directly set final status. | yes |
| Database-trigger-owned state machine | Postgres triggers enforce transitions. | |
| Client/API sets status directly | Fastest but risky for homework correctness. | |

**User's choice:** Server-owned state machine.
**Notes:** AI and UI can provide evidence or requests, but the application owns final status.

| Option | Description | Selected |
|--------|-------------|----------|
| Due-date job marks missed | Scheduled server job marks incomplete assignments as missed after due date. | yes |
| Computed at read time | Calculate missed status when teacher opens dashboard. | |
| Teacher manually marks missed | Teacher controls missed status manually. | |

**User's choice:** Due-date job marks missed.
**Notes:** Keeps dashboard clear and status history explicit.

| Option | Description | Selected |
|--------|-------------|----------|
| Allow overrides with reason/audit | Teacher can mark complete, needs retry, or teacher review; system records who changed it and when. | yes |
| Allow overrides without reason | Easier UI but weaker accountability. | |
| No teacher overrides | Cleaner automation but frustrating when AI/transcription is wrong. | |

**User's choice:** Allow overrides with reason/audit.
**Notes:** Override audit should capture actor, time, previous/new status, and reason.

---

## Child Data Posture

| Option | Description | Selected |
|--------|-------------|----------|
| Pilot-ready cautious foundation | Build private storage, retention fields, deletion path, and real/demo separation from the start. | yes |
| Demo-only first | Build without real child-data safeguards, then add before pilots. | |
| Strict school-compliance posture | Full consent/export/admin workflows from v1. | |

**User's choice:** Pilot-ready cautious foundation.
**Notes:** Early testing may start with demo data, but the model should not need rework before real pilots.

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days | Enough time for teacher review, lower privacy/storage risk. | yes |
| 60 days | More forgiving for delayed review, stores child voice longer. | |
| Until teacher deletes | Simple but weak privacy default. | |

**User's choice:** 30 days.
**Notes:** Retention can be configurable later, but 30 days is the default planning assumption.

---

## Demo vs Real Classes

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit dataMode: demo vs real | Classes or records can be marked demo or real. | yes |
| Seed-only dev data | Demo examples exist only in local/dev seed scripts. | |
| Separate demo workspace | Strong separation but too much structure for v1. | |

**User's choice:** Explicit `dataMode: demo | real`.
**Notes:** The schema should distinguish demo/sample records from real student records from the start.

## the agent's Discretion

- Exact table and enum names.
- Exact placement of `dataMode`, provided there is one clear source of truth.
- Exact audit event/table shape, provided status transitions and teacher overrides are auditable.

## Deferred Ideas

- Public demo workspace UX.
- Full consent/export/admin compliance workflows.
