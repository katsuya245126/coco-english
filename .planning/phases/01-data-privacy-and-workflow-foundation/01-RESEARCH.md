# Phase 1: Data, Privacy, and Workflow Foundation - Research

## Research Summary

Phase 1 should establish the durable source of truth for teacher-linked speaking homework before UI, recording, transcription, or AI workflows are built. The phase should create a minimal Next.js App Router + TypeScript + Supabase walking skeleton with SQL migrations, generated database types, one server-owned service path, and tests around the data/status/privacy rules. [VERIFIED: AGENTS.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [VERIFIED: .planning/research/STACK.md]

The core product record is not a chat transcript. It is a normalized classroom workflow: teacher profile, class, class-scoped student, mission definition, immutable assignment snapshot, per-student assignment state, attempt, turn records, transcript/evaluation fields, audio clip metadata, and status/review audit events. [VERIFIED: .planning/research/ARCHITECTURE.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

Phase 1 should not build teacher dashboards, student login UI, mission creation UI, audio recording UI, transcription, AI evaluation, polished public demo UX, or consent/export/admin compliance workflows. It should create the database and server boundaries those later phases require. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [VERIFIED: .planning/ROADMAP.md]

**Primary recommendation:** build a thin vertical foundation: Supabase migrations + type generation + one server route/service that writes and reads a real database row through server-side code, with tests for schema constraints, status transitions, retention fields, and demo-vs-real boundaries. [VERIFIED: .planning/research/STACK.md] [VERIFIED: .planning/ROADMAP.md]

## Implementation Architecture

| Capability | Primary Tier | Secondary Tier | Planner Guidance |
|------------|--------------|----------------|------------------|
| Relational source of truth | Supabase Postgres | Next.js server modules | Put durable entities, constraints, enums, timestamps, and audit tables in SQL migrations. Do not encode workflow truth only in TypeScript objects. [VERIFIED: .planning/research/STACK.md] [VERIFIED: .planning/research/ARCHITECTURE.md] |
| Status ownership | Next.js server modules | Supabase Postgres | Status changes should flow through server-side transition functions and audited database writes. Clients and future AI providers provide evidence or requested actions, not final status authority. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| Authorization foundation | Supabase RLS + server-side service boundaries | Next.js route handlers/server actions | Enable RLS on app tables where browser-exposed clients may later read teacher-owned data. Keep service-role access server-only for setup, scheduled jobs, future PIN validation, and AI/audio mutations. [VERIFIED: .planning/research/STACK.md] |
| Demo-vs-real data boundary | Database column/source of truth | Server validation | Store an explicit `data_mode` boundary on `classes`, and copy it to child workflow rows that need audit/filtering. Class-level ownership is the clearest MVP source because students are class-scoped. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| Audio retention foundation | Database metadata | Future storage/job layer | Create audio metadata and retention/deletion fields now, but do not build recording, storage upload, or playback UI in this phase. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/research/PITFALLS.md] |
| Walking skeleton | Next.js app route/service | Supabase local/remote DB | The first verifiable slice should exercise one real database write/read through app code, proving migrations, env loading, database client creation, and tests are wired. [VERIFIED: .planning/research/STACK.md] [ASSUMED] |

Use SQL migrations plus generated Supabase types as the initial database workflow. Existing stack research recommends avoiding Prisma unless the team strongly prefers it, because direct SQL keeps RLS, constraints, and Supabase type generation visible during the MVP. [VERIFIED: .planning/research/STACK.md]

Keep table names plain and durable. Prefer snake_case database names and TypeScript mappers/types at the application boundary if needed. The app has no existing implementation conventions yet, so the planner should choose one clear style and use it consistently. [VERIFIED: AGENTS.md] [ASSUMED]

## Recommended Schema Boundaries

The planner should create the full workflow skeleton in Phase 1, even if later phases leave many fields empty until UI/audio/AI exists. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

| Table / Type | Required In Phase 1 | Notes |
|--------------|---------------------|-------|
| `teacher_profiles` | Yes | One profile per authenticated teacher user; should reference future Supabase Auth user id. Phase 1 can seed/test without implementing full auth UI. [VERIFIED: .planning/research/STACK.md] |
| `classes` | Yes | Teacher-owned class container with `data_mode` enum (`demo`, `real`), name, archived timestamp, and future class-code fields if useful. Choose class-level `data_mode` as the MVP source of truth. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| `students` | Yes | Class-scoped roster records only; do not create global child identity or student auth accounts. Include display name, class id, active/archive fields, and nullable future PIN hash metadata. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| `missions` | Yes | Teacher-authored mission definition with minimal fields: target pattern, topic, level, required turns, character id, status, timestamps. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| `mission_turn_templates` | Yes | Ordered mission prompt templates/hints/expected examples, even if Phase 1 uses seed/test rows only. Later flow phases need stable turn ordering. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| `assignments` | Yes | Published assignment for one class with mission reference, `due_at`, `assigned_at`, and immutable mission snapshot JSON. Snapshot must preserve what students were assigned even if a mission later changes. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| `assignment_students` | Yes | Per-student homework state and teacher dashboard source: status, attempt count, submitted timestamp, highest hint level, latest attempt id if useful. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| `attempts` | Yes | One run through an assigned homework item. Include status, started/completed timestamps, failure/review reason code, and current turn index if useful. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| `attempt_turns` | Yes | One logical turn cycle with original answer and repeat fields. Include template turn id/order, transcript placeholders, improved sentence placeholder, evaluation JSON, indexed evaluation flags, and hint level. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| `audio_clips` | Yes | Metadata only in Phase 1: attempt turn id, clip kind (`original_answer`, `repeat_attempt`), object key nullable until storage exists, mime type, duration, byte size, processing/deletion status, `audio_expires_at`, `deleted_at`, `deleted_reason`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| `status_events` or `assignment_status_events` | Yes | Append-only audit for all assignment-student status transitions: actor type/id, previous status, next status, reason code, metadata, created timestamp. Required for server ownership and teacher overrides. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] |
| `review_events` | Optional as separate table | If not separate, teacher review/override events must still be represented in the audit model. Separate table is cleaner later for notes and decision details. [VERIFIED: .planning/research/ARCHITECTURE.md] [ASSUMED] |

