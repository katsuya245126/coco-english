# Phase 3: Manual Mission Assignment - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the teacher's manual mission-builder and the assign-to-class flow. A teacher can hand-author a complete, reusable mission (target pattern, topic, level, required turns, and per-turn prompt / target-form example / progressive hints), store a `characterId` while using the default v1 buddy, then assign that mission to a class — producing one immutable per-student homework record per active student.

This phase should NOT build: AI mission generation (Phase 6, MISS-02/03/05), the student speaking attempt loop (Phase 4), voice capture (Phase 5), teacher review dashboards / status buckets (Phase 7), or the auto-miss due-date job (Phase 7, ASGN-05). It produces the mission + assignment records and snapshot that those later phases consume.

The Phase 1 foundation schema already scaffolds every table this phase needs (`missions`, `mission_turn_templates`, `assignments` with `mission_snapshot jsonb`, `assignment_students` with `status` defaulting to `assigned`). Phase 3 builds the teacher UI, server actions, validation, and the snapshot/assign logic on top of that schema — it should extend the schema only where authoring requires it (see discretion notes), not redesign it.

</domain>

<decisions>
## Implementation Decisions

> The user chose "Decide for me" — the decisions below were locked by Claude, grounded in the Phase 1 schema and prior-phase decisions, rather than gathered interactively. They are firm decisions for downstream agents, not open questions.

### Mission Builder Form Shape

- **D-01:** A mission's turn content is authored as ordered `mission_turn_templates` rows. The teacher adds N turns where N = `required_turns`; each turn carries a `prompt` (the buddy's question), one `target_example` (the target-form sentence), and a 3-tier `hint_ladder` (tier 1 target pattern → tier 2 word bank → tier 3 full example) stored in the existing `hint_ladder jsonb` column. MISS-01's "questions, expected target-form examples, and hints" map directly onto these per-turn fields — do NOT introduce a separate questions table.
- **D-02:** `required_turns` MUST equal the count of authored turn templates. Enforce this as a validation rule (server-side, and ideally surfaced in the form) so a mission cannot claim a turn count that does not match its authored prompts.
- **D-03:** The mission `level` is a small fixed set of teacher-friendly labels (the planner may choose the exact labels, e.g. beginner/elementary/intermediate, but it must be a constrained enum/select, not free text, so later AI generation and filtering stay consistent).
- **D-04:** Due date is NOT a mission field. It is set at assign time on `assignments.due_at` and is OPTIONAL (nullable). A mission is a reusable definition; the due date belongs to the act of assigning. No due date = no auto-miss (auto-miss is Phase 7 / ASGN-05).

### Snapshot Content & Timing (ASGN-02)

- **D-05:** `assignments.mission_snapshot` is written exactly once, at assign-click, and contains the FULL denormalized mission: all mission-level fields (title, target_pattern, topic, level, required_turns, `character_id`) plus every turn template (turn_order, prompt, target_example, hint_ladder). The snapshot is the complete contract the student flow executes.
- **D-06:** The downstream student/attempt flow (Phase 4+) reads ONLY the snapshot, never the live `missions` / `mission_turn_templates` rows. This is what makes the snapshot meaningful rather than decorative — editing a mission later cannot change in-flight homework.
- **D-07:** The snapshot shape is validated by a Zod schema on write. Define this schema as a reusable module — Phase 6 (MISS-05) will reuse the same schema to validate AI-generated missions before assignment.

### Assign-to-Class Behavior (ASGN-01, ASGN-03)

- **D-08:** Assigning creates one `assignment_students` row for every ACTIVE (non-archived, `archived_at is null`) student on the class roster at assign time. Archived students are excluded and are NOT back-filled if later un-archived — the assignment is a point-in-time snapshot of the roster as well as the mission.
- **D-09:** Assign is idempotent per student via the existing `unique (assignment_id, student_id)` constraint. Re-running the assign action for the same `assignments` row must not create duplicate or error out destructively.
- **D-10:** Re-assigning the same mission to the same class is allowed and creates a NEW `assignments` row (new snapshot, new optional due date). Missions are reusable templates; `assignments` are the per-event records.
- **D-11:** A class may have multiple concurrent active assignments. Do not add a one-active-assignment-per-class constraint. The student home shell (Phase 4) will list assignments.
- **D-12:** `assignments.data_mode` is copied from the class's `dataMode` at assign time, consistent with Phase 1 D-13 and the existing `prevent_class_data_mode_change_with_assignments` guard. Demo classes produce demo assignments; real classes produce real assignments.
- **D-13:** All mission and assignment writes are server-owned and RLS-bound to the authoring teacher (carrying forward Phase 2 D-15). A teacher can only author/assign within their own classes and missions.

### Mission Edit-After-Assign Rules

- **D-14:** A mission remains editable after it has been assigned — the snapshot (D-05/D-06) already protects in-flight homework, so there is no data-integrity risk. No forking, no hard lock.
- **D-15:** When editing a mission that has one or more active assignments, the builder shows a non-blocking notice: "This mission has N active assignment(s). Edits apply to future assignments only; existing homework is unchanged." Editing mutates the live `missions` / `mission_turn_templates`; the next assign captures a fresh snapshot.

### Character (MISS-04)

- **D-16:** Mission stores `character_id` (already `not null default 'default-buddy'` in the schema). Phase 3 does NOT build a character picker — it persists the default buddy id and carries it into the snapshot. Keeping the column populated now satisfies MISS-04 and keeps the model open for a later character system (Phase 4 CHAR-04 / v2 cast) without rework.

