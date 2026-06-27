# Phase 4: Guided Student Attempt Loop - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **student-facing guided speaking-mission flow**: a student opens assigned homework from the student home shell, the Coco buddy asks the mission's questions one turn at a time, the student answers, the app shows a better target-form sentence and requires a repeat, progressive hints are available, and the mission completes deterministically once the required turns and repeats are satisfied. It also delivers the bounded, classroom-safe buddy behavior (AI-06, CHAR-01/02/03) and a character profile kept separate from mission logic (CHAR-04), all mobile-responsive for phone/tablet (PILOT-01).

The student flow executes ONLY the `mission_snapshot` written at assign time (Phase 3 D-06) — never the live `missions` / `mission_turn_templates` rows. It writes `attempts`, `attempt_turns`, and server-owned status transitions on `assignment_students` (with audit events), using the Phase 1 schema that already scaffolds all of these tables/enums.

**This phase should NOT build:**
- **Real voice capture / recording / upload (FLOW-03 + AUDIO-* → Phase 5).** Phase 4 uses a **typed-text answer stand-in** that fills the same `original_transcript` / `repeat_transcript` fields voice will later populate.
- **Real AI turn evaluation (AI-01..05 + MISS-02/03/05 → Phase 6).** Phase 4 uses a **deterministic placeholder evaluation** (accept-any-non-empty) and a **fully scripted buddy** (no LLM call, no chat endpoint). Phase 6 swaps in real evaluation on the same fields.
- **Teacher review dashboards / status buckets / attempt detail (REV-* → Phase 7).** Phase 4 only WRITES the review-relevant fields (`attempt_count`, `submitted_at`, `highest_hint_level`, `status`, audit events); reading/displaying them for teachers is Phase 7.
- **Auto-miss on overdue (ASGN-05 → Phase 7).** Phase 4 shows a closed/expired state at READ time when `due_at` has passed, but does NOT flip status to `missed`.
- **Character picker / multi-character UI.** Phase 4 persists/uses the default `character_id` only; the character profile is structured so a later cast can be added (CHAR-04).

</domain>

<decisions>
## Implementation Decisions

> All four discussed gray areas were selected ("All"); the user then chose the recommended option for each. Decisions are firm for downstream agents.

### Answer Input & Placeholder Evaluation (FLOW-02, FLOW-04; pre-Phase-5/6)

- **D-01:** The student answers each turn via a **typed text input** — the real meaning-bearing input the loop needs before voice exists. The typed original answer persists to `attempt_turns.original_transcript`; the typed repeat persists to `attempt_turns.repeat_transcript`. Phase 5 adds a voice path that fills these same fields; do not invent throwaway storage.
- **D-02:** Turn "evaluation" in Phase 4 is a **deterministic placeholder: accept-any non-empty answer** as "understood". The flow then ALWAYS shows the snapshot's improved target-form sentence and ALWAYS requires the repeat. There is no real meaning/pattern check (that is Phase 6). Set `target_attempted` truthfully from whether an answer was submitted; record the placeholder result in `attempt_turns.evaluation` jsonb so Phase 6 has a clean swap point. **Never block a child on stand-in logic** — the only gate is "did they submit a non-empty answer/repeat".

### Turn Walk, Resume & Completion (FLOW-05, FLOW-06)

- **D-03:** The per-turn loop is: **buddy question → typed answer → show improved target-form sentence → required typed repeat → next turn.** One `attempt_turns` row per turn, ordered by `turn_order`.
- **D-04:** **Resume the same in-progress attempt where the student left off.** Re-entering an already-`started` assignment (after PIN re-unlock) continues the existing `in_progress` attempt at the next unfinished turn; completed turns stay done. One attempt per assignment until it completes. Do NOT restart from turn 1 and do NOT spawn a new attempt on return.
- **D-05:** The **repeat attempt is mandatory** to advance a turn, but in Phase 4 **any non-empty repeat is accepted** (`repeat_accepted = true`). This satisfies FLOW-05 ("must repeat") deterministically; Phase 6 later swaps real closeness scoring onto the same `repeat_accepted` / `repeat_transcript` fields.
- **D-06:** Status transitions are **server-owned and audited** (Phase 1 posture): assignment goes `assigned → started` on the first answered turn, and `started → completed` only when all `required_turns` (each with an accepted original answer AND an accepted repeat) are satisfied (FLOW-06). Each transition writes an `assignment_status_events` row with `actor_type = 'student_session'`. Set `attempts.status = completed` + `completed_at`, and stamp `assignment_students.submitted_at` / `attempt_count` / `latest_attempt_id` accordingly. Phase 4 does NOT produce `needs_retry` / `teacher_review` outcomes from the flow itself (those depend on real evaluation, Phase 6/7).