Recommended enums for Phase 1:

- `data_mode`: `demo`, `real`. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- `assignment_student_status`: `assigned`, `started`, `completed`, `missed`, `needs_retry`, `teacher_review`. [VERIFIED: .planning/REQUIREMENTS.md]
- `attempt_status`: `in_progress`, `completed`, `abandoned`, `needs_retry`, `teacher_review`. [VERIFIED: .planning/research/ARCHITECTURE.md]
- `audio_clip_kind`: `original_answer`, `repeat_attempt`. [VERIFIED: .planning/REQUIREMENTS.md]
- `audio_processing_status`: `pending_upload`, `uploaded`, `transcribed`, `failed`, `deleted`. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- `status_actor_type`: `system`, `teacher`, `student_session`, `job`, `ai_evaluator`. AI evaluator is an evidence source, not status owner. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [ASSUMED]

Minimum constraints the planner should include:

- Foreign keys from every child workflow row to its parent entity. [VERIFIED: .planning/research/ARCHITECTURE.md]
- `assignment_students` unique on `(assignment_id, student_id)` to prevent duplicate homework state. [VERIFIED: .planning/research/ARCHITECTURE.md] [ASSUMED]
- `mission_turn_templates` unique on `(mission_id, turn_order)` and `attempt_turns` unique on `(attempt_id, turn_order)`. [VERIFIED: .planning/research/ARCHITECTURE.md] [ASSUMED]
- `audio_clips.audio_expires_at` required for real data and defaulted to 30 days after creation when a real clip is represented. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Demo data must not be silently promoted to real data. The simplest rule is to disallow changing `classes.data_mode` after child rows exist, unless a future explicit migration/admin operation is built. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [ASSUMED]

## Status Transition Model

