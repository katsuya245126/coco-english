---
phase: 01-data-privacy-and-workflow-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - next.config.ts
  - tsconfig.json
  - eslint.config.mjs
  - postcss.config.mjs
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/api/foundation/route.ts
  - src/components/foundation/FoundationSmokePanel.tsx
  - src/lib/env.ts
  - src/lib/supabase/server.ts
  - src/lib/db/types.ts
  - src/domain/foundation/status.ts
  - src/domain/foundation/schemas.ts
  - src/server/foundation/createFoundationSmokeRecord.ts
  - src/server/foundation/markMissedAssignments.ts
  - supabase/config.toml
  - supabase/migrations/202606250001_foundation_schema.sql
  - tests/domain/foundation-status.test.ts
  - tests/server/foundation-smoke.test.ts
  - tests/schema/foundation-schema.test.ts
  - tests/e2e/foundation-smoke.spec.ts
  - vitest.config.ts
  - playwright.config.ts
  - .env.example
  - README.md
autonomous: true
requirements:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
  - ASGN-04
must_haves:
  truths:
    - "A developer can run the Next.js app locally and open a foundation smoke screen."
    - "The smoke screen can create and read a demo class plus assignment skeleton through a server-owned Supabase path."
    - "The database schema stores teacher, class, student, mission, assignment, per-student assignment state, attempt, turn, transcript/evaluation fields, and per-turn audio metadata."
    - "Assignment status changes are legal-state-machine transitions that write audit events."
    - "Incomplete assigned or started homework can be marked missed after due date by a job-ready server function."
    - "Teacher overrides require actor, previous status, new status, timestamp, and reason data."
    - "Demo/sample data is distinguishable from real class data, and short audio clip retention/deletion fields exist from the first schema."
  artifacts:
    - path: "supabase/migrations/202606250001_foundation_schema.sql"
      provides: "Postgres enums, tables, constraints, RLS posture, audit tables, retention fields, and data_mode boundary"
      contains: "create type assignment_student_status"
    - path: "src/domain/foundation/status.ts"
      provides: "Pure assignment status transition rules, missed due-date logic, and teacher override audit validation"
      exports: ["ASSIGNMENT_STUDENT_STATUSES", "canTransitionAssignmentStatus", "assertTransitionRequest", "shouldMarkMissed"]
    - path: "src/server/foundation/createFoundationSmokeRecord.ts"
      provides: "Server-owned Supabase insert/read smoke path for teacher profile, demo class, student, mission, assignment, assignment student, and initial status event"
      exports: ["createFoundationSmokeRecord"]
    - path: "src/server/foundation/markMissedAssignments.ts"
      provides: "Job-ready missed-status transition path for overdue incomplete assignment_students"
      exports: ["markMissedAssignments"]
    - path: "src/app/api/foundation/route.ts"
      provides: "Internal POST/GET smoke API for the foundation route"
      exports: ["GET", "POST"]
    - path: "src/components/foundation/FoundationSmokePanel.tsx"
      provides: "Minimal interactive client UI that calls /api/foundation and renders the persisted row"
    - path: "tests/domain/foundation-status.test.ts"
      provides: "Unit tests for legal and illegal transitions, missed rules, and teacher override audit requirements"
    - path: "tests/schema/foundation-schema.test.ts"
      provides: "Migration text checks for required enums, tables, FKs, uniqueness constraints, retention fields, and data_mode"
    - path: "tests/server/foundation-smoke.test.ts"
      provides: "Supabase-backed insert/read smoke test with skip/fallback behavior when env is absent"
    - path: "tests/e2e/foundation-smoke.spec.ts"
      provides: "Playwright proof that one real UI interaction reaches the server/API and displays the result"
  key_links:
    - from: "src/components/foundation/FoundationSmokePanel.tsx"
      to: "src/app/api/foundation/route.ts"
      via: "button click calls POST /api/foundation"
      pattern: "fetch\\('/api/foundation'"
    - from: "src/app/api/foundation/route.ts"
      to: "src/server/foundation/createFoundationSmokeRecord.ts"
      via: "route invokes createFoundationSmokeRecord"
      pattern: "createFoundationSmokeRecord"
    - from: "src/server/foundation/createFoundationSmokeRecord.ts"
      to: "supabase/migrations/202606250001_foundation_schema.sql"
      via: "Supabase inserts into teacher_profiles, classes, students, missions, assignments, assignment_students, assignment_status_events"
      pattern: "from\\('assignment_students'\\)"
    - from: "src/server/foundation/markMissedAssignments.ts"
      to: "src/domain/foundation/status.ts"
      via: "server job uses shouldMarkMissed before writing missed status and audit event"
      pattern: "shouldMarkMissed"