### Hints (FLOW-07)

- **D-07:** The 3-tier hint ladder (tier1 target pattern → tier2 word bank → tier3 full example) reveals **strictly in order**, sourced from the snapshot's per-turn `hintLadder`. Hints are freely revealable (no "earn it first" gate).
- **D-08:** **Record-only, no penalty.** Revealing hints — including the tier-3 full example — updates `attempt_turns.hint_level_used` and the rolled-up `assignment_students.highest_hint_level`, but NEVER blocks, downgrades, or reroutes completion. Consistent with the supportive non-punitive tone (CHAR-02) and "review states, not grades" product decision. Teacher visibility of hint usage is Phase 7.

### Buddy Bounds & Character (AI-06, CHAR-01/02/03/04)

- **D-09:** The buddy (**Coco**) is **fully scripted from the snapshot**. Coco's questions ARE the snapshot per-turn `prompt`s; recasts/encouragement/transition lines come from a **small fixed template set** keyed off the character profile. **No free-text generation and no chat endpoint exist in Phase 4** — so AI-06 ("no open-ended private chat") is enforced **structurally**, not by a guardrail prompt. Phase 6 replaces the template layer with real (still-bounded) generation.
- **D-10:** Tone (friendly, simple, encouraging, classroom-safe — CHAR-02/03) lives in **reviewed static copy** in the character profile templates.
- **D-11:** The **character profile is a separate module from mission/flow logic** (CHAR-04): the default `'default-buddy'` id (already on the snapshot) selects a profile of static lines/tone. Flow code consumes the profile by id; it must be possible to add more characters later without touching the turn/completion state machine.

### Mobile Flow & Home-Shell Entry (PILOT-01, FLOW-01)

