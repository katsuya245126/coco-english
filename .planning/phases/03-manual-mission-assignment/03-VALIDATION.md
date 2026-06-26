---
phase: 3
slug: manual-mission-assignment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (if not yet present, Wave 0 installs — Phases 1-2 used env-aware smoke checks; this phase introduces unit/integration coverage for snapshot + assign logic) |
| **Config file** | `vitest.config.ts` (path or "none — Wave 0 installs") |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Populated by the planner from PLAN.md tasks. Each row maps a task to its automated check.
> The reusable `missionSnapshotSchema` (D-07) and the atomic assign RPC (ASGN-01/03) are the
> highest-value targets — snapshot round-tripping and one-row-per-active-student must have
> automated assertions, not just manual checks.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | MISS-01 | — | Mission create rejects required_turns ≠ authored turn count (D-02) | unit | `npm test` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | ASGN-02 | — | `missionSnapshotSchema` round-trips full denormalized mission (D-05/D-07) | unit | `npm test` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | ASGN-01, ASGN-03 | T-3-01 | Assign creates exactly one `assignment_students` row per active student; archived excluded (D-08); RPC restricted to owning teacher (D-13) | integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `npm test` script — if no test framework detected in the repo
- [ ] Test stubs for the snapshot Zod schema (`src/domain/mission/schemas.ts`) — MISS-01 / ASGN-02
- [ ] Test stub / harness for the assign RPC behavior (one row per active student, idempotency) — ASGN-01 / ASGN-03

*If existing infrastructure already covers these, record "Existing infrastructure covers all phase requirements" and clear this section.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mission builder dynamic turn sub-form (add/remove N turns = required_turns) matches the approved UI-SPEC | MISS-01 | Visual/interaction fidelity against 03-UI-SPEC.md is not unit-assertable | Open `/missions/new`, set required_turns, confirm the turn rows add/remove and match the UI-SPEC layout |
| Edit-after-assign non-blocking notice ("N active assignment(s)…") appears | D-15 | Copy + presence is a UI assertion better confirmed manually for Phase 3 | Assign a mission, edit it, confirm the notice renders and does not block save |

*If the planner can make any of these automated (e.g. component test), move them into the Per-Task map.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