---

## Phase Goal

**As a** teacher-linked speaking homework builder, **I want to** prove the app has a trustworthy data and workflow foundation, **so that** later teacher, student, audio, AI, and review slices can build on server-owned status, privacy, retention, and demo/real data boundaries.

<objective>
Create the walking skeleton and Phase 1 source of truth for DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, and ASGN-04.

Purpose: establish the durable schema, status rules, audit path, retention fields, demo/real data boundary, and one real full-stack read/write path before building teacher dashboards, student login, mission creation, audio recording, transcription, or AI evaluation.

Output: a Next.js App Router + TypeScript scaffold, Supabase SQL migration, typed server-only data access, minimal foundation smoke UI/API, status transition domain module, missed-status job-ready server function, and automated tests.
</objective>

<execution_context>
@/Users/john/.codex/gsd-core/workflows/execute-plan.md
@/Users/john/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/config.json
@.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md
@.planning/phases/01-data-privacy-and-workflow-foundation/01-RESEARCH.md
@.planning/research/SUMMARY.md
@.planning/research/ARCHITECTURE.md
@.planning/research/STACK.md
@.planning/research/PITFALLS.md
@.planning/phases/01-data-privacy-and-workflow-foundation/01-SKELETON.md
</context>

## Artifacts This Phase Produces

Files:
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `README.md`
- `src/app/layout.tsx`, `src/app/page.tsx`
- `src/components/foundation/FoundationSmokePanel.tsx`
- `src/app/api/foundation/route.ts`
- `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/db/types.ts`
- `src/domain/foundation/status.ts`, `src/domain/foundation/schemas.ts`
- `src/server/foundation/createFoundationSmokeRecord.ts`, `src/server/foundation/markMissedAssignments.ts`
- `supabase/config.toml`, `supabase/migrations/202606250001_foundation_schema.sql`
- `tests/domain/foundation-status.test.ts`, `tests/schema/foundation-schema.test.ts`, `tests/server/foundation-smoke.test.ts`, `tests/e2e/foundation-smoke.spec.ts`

Database symbols:
- Enums: `data_mode`, `assignment_student_status`, `attempt_status`, `audio_clip_kind`, `audio_processing_status`, `status_actor_type`
- Tables: `teacher_profiles`, `classes`, `students`, `missions`, `mission_turn_templates`, `assignments`, `assignment_students`, `attempts`, `attempt_turns`, `audio_clips`, `assignment_status_events`
- Required constraints: `assignment_students(assignment_id, student_id)` unique, `mission_turn_templates(mission_id, turn_order)` unique, `attempt_turns(attempt_id, turn_order)` unique, child-table foreign keys, `audio_clips.audio_expires_at`, `audio_clips.deleted_at`, `audio_clips.deleted_reason`, `classes.data_mode`, and copied `assignments.data_mode`

TypeScript symbols:
- `ASSIGNMENT_STUDENT_STATUSES`
- `type AssignmentStudentStatus`
- `type StatusActorType`
- `type TransitionRequest`
- `canTransitionAssignmentStatus`
- `assertTransitionRequest`
- `shouldMarkMissed`
- `createFoundationSmokeRecord`
- `markMissedAssignments`
- `GET` and `POST` route handlers in `src/app/api/foundation/route.ts`

