---
phase: 10
slug: mascot-vn-style
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6 (already configured — `vitest.config.ts`, `environment: "node"`, no jsdom) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/domain/<new-file>.test.ts` (targeted per task) |
| **Full suite command** | `npx vitest run` (matches `config.json`'s `workflow.test_command`) |
| **Estimated runtime** | ~5–15 seconds full suite (last known-good baseline: 411 passed / 4 skipped per STATE.md) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/domain/<new-file>.test.ts` (targeted, fast)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus the two manual real-device checkpoints
- **Max feedback latency:** ~15 seconds (automated); manual device checks are explicit human-verify gates

---

## Per-Task Verification Map

All automated coverage this phase is **pure-function unit tests** (primitive/plain-object inputs) — no jsdom or real Web Audio/DOM APIs, consistent with the project's injectable-fake pattern (Phases 6/9). Task IDs below are indicative; the planner assigns final plan/wave/task IDs.

| Behavior | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|----------|-------------|------------|-----------|-------------------|-------------|--------|
| `deriveExpression()` pure mapping over `FlowState`-shaped fixtures; `coco-sad-alpha.png` structurally unreachable | MASCOT-03 | — | unit | `npx vitest run tests/domain/character-expression.test.ts` | ❌ W0 | ⬜ pending |
| Silence-hysteresis speaking-state logic — pure function of `(amplitude, now, priorState)` over injected sequences | MASCOT-02 | — | unit | `npx vitest run tests/domain/mascot-speaking-state.test.ts` | ❌ W0 | ⬜ pending |
| `shouldDegrade()` frame-time-budget logic — pure function over frame-delta arrays | MASCOT-04 | — | unit | `npx vitest run tests/domain/mascot-perf-degrade.test.ts` | ❌ W0 | ⬜ pending |
| Mascot stage mounts once, persists across all `FlowStep` values, no layout shift | MASCOT-01 | — | manual (visual/DOM) | N/A — human-verify checkpoint | N/A | ⬜ pending |
| Real `AnalyserNode`/`AudioContext` wiring drives visible speaking state off actual audio | MASCOT-02 | — | manual (real audio + human ear/eye) | N/A — human-verify checkpoint | N/A | ⬜ pending |
| Real low-end device (Chromebook/older tablet): no visible stutter, mission flow completes | MASCOT-04 | — | manual (real hardware) | N/A — human-verify checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/domain/character-expression.test.ts` — MASCOT-03 (`deriveExpression()` against `FlowState` fixtures, incl. explicit assertion no path selects `coco-sad-alpha.png`)
- [ ] `tests/domain/mascot-speaking-state.test.ts` — MASCOT-02 (hysteresis hold-window logic against injected `(amplitude, timestamp)` sequences)
- [ ] `tests/domain/mascot-perf-degrade.test.ts` — MASCOT-04 (`shouldDegrade()` against injected frame-delta arrays)

*No new test framework or fixture setup required — existing `vitest.config.ts` (`environment: "node"`) is sufficient; all recommended unit tests operate on pure functions taking primitive/plain-object inputs, deliberately avoiding jsdom or real Web Audio/DOM APIs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mascot stage mounts once, persists across every `FlowStep`, no layout shift | MASCOT-01 | No jsdom in this project's test env makes a full-render assertion costly; mirrors Phase 8/9 human-verify gates | Run a mission end-to-end; confirm Coco + background + dialogue box stay mounted through question → aiFeedback → repeat → repeatFeedback → transition → complete with no jump/reflow |
| Real audio drives a visibly distinct speaking state (not a timer) | MASCOT-02 | Requires real audio playback + human ear/eye; same as Phase 8 audio smoke tests | Play a Coco line; confirm the speaking animation tracks the actual voice (starts/stops with audio, not on a fixed clock); confirm mid-sentence pauses don't flicker |
| Acceptable performance on a real low-end school device | MASCOT-04 | Real hardware only; mirrors Phase 8 VOICE-04 / Phase 9 PRON-03 device gates | On a Chromebook/older tablet, run a full mission; confirm no visible stutter and that the mission loop (record/submit/advance) works identically even if the amplitude animation degrades to static |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