`assignment_students.status` should be the teacher dashboard source of truth. Store it, audit every transition, and update it only through server-owned transition functions or scheduled jobs. [VERIFIED: .planning/research/ARCHITECTURE.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

Legal assignment-student transitions:

```text
assigned -> started
assigned -> missed
started -> completed
started -> missed
started -> needs_retry
started -> teacher_review
needs_retry -> started
needs_retry -> teacher_review
teacher_review -> completed
teacher_review -> needs_retry
teacher_review -> started
completed -> teacher_review   # manual/anomaly path only
```

Required transition behavior:

- `assigned` starts when per-student assignment rows are created. [VERIFIED: .planning/REQUIREMENTS.md]
- `started` starts when the server creates an active attempt. [VERIFIED: .planning/research/ARCHITECTURE.md]
- `completed` requires server evidence that the required turns and repeat attempts are satisfied. Phase 1 should define the transition function shape and tests; later phases will supply real turn evidence. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/ROADMAP.md]
- `missed` is written by a scheduled due-date job when due date passes and status is still `assigned` or `started`. Do not make missed only a read-time computed status. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- `needs_retry` is a terminal operational state for an attempt that was not acceptable but can be retried. [VERIFIED: .planning/REQUIREMENTS.md]
- `teacher_review` is the uncertainty/safety/inconsistency bucket for low confidence, malformed future AI output, audio/transcript anomalies, or teacher-requested review. [VERIFIED: .planning/research/ARCHITECTURE.md] [VERIFIED: .planning/research/PITFALLS.md]
- Teacher overrides must create audit data with actor, previous status, next status, timestamp, and reason or reason code. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

Implementation shape for the planner:

```ts
type AssignmentStudentStatus =
  | "assigned"
  | "started"
  | "completed"
  | "missed"
  | "needs_retry"
  | "teacher_review";

type StatusActorType = "system" | "teacher" | "student_session" | "job" | "ai_evaluator";

type TransitionRequest = {
  assignmentStudentId: string;
  requestedStatus: AssignmentStudentStatus;
  actorType: StatusActorType;
  actorId?: string;
  reasonCode: string;
  metadata?: Record<string, unknown>;
};
```

The transition function should validate legality, perform the update, and insert the audit event in one database transaction or RPC-style server operation. [ASSUMED]

## Privacy, Retention, and Demo Data Rules

Phase 1 must assume real child data may eventually enter the system, even if initial demos use synthetic records. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

Privacy rules to encode now:

- Store class-scoped student display names, not student email/password accounts or global child profiles. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Store only short per-turn audio clip metadata; do not design tables around full-session recordings. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/research/PITFALLS.md]
- Default audio retention is 30 days. Include `audio_expires_at`, `deleted_at`, `deleted_reason`, and deletion status fields from the beginning. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Private audio storage and signed playback belong to later phases, but the metadata model should already support private object keys and on-demand playback auditing. [VERIFIED: .planning/research/STACK.md] [VERIFIED: .planning/research/ARCHITECTURE.md]
- Demo/sample records must be distinguishable from real student records through `data_mode`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Demo mode should use synthetic students and must not collect child audio. Phase 1 should enforce the schema boundary, not build a polished public demo workspace. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]

Recommended `data_mode` placement:

- Use `classes.data_mode` as the clear MVP source of truth because the current student model is class-scoped and teachers may plausibly have demo and real classes side by side. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [ASSUMED]
- Copy `data_mode` into `assignments` and/or `assignment_students` only if it materially simplifies audit queries and retention jobs. If copied, enforce consistency from the class at creation time. [ASSUMED]
- Do not use only an environment-level demo flag; that cannot safely support one teacher account with both demo and real classes later. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] [ASSUMED]

RLS/server authorization implications:

- Teacher-owned tables should be designed so policies can scope by `teacher_id` or by joins to `classes.teacher_id`. [VERIFIED: .planning/research/STACK.md]
- Future student access should never rely on browser-provided `student_id` alone. Student mutations should be validated by a server-issued student session tied to class, student, and assignment. [VERIFIED: .planning/research/ARCHITECTURE.md]
- Service-role database clients must stay server-only. Phase 1 should put Supabase clients in server modules with naming that makes browser/server use hard to confuse. [VERIFIED: .planning/research/STACK.md]