Routes and commands:
- Route: `/` renders the foundation smoke screen.
- API: `GET /api/foundation` returns service/env readiness without writing.
- API: `POST /api/foundation` creates and reads the demo foundation skeleton.
- Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:schema`, `npm run test:db:smoke`, `npm run test:e2e`, `npm run build`.

## Out Of Scope

- Teacher dashboard, teacher class management UI, roster UI, student login/access UI, mission creation UI, assignment publishing UI, audio recording UI, transcription, AI evaluation, public demo workspace, school SSO, LMS sync, parent accounts, numerical scoring, leaderboards, large character casts, visual-novel systems, and long-form free chat.
- Consent/export/admin compliance workflows beyond schema-ready retention/deletion and audit fields.
- Production storage upload, signed playback, and audio deletion scheduler execution. Phase 1 creates fields and job-ready boundaries only.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the failing walking-skeleton smoke and status tests</name>
  <read_first>
    - `AGENTS.md`
    - `.planning/ROADMAP.md`
    - `.planning/REQUIREMENTS.md`
    - `.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md`
    - `.planning/phases/01-data-privacy-and-workflow-foundation/01-RESEARCH.md`
    - `.planning/phases/01-data-privacy-and-workflow-foundation/01-SKELETON.md`
  </read_first>
  <action>
    Scaffold only the test/config surface needed to express Phase 1 behavior before implementation. Create `package.json` scripts for `lint`, `typecheck`, `test`, `test:schema`, `test:db:smoke`, `test:e2e`, `build`, and `dev`; create `vitest.config.ts` and `playwright.config.ts`. Add `tests/domain/foundation-status.test.ts` covering the exact ASGN-04 statuses per D-06: `assigned`, `started`, `completed`, `missed`, `needs_retry`, `teacher_review`; legal transitions per D-05; illegal transition rejection; `shouldMarkMissed` returning true only for overdue `assigned` or `started` rows per D-07; and teacher override audit validation requiring `actorType: "teacher"`, `actorId`, `reasonCode`, previous status, next status, and timestamp per D-08. Add `tests/schema/foundation-schema.test.ts` that reads `supabase/migrations/202606250001_foundation_schema.sql` and fails until it finds all required tables, enums, foreign-key clauses, uniqueness constraints, `classes.data_mode`, `assignments.data_mode`, immutable snapshot fields, and `audio_clips.audio_expires_at`, `deleted_at`, and `deleted_reason` per D-01 through D-14. Add `tests/server/foundation-smoke.test.ts` that calls `createFoundationSmokeRecord` when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, and otherwise reports a skipped integration path while requiring `npm run test:schema` to pass. Add `tests/e2e/foundation-smoke.spec.ts` that opens `/`, clicks a button named `Create foundation smoke record`, waits for persisted class and assignment text, and expects a `data-mode: demo` marker. Do not implement production files in this task beyond empty exports that keep the test runner importable.
  </action>
  <acceptance_criteria>
    Tests encode DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, and ASGN-04 expectations before feature code exists. The first execution of the behavior tests fails for missing implementation or missing migration content, not for syntax/configuration errors.
  </acceptance_criteria>
  <verify>
    <automated>npm test -- --run tests/domain/foundation-status.test.ts</automated>
    <automated>npm run test:schema</automated>
    <automated>npm run test:e2e -- --list</automated>
  </verify>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the thinnest real Next.js and Supabase foundation slice</name>
  <read_first>
    - `tests/domain/foundation-status.test.ts`
    - `tests/schema/foundation-schema.test.ts`
    - `tests/server/foundation-smoke.test.ts`
    - `tests/e2e/foundation-smoke.spec.ts`
    - `.planning/research/STACK.md`
    - `.planning/research/ARCHITECTURE.md`
  </read_first>
  <action>
    Create the Next.js App Router TypeScript scaffold without adding dashboard scope: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/foundation/FoundationSmokePanel.tsx`, `src/app/api/foundation/route.ts`, `src/lib/env.ts`, `src/lib/supabase/server.ts`, and `src/lib/db/types.ts`. Use Next.js App Router, React, TypeScript, Supabase server modules, and Zod matching stack research. Implement `/` as an internal foundation smoke screen with one button that calls `POST /api/foundation` and renders the returned `className`, `assignmentTitle`, `assignmentStudentStatus`, and `dataMode`. Implement `GET /api/foundation` as a non-writing readiness response showing whether Supabase env vars are configured. Implement `POST /api/foundation` as a server-only route that invokes `createFoundationSmokeRecord`; never expose `SUPABASE_SERVICE_ROLE_KEY` to client code. Implement `createFoundationSmokeRecord` to insert or upsert a synthetic teacher profile, a `classes` row with `data_mode = 'demo'`, one class-scoped `students` row, one `missions` row with `character_id = 'default-buddy'`, one `mission_turn_templates` row, one `assignments` row with an immutable `mission_snapshot` JSON payload and copied `data_mode = 'demo'`, one `assignment_students` row with `status = 'assigned'`, and one `assignment_status_events` initial audit row with `actor_type = 'system'`. The server response must read the stored rows back from Supabase and return only a narrow typed payload. Use class-level `data_mode` as the source of truth per D-13 and copy to assignment at creation to simplify later audit and retention queries; do not create a polished demo workspace per D-14.
  </action>
  <acceptance_criteria>
    A developer can run `npm run dev`, open `/`, click the foundation smoke button, and see a persisted demo class plus assignment skeleton if Supabase env vars point to a migrated database. Without Supabase env vars, the UI must show a clear internal setup state and schema/unit tests must still run.
  </acceptance_criteria>
  <verify>
    <automated>npm run lint</automated>
    <automated>npm run typecheck</automated>
    <automated>npm run build</automated>
    <automated>npm run test:db:smoke</automated>
  </verify>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Harden schema, status ownership, retention fields, and missed job boundary</name>
  <read_first>
    - `src/server/foundation/createFoundationSmokeRecord.ts`
    - `src/app/api/foundation/route.ts`
    - `.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md`
    - `.planning/research/PITFALLS.md`
    - `.planning/research/ARCHITECTURE.md`
  </read_first>
  <action>
    Implement `supabase/migrations/202606250001_foundation_schema.sql` with `gen_random_uuid()` identifiers, `created_at` and `updated_at` timestamps, RLS enabled on all app tables, teacher ownership columns ready for Phase 2 auth, and the exact enums/tables listed in this plan. Encode DATA-01 by creating the full workflow skeleton tables per D-01 and D-02. Encode DATA-02 and ASGN-04 by storing `assignment_students.status` as `assignment_student_status`, creating append-only `assignment_status_events`, and ensuring all application writes use `src/domain/foundation/status.ts` plus server functions instead of client-provided final status per D-05 and D-06. Encode D-03 with `assignments.mission_snapshot jsonb not null` and do not read current mission fields as the assigned truth after assignment creation. Encode D-04 with class-scoped `students` only; do not create global student identity tables. Encode D-09 through D-12 with `audio_clips` metadata for short per-turn clips only: `attempt_turn_id`, `clip_kind`, nullable `object_key`, `mime_type`, `duration_ms`, `byte_size`, `processing_status`, `audio_expires_at default now() + interval '30 days'`, `deleted_at`, and `deleted_reason`. Encode DATA-05 and D-13 by requiring `classes.data_mode` and `assignments.data_mode`, and add a trigger or check path preventing class `data_mode` changes once assignments exist. Implement `src/domain/foundation/status.ts` with transition validation, teacher override audit validation, and missed due-date rules. Implement `src/server/foundation/markMissedAssignments.ts` to find overdue `assigned` and `started` rows, transition them to `missed`, and insert `assignment_status_events` with `actor_type = 'job'` and reason code `due_date_elapsed`. Update README and `.env.example` with local full-stack run commands: `supabase start`, `supabase db reset`, `npm run dev`, `npm run test:db:smoke`, and the remote-dev alternative using `NEXT_PUBLIC_SUPABASE_URL` plus server-only `SUPABASE_SERVICE_ROLE_KEY`.
  </action>
  <acceptance_criteria>
    Migration checks prove all required tables, enums, constraints, retention fields, and data-mode fields exist. Unit tests prove legal/illegal transitions, missed due-date behavior, and teacher override audit requirements. Integration smoke passes against Supabase when env is available, and otherwise the summary records the absent environment plus the passing schema fallback.
  </acceptance_criteria>
  <verify>
    <automated>npm test -- --run tests/domain/foundation-status.test.ts tests/schema/foundation-schema.test.ts</automated>
    <automated>npm run test:db:smoke</automated>
    <automated>npm run test:e2e</automated>
    <automated>npm run lint</automated>
    <automated>npm run typecheck</automated>
    <automated>npm run build</automated>
  </verify>
