---
phase: 4
slug: guided-student-attempt-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x (unit) + Playwright 1.49.x (e2e) |
| **Config file** | `vitest.config.ts` (exists), `playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run tests/domain/ tests/server/ --reporter=verbose` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30–60 seconds (unit), +e2e per Playwright config |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/domain/ tests/server/ --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && npx playwright test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds (unit-only sampling per commit)

---

## Per-Task Verification Map

> Requirement → test mapping lifted from RESEARCH.md `## Validation Architecture`. Task IDs are assigned by the planner; the Requirement/Test-Type/Command columns are the binding contract each task must satisfy.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| FLOW-01 | Student sees assignments and can start mission | unit + e2e | `npx vitest run tests/server/mission-flow.test.ts` | ❌ W0 | ⬜ pending |
| FLOW-02 | Buddy asks snapshot-driven questions | unit | `npx vitest run tests/domain/character-profile.test.ts` | ❌ W0 | ⬜ pending |
| FLOW-04 | System shows improved target-form sentence | e2e | `npx playwright test tests/e2e/student-mission.spec.ts` | ❌ W0 | ⬜ pending |
| FLOW-05 | Student must repeat improved sentence | unit + e2e | `npx vitest run tests/server/mission-flow.test.ts` | ❌ W0 | ⬜ pending |
| FLOW-06 | Mission completes after required turns + repeats | unit | `npx vitest run tests/server/mission-flow.test.ts` | ❌ W0 | ⬜ pending |
| FLOW-07 | Progressive hint reveal (record-only, no completion impact) | unit | `npx vitest run tests/server/mission-flow.test.ts` | ❌ W0 | ⬜ pending |
| AI-06 | No chat endpoint, no LLM call (structural) | unit | `npx vitest run tests/domain/ai-boundary.test.ts` | ❌ W0 | ⬜ pending |
| CHAR-01 | Default buddy character exists | unit | `npx vitest run tests/domain/character-profile.test.ts` | ❌ W0 | ⬜ pending |
| CHAR-02 | Buddy tone is friendly/safe | unit | `npx vitest run tests/domain/character-profile.test.ts` | ❌ W0 | ⬜ pending |
| CHAR-03 | No romance/harsh/off-topic content | unit | `npx vitest run tests/domain/character-profile.test.ts` | ❌ W0 | ⬜ pending |
| CHAR-04 | Character profile separated from mission logic | unit | `npx vitest run tests/domain/character-profile.test.ts` | ❌ W0 | ⬜ pending |
| PILOT-01 | Mobile-responsive student flow | e2e | `npx playwright test tests/e2e/student-mission.spec.ts --project=mobile` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/server/mission-flow.test.ts` — covers FLOW-01, FLOW-05, FLOW-06, FLOW-07 (start, submit-answer, submit-repeat, reveal-hint, complete actions; completion fires only after required turns + accepted repeats; hints are record-only)
- [ ] `tests/domain/character-profile.test.ts` — covers CHAR-01, CHAR-02, CHAR-03, CHAR-04, FLOW-02 (default-buddy profile exists, tone is safe, no off-topic/romance/harsh content, module boundary independent of flow logic)
- [ ] `tests/domain/ai-boundary.test.ts` — covers AI-06 (structural: no AI/LLM/chat imports or endpoints reachable from the student flow)
- [ ] `tests/e2e/student-mission.spec.ts` — covers FLOW-04, PILOT-01 (full per-turn flow end-to-end; improved sentence shown then repeat required; mobile + tablet viewports)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Subjective tone/age-appropriateness of buddy copy | CHAR-02, CHAR-03 | Static copy review is a human judgement beyond keyword assertions | Reviewer reads every template line in the character profile; confirms friendly, simple, encouraging, classroom-safe; no romance/harsh/off-topic phrasing |
| Visual fit of step cards above the on-screen keyboard | PILOT-01, D-12 | Real on-device keyboard overlap is hard to assert in headless e2e | Open the mission on a physical phone + tablet; confirm active input stays visible above the keyboard and the primary action is reachable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 test files above)
- [ ] No watch-mode flags (use `vitest run`, not `vitest`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
