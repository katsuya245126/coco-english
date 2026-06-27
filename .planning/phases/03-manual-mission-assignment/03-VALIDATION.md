---
phase: 3
slug: manual-mission-assignment
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-26
validated: 2026-06-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already present — no Wave 0 install needed; this phase adds unit/integration coverage for snapshot + assign logic) |
| **Config file** | `vitest.config.ts` |
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test File | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | MISS-01 | — | Mission create rejects required_turns ≠ authored turn count (D-02) | unit | `npm test` | `tests/domain/mission-schemas.test.ts`, `tests/server/mission-service.test.ts` | ✅ green |
| 3-02-01 | 02 | 2 | ASGN-02 | — | `missionSnapshotSchema` round-trips full denormalized mission (D-05/D-07) | unit | `npm test` | `tests/domain/mission-schemas.test.ts`, `tests/server/mission-assign.test.ts` | ✅ green |
| 3-02-02 | 02 | 2 | ASGN-01, ASGN-03 | T-3-01 | Assign creates exactly one `assignment_students` row per active student; archived excluded (D-08); RPC restricted to owning teacher (D-13) | integration | `npm test` | `tests/schema/mission-assign-rpc-schema.test.ts`, `tests/server/mission-assign.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**Existing infrastructure covers all phase requirements.** vitest + `vitest.config.ts` + `npm test` were already present from Phases 1–2; no Wave 0 install was needed. All snapshot-schema and assign-RPC behaviors are covered by the test files listed in the Per-Task map above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mission builder dynamic turn sub-form (add/remove N turns = required_turns) matches the approved UI-SPEC | MISS-01 | Visual/interaction fidelity against 03-UI-SPEC.md is not unit-assertable | Open `/missions/new`, set required_turns, confirm the turn rows add/remove and match the UI-SPEC layout |
| Edit-after-assign non-blocking notice ("N active assignment(s)…") appears | D-15 | Copy + presence is a UI assertion better confirmed manually for Phase 3 | Assign a mission, edit it, confirm the notice renders and does not block save |

*If the planner can make any of these automated (e.g. component test), move them into the Per-Task map.*

> **Both manual behaviors were confirmed during UAT (5/5 pass, see `03-UAT.md`):** the edit-after-assign notice is UAT item 3 (D-15); the dynamic turn sub-form fidelity is covered by the mission-authoring UAT path. They remain manual-only because they assert visual/interaction fidelity against `03-UI-SPEC.md`, which is not unit-assertable.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infrastructure covers all requirements)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-26 — 15/15 automated tests green, all Per-Task requirements COVERED.

---

## Validation Audit 2026-06-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Audited State A (existing draft VALIDATION.md against completed phase artifacts). All 3 Per-Task requirement rows (MISS-01, ASGN-01/02/03) map to existing tests that target the correct behavior and run green: `npx vitest run tests/domain/mission-schemas.test.ts tests/server/mission-service.test.ts tests/schema/mission-assign-rpc-schema.test.ts tests/server/mission-assign.test.ts` → **15 passed**. No auditor spawn or new test generation required. The draft `nyquist_compliant: false` / `wave_0_complete: false` flags and `⬜ pending` / `❌ W0` statuses were stale (set pre-execution); updated to reflect verified reality.