## Walking Skeleton Guidance

Because this is the first implementation phase and no code exists yet, Wave 0 should create the app scaffold and a minimal database-backed vertical slice before broader schema work fans out. [VERIFIED: AGENTS.md] [VERIFIED: .planning/STATE.md]

Thin slice:

1. Create the Next.js App Router + TypeScript project and baseline test tooling. [VERIFIED: .planning/research/STACK.md]
2. Add Supabase environment handling, server client module, SQL migration directory, and generated DB types workflow. [VERIFIED: .planning/research/STACK.md]
3. Create Phase 1 enums/tables with constraints and minimal seed/test data. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
4. Add a server-only service such as `createDemoClassWithAssignmentSkeleton` or `createFoundationSmokeRecord` that inserts a teacher profile, class, student, mission, assignment, assignment-student row, and initial status audit event. [ASSUMED]
5. Expose one internal route handler or server action used only for the skeleton smoke path, then read back the persisted row and return a narrow typed response. [ASSUMED]
6. Add tests for the service and transition function. The user-facing UI can remain minimal or absent in this phase. [VERIFIED: .planning/config.json]

Recommended file responsibilities once the scaffold exists:

```text
supabase/migrations/          # SQL schema, enums, RLS policies, constraints, seed helpers if needed
src/lib/supabase/server.ts    # server-only Supabase client
src/lib/db/types.ts           # generated or re-exported database types
src/domain/status.ts          # pure status transition rules
src/domain/foundation.ts      # schema/service types for Phase 1 skeleton
src/server/foundation.ts      # database-backed foundation smoke service
src/app/api/foundation/route.ts # optional internal smoke endpoint
tests/domain/status.test.ts   # pure transition tests
tests/server/foundation.test.ts # integration-style DB smoke test when env is available
```

Do not build a dashboard to prove the database. The planner should require tests and a single real read/write path instead. [VERIFIED: .planning/ROADMAP.md]

## Verification Architecture

Nyquist validation is enabled in `.planning/config.json`, so the plan should include automated verification from the first wave. [VERIFIED: .planning/config.json]

Current state:

| Area | Finding | Planning Action |
|------|---------|-----------------|
| App code | No implementation files or `package.json` exist. [VERIFIED: repository scan] | Wave 0 must scaffold the app and test tooling before feature tasks. |
| Test config | No Vitest or Playwright config exists. [VERIFIED: repository scan] | Add Vitest first for schema/status/server module tests. Playwright can be installed/configured now or deferred until UI begins, but the phase should not depend on E2E for schema validation. |
| Database config | No Supabase config/migrations exist. [VERIFIED: repository scan] | Add migration workflow and document whether tests use local Supabase, remote dev DB, or SQL-only checks. |
| Graph context | No `.planning/graphs/graph.json` exists. [VERIFIED: repository scan] | No graph-derived dependencies are available for this phase. |
| GSD helper seam | `gsd-tools.cjs query init.phase-op 1` fails with missing `../../../package.json`. [VERIFIED: local command] | Continue from explicit user-provided paths; do not block planning on the helper seam. |

Minimum automated checks:

- Unit tests for legal and illegal status transitions. [VERIFIED: .planning/REQUIREMENTS.md]
- Unit tests that missed transitions only apply to incomplete work after due date. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Unit tests that teacher override requests require actor/reason audit fields. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Schema/migration verification that all required tables, enums, foreign keys, uniqueness constraints, and retention fields exist. [VERIFIED: .planning/REQUIREMENTS.md]
- Integration smoke test for one real DB insert/read path if a Supabase test database is available. If not available, planner should add a manual checkpoint and a SQL migration validation command as fallback. [ASSUMED]
- RLS/policy smoke checks for teacher-owned rows once auth scaffolding exists. If Phase 1 does not implement auth sessions, the planner should still create policy-ready columns and add TODO tests explicitly tied to Phase 2. [VERIFIED: .planning/research/STACK.md] [ASSUMED]

Requirement-to-verification map:

| Requirement | Verification |
|-------------|--------------|
| DATA-01 | Migration/schema check proves teacher, class, student, mission, assignment, attempt, turn, transcript/evaluation placeholders, and audio metadata tables exist. [VERIFIED: .planning/REQUIREMENTS.md] |
| DATA-02 | Status transition unit tests plus audit table insert tests. [VERIFIED: .planning/REQUIREMENTS.md] |
| DATA-03 | Schema has `audio_clips` per turn/kind and no full-session recording table. [VERIFIED: .planning/REQUIREMENTS.md] |
| DATA-04 | Schema check for `audio_expires_at`, deletion status, `deleted_at`, and deletion reason. [VERIFIED: .planning/REQUIREMENTS.md] |
| DATA-05 | Schema/service tests around `data_mode` and demo/real class separation. [VERIFIED: .planning/REQUIREMENTS.md] |
| ASGN-04 | Enum/type tests include exactly the required assignment statuses. [VERIFIED: .planning/REQUIREMENTS.md] |

## Planning Implications

- Plan Wave 0 as scaffold + verification infrastructure, because there is no existing app or test runner. [VERIFIED: repository scan]
- Keep Phase 1 changes tied to foundation artifacts only, per AGENTS.md and the phase context. [VERIFIED: AGENTS.md] [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Prefer vertical MVP tasks: migration, server transition function, audit write, smoke route/service, and tests should land together rather than as isolated technical layers. [VERIFIED: AGENTS.md]
- Do not postpone assignment snapshots. If snapshots are skipped now, Phase 3 assignment work will need a privacy/status rewrite. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Do not postpone retention/deletion fields. Phase 5 audio work should attach storage to existing retention metadata, not invent privacy fields later. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/research/PITFALLS.md]
- Treat RLS as a design constraint even if full teacher auth UI lands in Phase 2. Every table should have ownership columns and relationships that make RLS policies straightforward. [VERIFIED: .planning/research/STACK.md]
- Treat demo-vs-real as a data invariant, not a UI label. The planner should add acceptance criteria that demo and real data cannot be mixed accidentally in seed/smoke flows. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md]
- Commit docs are enabled in config, but this research task only writes the requested research file unless the orchestrator handles commits. [VERIFIED: .planning/config.json]

## Risks and Mitigations

| Risk | Why It Matters | Mitigation / Acceptance Criteria |
|------|----------------|----------------------------------|
| Schema is too thin and later phases rewrite privacy/status boundaries | Phase 1 is explicitly meant to avoid privacy/status rewrites. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] | Acceptance criteria must require the full workflow skeleton tables, not only teacher/class/student. |
| Status transitions leak to clients or future AI code | Server-owned status is a locked decision and requirement. [VERIFIED: .planning/REQUIREMENTS.md] | All status updates must pass through a transition function/service and create audit events. |
| Missed status is computed only at read time | The user chose a scheduled due-date job as the long-term source of truth. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] | Include job-ready function and tests for marking incomplete work `missed`; actual scheduler wiring can be minimal if platform setup is not ready. |
| Demo data mixes with real student records | Demo/sample separation is a Phase 1 requirement. [VERIFIED: .planning/REQUIREMENTS.md] | Add `data_mode` at class level and test real/demo creation paths. |
| Audio privacy fields are deferred until recording phase | Child voice retention is a known project risk. [VERIFIED: .planning/STATE.md] [VERIFIED: .planning/research/PITFALLS.md] | Add audio metadata and retention/deletion fields now, even with null object keys and no upload UI. |
| RLS is bolted on after app code exists | Supabase stack research recommends RLS for exposed schemas. [VERIFIED: .planning/research/STACK.md] | Create policy-ready ownership columns and at least baseline deny-by-default or teacher-scope policy structure where feasible. |
| Walking skeleton turns into UI scope creep | Phase context excludes dashboards, student login UI, recording UI, transcription, and AI evaluation. [VERIFIED: .planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md] | The skeleton should prove database/app/test wiring with a service/route, not build a user-facing workflow. |
| No local Supabase service is available during execution | Repository currently has no app or Supabase config. [VERIFIED: repository scan] | Planner should probe environment before DB integration tests and include a fallback migration/static schema verification path. [ASSUMED] |