### Claude's Discretion

Genuine implementation details left to research/planning — not product decisions:
- Exact route/page structure for the mission builder and assign flow (e.g. `/missions/new`, `/missions/[id]`, an assign dialog vs a dedicated page).
- Server action vs route handler for create/edit/assign; precise Zod field names and module layout.
- Whether turn authoring is a repeating inline sub-form, a modal, or step-wise — as long as it produces ordered turn templates matching `required_turns`.
- Exact `level` label set and `hint_ladder` jsonb shape (as long as it cleanly represents the 3 ordered tiers).
- Any minor schema additions strictly needed for authoring (e.g. a mission `description`/`instructions` field, `updated_at` triggers) — extend, don't redesign, and document the addition in the plan's "Artifacts this phase produces".

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/PROJECT.md` — product purpose, core value, mission/assignment key decisions, constraints.
- `.planning/REQUIREMENTS.md` — Phase 3 requirements: `MISS-01`, `MISS-04`, `ASGN-01`, `ASGN-02`, `ASGN-03` (and the Phase-1 `ASGN-04` statuses these build on).
- `.planning/ROADMAP.md` — Phase 3 boundary, dependency on Phase 2, success criteria, and later-phase exclusions (MISS-02/03/05 → Phase 6; ASGN-05 → Phase 7).
- `.planning/STATE.md` — current GSD state and current focus.

### Prior Phase Context (locked decisions that constrain Phase 3)
- `.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md` — D-03 immutable mission snapshot per assignment, D-04 class-scoped students, D-05/D-06 server-owned statuses incl. `assigned`, D-13 dataMode demo/real boundary.
- `.planning/phases/02-teacher-classroom-access/02-CONTEXT.md` — D-15 strict RLS teacher ownership, roster archive semantics (D-08), and the teacher dashboard/student-home-shell entry points this phase plugs into.

### Schema (the source of truth this phase builds on)
- `supabase/migrations/202606250001_foundation_schema.sql` — `missions`, `mission_turn_templates`, `assignments` (`mission_snapshot jsonb`, `due_at`, `data_mode`), `assignment_students` (`unique (assignment_id, student_id)`, default `assigned`), and `prevent_class_data_mode_change_with_assignments`.
- `supabase/migrations/202606250002_teacher_auth_rls.sql` — existing RLS/ownership pattern Phase 3 mission/assignment policies must extend.
- `supabase/migrations/202606250003_grant_authenticated_privileges.sql` and `202606250004_grant_service_role_privileges.sql` — NOTE: this project has "Automatically expose new tables" DISABLED, so any new table needs explicit `grant ... to authenticated` AND `grant ... to service_role`. Existing mission/assignment tables already exist; verify grants if adding columns/tables.

### Research
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md` — synthesized Next.js/Supabase stack, source-of-truth model, status guidance, and pitfalls.

### Original Product Context
- `english-speaking-practice-app-spec.md` — initial product spec and MVP non-goals.
- `english-speaking-practice-app-handoff.md` — early product discussion and decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/supabase/server.ts` — server-side Supabase clients (service + user-aware) established in Phase 2; mission/assign server actions reuse these.
- `src/lib/db/types.ts` — partial DB types already include `missions`, `assignments`, and status enums; extend as authoring fields are added.
- Phase 2 class/roster management UI and the protected teacher dashboard shell — the mission builder and "assign" action attach to this existing authenticated surface, not a new app section.

### Established Patterns
- Next.js App Router + TypeScript + Supabase + Zod; RLS enabled on foundation tables, with teacher-ownership policies defined in Phase 2 (the pattern to mirror for missions/assignments).
- Server-owned writes with audit/event tables (`assignment_status_events`) — assignment creation should seed the initial `assigned` status consistent with the Phase 1 state-machine posture.
- GRANT gotcha (see canonical_refs): new tables/columns may need explicit grants to `authenticated` and `service_role`.

### Integration Points
- Mission builder → `missions` + `mission_turn_templates`.
- Assign action → creates `assignments` (with `mission_snapshot`, `due_at`, `data_mode`) + one `assignment_students` row per active roster student.
- The per-student `assignment_students` rows are the entry point Phase 4's student flow reads to show "you have homework"; the `mission_snapshot` is the contract it executes.

</code_context>

<specifics>
## Specific Ideas

- The user delegated all four discussed gray areas to Claude ("Decide for me"); the decisions above reflect the most schema-aligned, lowest-rework path: missions as reusable templates, due date at assign time, full denormalized snapshot validated by a reusable Zod schema, assign to all active students, multiple concurrent assignments allowed, and editable-after-assign with a non-blocking notice.
- The reusable snapshot Zod schema (D-07) is deliberately positioned so Phase 6 (AI generation, MISS-05) validates against the exact same contract — worth calling out in the plan so it is not re-invented.

</specifics>

<deferred>
## Deferred Ideas

- AI/draft mission generation, preview, and strict-schema validation of generated output (MISS-02, MISS-03, MISS-05) — Phase 6.
- Character picker / multi-character selection UI (beyond persisting the default `character_id`) — Phase 4 (CHAR-04) and v2 character expansion.
- Auto-marking overdue homework as `missed` when `due_at` passes (ASGN-05) — Phase 7.
- Mission reuse/duplication and saved private templates (CONTV2-01, CONTV2-02) — v2.

None of these were scope creep — they are explicitly later-phase requirements surfaced here only to mark the Phase 3 boundary.

</deferred>

---

*Phase: 3-Manual Mission Assignment*
*Context gathered: 2026-06-26*
