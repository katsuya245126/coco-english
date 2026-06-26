# Phase 3: Manual Mission Assignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 3-Manual Mission Assignment
**Areas presented:** Mission-builder form shape, Snapshot content & timing, Assign-to-class behavior, Mission edit-after-assign rules

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Mission-builder form shape | How the teacher authors turn content, hint tiers, due-date timing | |
| Snapshot content & timing | What goes in `mission_snapshot` and when it freezes | |
| Assign-to-class behavior | Which students get rows; re-assign; multiple active assignments | |
| Mission edit-after-assign rules | Whether a mission stays editable after assignment | |
| **Decide for me** | Claude makes all four calls and captures them as decisions | ✓ |

**User's choice:** "Decide for me" — delegated all four gray areas to Claude rather than discussing interactively.
**Notes:** Decisions were locked by Claude grounded in the existing Phase 1 schema (`missions`, `mission_turn_templates`, `assignments.mission_snapshot`, `assignment_students`) and prior-phase decisions (immutable snapshot, class-scoped students, server-owned statuses, RLS ownership). See CONTEXT.md D-01 through D-16 for the resulting decisions and rationale.

---

## Claude's Discretion

User delegated the entire discussion, so all four areas were decided by Claude. Within those, the following finer implementation details were explicitly left open to research/planning: exact routes/page structure, server action vs route handler, precise Zod field names/module layout, turn-authoring UI form (inline/modal/step-wise), exact `level` label set and `hint_ladder` jsonb shape, and any minor schema additions strictly required for authoring.

## Deferred Ideas

- AI/draft mission generation + preview + strict-schema validation (MISS-02/03/05) → Phase 6
- Character picker beyond persisting default `character_id` (CHAR-04) → Phase 4 / v2
- Auto-mark overdue homework `missed` when `due_at` passes (ASGN-05) → Phase 7
- Mission reuse/duplication and saved templates (CONTV2-01/02) → v2