</task>

</tasks>

## Multi-Source Coverage Audit

| Source | Item | Coverage |
|---|---|---|
| GOAL | Trustworthy source of truth for teacher-linked homework, child voice metadata, status ownership, retention fields, and real-vs-demo boundaries | Covered by all tasks, especially schema and smoke path artifacts |
| REQ | DATA-01 relational schema for teacher, class, student, mission, assignment, attempt, turn, transcript, audio metadata | Covered by Task 1 schema tests and Task 3 migration |
| REQ | DATA-02 server-owned and auditable assignment status transitions | Covered by Task 1 status tests, Task 2 server smoke path, Task 3 domain/server audit implementation |
| REQ | DATA-03 short per-turn audio clips, not full-session recordings | Covered by Task 1 schema tests and Task 3 `audio_clips` metadata design |
| REQ | DATA-04 audio retention fields | Covered by Task 1 schema tests and Task 3 `audio_expires_at`, `deleted_at`, `deleted_reason` |
| REQ | DATA-05 demo/sample data separated from real student data | Covered by Task 1 tests, Task 2 `dataMode: demo` smoke path, Task 3 `data_mode` schema invariant |
| REQ | ASGN-04 statuses include assigned, started, completed, missed, needs retry, teacher review | Covered by Task 1 status tests and Task 3 enum/domain rules |
| RESEARCH | Next.js App Router, TypeScript, Supabase Postgres/Auth/Storage posture, Zod, Vitest, Playwright | Covered by Task 1 config and Task 2 scaffold |
| RESEARCH | SQL migrations plus generated/type-safe Supabase usage | Covered by Task 2 and Task 3 |
| RESEARCH | One real DB read/write through app code | Covered by Task 2 smoke route/service and Task 3 integration verification |
| RESEARCH | Avoid dashboard/audio/AI scope creep | Covered by out-of-scope section and task actions |
| CONTEXT | D-01 full workflow skeleton | Covered by Task 3 tables |
| CONTEXT | D-02 minimal fields but core boundaries now | Covered by Task 3 table shape |
| CONTEXT | D-03 mission definition separated from immutable assignment snapshot | Covered by Task 2 insert path and Task 3 `mission_snapshot` |
| CONTEXT | D-04 class-scoped students only | Covered by Task 3 `students.class_id` model |
| CONTEXT | D-05 server-owned state machine | Covered by Task 1 and Task 3 status module |
| CONTEXT | D-06 required statuses | Covered by Task 1 and Task 3 enum |
| CONTEXT | D-07 due-date missed job path | Covered by Task 1 and Task 3 `markMissedAssignments` |
| CONTEXT | D-08 audited teacher overrides | Covered by Task 1 and Task 3 audit validation/table |
| CONTEXT | D-09 cautious child data foundation | Covered by retention, RLS posture, demo/real data mode |
| CONTEXT | D-10 private short clips, no full-session recordings | Covered by `audio_clips` table only |
| CONTEXT | D-11 30-day audio retention | Covered by `audio_expires_at` default |
| CONTEXT | D-12 deletion/expiry tracking | Covered by deletion fields |
| CONTEXT | D-13 explicit demo/real mode | Covered by `classes.data_mode` and `assignments.data_mode` |
| CONTEXT | D-14 no polished public demo workspace | Covered by minimal internal smoke UI |