- **D-12:** Per-turn layout is **one focused screen/card per step** (buddy asks → you answer → here's a better way → now repeat it), each with a single clear primary action advancing forward, the active input kept in view above the on-screen keyboard, and a small "turn X of N" progress indicator. Lowest cognitive load for elementary users on small screens; makes the required-repeat step unmissable. NOT a scrolling chat thread (invites open-ended mental model, tension with AI-06) and NOT one long form.
- **D-13:** The student home shell lists **this student's assignments with a clear per-item state badge**: Start (assigned), Continue (in progress), Done (completed), Closed/Expired (past `due_at`). Tapping an open item launches the mission; Done and Closed/Expired items are non-launchable. The existing "No homework yet" copy becomes the **empty-state fallback** when the student has no assignments. Reuse the closed/expired placeholder copy already reserved in `StudentHomeShell`. Multiple concurrent active assignments must all be reachable (Phase 3 D-11).
- **D-14:** Closed/expired is a **read-time display only** based on `due_at`; Phase 4 does NOT mutate status to `missed` (auto-miss is Phase 7 / ASGN-05).

### Claude's Discretion
Genuine implementation details left to research/planning — not product decisions:
- Exact student route structure (e.g. `/student/missions/[assignmentStudentId]`, per-turn step routing vs client-side step state) and how the unlock-cookie gate (Phase 2) extends to the mission routes.
- Whether the per-turn step flow is client-state within one route or distinct sub-routes — as long as it honors D-04 resume and D-12 one-screen-per-step.
- Precise server-action surface for "start attempt", "submit answer", "submit repeat", "reveal hint", "complete mission" (all server-owned via service-role client, consistent with Phase 2 student-access pattern).
- Exact shape of the `attempt_turns.evaluation` placeholder jsonb and the character-profile module/template format.
- Any minor schema additions strictly needed for the flow (the foundation schema already scaffolds attempts/turns/status; extend, don't redesign, and document in the plan).
- Visual/styling specifics (a `04-UI-SPEC.md` from `/gsd-ui-phase 4` should drive these — Phase 4 has a UI hint).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/PROJECT.md` — product purpose, supportive/non-punitive correction style, guided-not-free-chat constraint, `characterId`-keep-replaceable decision, "review states not grades".
- `.planning/REQUIREMENTS.md` — Phase 4 requirements: `FLOW-01`, `FLOW-02`, `FLOW-04`, `FLOW-05`, `FLOW-06`, `FLOW-07`, `AI-06`, `CHAR-01`..`CHAR-04`, `PILOT-01`. NOTE: `FLOW-03` (voice answering) is **Phase 5**, not here.
- `.planning/ROADMAP.md` — Phase 4 boundary, dependency on Phase 3, success criteria, and later-phase exclusions (FLOW-03/AUDIO → Phase 5; AI eval → Phase 6; REV-*/ASGN-05 → Phase 7).
- `.planning/STATE.md` — current GSD state and focus.

### Prior Phase Context (locked decisions that constrain Phase 4)
- `.planning/phases/03-manual-mission-assignment/03-CONTEXT.md` — **D-05/D-06 the student flow reads ONLY `mission_snapshot`** (full denormalized mission + ordered turns, validated by the reusable Zod schema); D-07 the snapshot Zod schema is the contract; D-11 multiple concurrent assignments per class; D-16 `character_id` default-buddy carried in snapshot.
- `.planning/phases/02-teacher-classroom-access/02-CONTEXT.md` — **students have no auth session**: server-only, service-role-client, unlock-cookie-gated access; D-13/D-17 PIN re-entry per visit (remembered class never bypasses PIN); D-14 the student home shell this phase extends; strict RLS teacher ownership (D-15).
- `.planning/phases/01-data-privacy-and-workflow-foundation/01-CONTEXT.md` — server-owned status transitions that write audit events; `dataMode` demo/real boundary (assignments carry it); short per-turn audio model + retention (relevant to Phase 5, noted for boundary awareness).

### Schema (source of truth this phase builds on)
- `supabase/migrations/202606250001_foundation_schema.sql` — `attempts` (`status attempt_status`, `started_at`, `completed_at`, `needs_review_reason`), `attempt_turns` (`original_transcript`, `improved_sentence`, `repeat_transcript`, `evaluation jsonb`, `target_attempted`, `repeat_accepted`, `hint_level_used`, `unique(attempt_id, turn_order)`), `assignment_students` (`status`, `attempt_count`, `submitted_at`, `highest_hint_level`, `latest_attempt_id`), `assignment_status_events` (audit), and the `assignment_student_status` / `attempt_status` / `status_actor_type` enums.
- `supabase/migrations/202606250002_teacher_auth_rls.sql` — RLS/ownership pattern (teacher side; student writes go through service-role server actions, not student RLS).
- `202606250003_grant_authenticated_privileges.sql` / `202606250004_grant_service_role_privileges.sql` — **GRANT gotcha: "auto-expose new tables" is DISABLED.** Any new table needs explicit `grant ... to authenticated` AND `grant ... to service_role`. Verify grants if columns/tables are added.

### Existing Code (entry points & contracts)
- `src/domain/mission/schemas.ts` — `missionSnapshotSchema` / `missionSnapshotTurnSchema` / `hintLadderSchema` / `DEFAULT_CHARACTER_ID`. The student flow parses the snapshot through this exact schema.
- `src/components/student/StudentHomeShell.tsx` + `src/app/student/home/page.tsx` — the shell + route this phase extends from "no homework" to the assignment list (D-13). Note reserved `closed-expired-placeholder` copy.
- `src/server/student-access/unlock.ts` + `src/app/join/actions.ts` (`readStudentUnlock`) — the unlock-cookie gate the mission routes must sit behind.
- `src/lib/supabase/server.ts` — service-role client used for all student-side server writes.

### Research
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (AI drift / child-data / guided-flow risks), `.planning/research/STACK.md`.

### Original Product Context
- `english-speaking-practice-app-spec.md` — initial product spec, MVP non-goals (no long-form free chat, no grading).
- `english-speaking-practice-app-handoff.md` — early product discussion and decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/mission/schemas.ts` — snapshot/turn/hint Zod schemas; the student flow consumes `missionSnapshotSchema` to drive turns and hints (no new turn shape needed).
- `src/components/student/StudentHomeShell.tsx` + `src/components/student/styles.ts` — existing student UI surface + shared styles; extend the shell to the assignment list and reuse the reserved closed/expired copy.
- `src/app/join/actions.ts` `readStudentUnlock` + `src/server/student-access/unlock.ts` — established pattern for cookie-gated, service-role, server-only student access; mission server actions mirror this.
- `src/lib/db/types.ts` — partial DB types including attempt/status enums; extend as the flow touches `attempts` / `attempt_turns`.

### Established Patterns
- Next.js App Router + TypeScript + Supabase + Zod. Students have NO Supabase Auth session — student reads/writes are server actions via the **service-role client**, gated by the short-lived unlock cookie (re-entered per visit, Phase 2 D-13/D-17).
- Server-owned, audited status transitions: seed/advance `assignment_students.status` and write `assignment_status_events` with `actor_type='student_session'` (mirror Phase 1/3 posture).
- Snapshot-only execution: read the assignment's `mission_snapshot`, never live mission rows.
- GRANT gotcha for any new table/column (see canonical_refs).

### Integration Points
- Student home shell (`/student/home`) → lists `assignment_students` rows for the unlocked student (join `assignments` for title + `due_at` + snapshot) with per-item state (D-13).
- Mission flow → reads `assignments.mission_snapshot`; creates/continues an `attempts` row and per-turn `attempt_turns` rows; reveals hints from the snapshot `hintLadder`; on completion writes status + audit + `submitted_at` (D-06).
- Character profile module → keyed by snapshot `characterId` (`default-buddy`), supplies scripted buddy lines/tone; separate from flow logic (D-11, CHAR-04).
- These attempt/turn rows + `highest_hint_level` + `submitted_at` are exactly the fields Phase 7's teacher review will READ.

</code_context>

<specifics>
## Specific Ideas

- Phase 4 is the flow's full state machine with **two clean Phase-N swap points** deliberately isolated: the **typed-text answer** (Phase 5 voice fills the same `*_transcript` fields) and the **accept-any-non-empty placeholder evaluation** stored in `attempt_turns.evaluation` (Phase 6 real evaluation replaces it). Plan so neither swap touches the turn/completion/status logic.
- AI-06 is satisfied **structurally** (no chat endpoint / no free-text generation exists), not by a prompt guardrail — worth stating explicitly in the plan and verification so it isn't "fixed" by adding an LLM call early.
- "One focused screen per step" + record-only hints + always-show-the-better-sentence-then-repeat together encode the product's supportive, non-punitive, guided (not chatty) tone for young learners.

</specifics>

<deferred>
## Deferred Ideas

- Real voice capture / recording / upload / clip metadata (FLOW-03, AUDIO-01..05, PILOT-02) — **Phase 5**. Phase 4 fills the same transcript fields via typed text.
- Real AI turn evaluation (meaning, target-pattern, improved sentence, repeat closeness, confidence routing) and AI mission generation (AI-01..05, MISS-02/03/05) — **Phase 6**. Phase 4's placeholder evaluation + scripted buddy are the swap points.
- Teacher review buckets, attempt-detail view, manual outcome overrides (REV-01..04, REV-06) — **Phase 7**. Phase 4 only writes the underlying fields.
- Auto-miss overdue homework → `missed` (ASGN-05) — **Phase 7**. Phase 4 shows closed/expired at read-time only.
- Character picker / multi-character cast UI (beyond the default profile) — later phase / v2. Phase 4 keeps the profile module replaceable (CHAR-04).

None of these were scope creep — they are explicitly later-phase requirements surfaced only to mark the Phase 4 boundary.

</deferred>

---

*Phase: 4-Guided Student Attempt Loop*
*Context gathered: 2026-06-27*