<threat_model>

## Trust Boundaries

| Boundary | Description |
|---|---|
| Browser client to `POST /api/foundation` | Untrusted client interaction asks server to create/read smoke data. |
| Next.js server to Supabase | Server-only service key crosses into database writes and must not leak to browser bundles. |
| Supabase database to future teacher/student clients | Tables will later be exposed through auth-scoped clients, so Phase 1 must enable RLS posture and ownership columns now. |
| Demo data to real student data | Demo and real data must remain distinguishable to prevent accidental collection or review of child data under demo assumptions. |
| Audio metadata to future storage objects | Metadata references private child voice clips later, so retention and deletion fields must exist before upload work. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-01-01 | Spoofing | Future teacher-owned rows | mitigate | Add teacher ownership columns and RLS-enabled tables in the initial migration so Phase 2 can bind policies to Supabase Auth without schema rewrites. |
| T-01-02 | Tampering | `assignment_students.status` | mitigate | Only expose status mutation through `src/domain/foundation/status.ts`, `createFoundationSmokeRecord`, and `markMissedAssignments`; audit every transition in `assignment_status_events`. |
| T-01-03 | Repudiation | Teacher override and job transitions | mitigate | Require actor type, actor id when applicable, previous status, next status, reason code, metadata, and created timestamp in `assignment_status_events`. |
| T-01-04 | Information Disclosure | `SUPABASE_SERVICE_ROLE_KEY` | mitigate | Keep service-role usage in server-only modules and route handlers; `.env.example` documents server-only handling; no client import from `src/lib/supabase/server.ts`. |
| T-01-05 | Information Disclosure | Demo/real class data | mitigate | Add `data_mode` enum on `classes` and `assignments`; smoke path creates only `demo`; schema prevents silent class data-mode changes after assignments exist. |
| T-01-06 | Denial of Service | Foundation smoke endpoint | accept | Internal developer-only route has low value in Phase 1; later auth phases must gate production teacher actions. |
| T-01-07 | Elevation of Privilege | Browser-exposed database access | mitigate | Enable RLS on app tables and do not create browser Supabase write clients for Phase 1 smoke data. |
| T-01-SC | Tampering | npm installs | mitigate | Use stack packages named in `.planning/research/STACK.md`; executors must verify package names against npm registry if adding packages beyond that list. |

</threat_model>

<verification>
Run these phase-level checks after all tasks:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run test:schema`
5. `npm run test:db:smoke`
6. `npm run test:e2e`
7. `npm run build`

If Supabase is not available locally or through env vars, `npm run test:db:smoke` must skip the live insert/read with an explicit message and `npm run test:schema` must still pass. The executor must record the skipped live DB smoke in `01-SUMMARY.md` and include the exact command needed to run it once Supabase is available.
</verification>

<success_criteria>
Phase 1 is complete when:
- The project scaffold runs through `npm run dev` and builds with `npm run build`.
- The internal foundation smoke screen performs one real UI-to-API interaction and shows persisted demo class/assignment data when Supabase env is configured.
- The Supabase migration creates the full workflow skeleton tables and enums for DATA-01 and ASGN-04.
- Status transition tests prove DATA-02, missed due-date rules, and teacher override audit requirements.
- Schema tests prove DATA-03 and DATA-04 through per-turn `audio_clips` metadata and retention/deletion fields.
- Schema and smoke tests prove DATA-05 through explicit `data_mode` fields and demo smoke data.
- No out-of-scope dashboard, student login, mission authoring UI, audio recording, transcription, AI evaluation, public demo workspace, SSO, LMS sync, parent account, scoring, leaderboard, or open chat feature is introduced.
</success_criteria>

<output>
Create `.planning/phases/01-data-privacy-and-workflow-foundation/01-SUMMARY.md` when done.
</output>
