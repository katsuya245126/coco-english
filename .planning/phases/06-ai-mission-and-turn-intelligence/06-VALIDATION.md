---
phase: 06
slug: ai-mission-and-turn-intelligence
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-27
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for unit/server tests; Playwright for focused end-to-end/source-contract checks |
| **Config file** | `vitest.config.ts`; `playwright.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60-180 seconds depending on Playwright scope |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | MISS-02, MISS-03, MISS-05, AI-01, AI-02, AI-03, AI-04, AI-05 | T-06-01 | RED scaffold proves Phase 6 AI behavior before implementation and uses fake clients only. | unit/e2e source | `npx vitest run tests/domain/mission-generation.test.ts tests/domain/turn-evaluation.test.ts tests/server/ai-mission-generator.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | MISS-02, MISS-03, MISS-05 | T-06-02 | Teacher draft generation validates strict structured output and keeps preview/edit before assignment. | unit/e2e | `npx vitest run tests/domain/mission-generation.test.ts tests/server/ai-mission-generator.test.ts && npx playwright test tests/e2e/teacher-ai-mission-draft.spec.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | AI-01, AI-02, AI-03, AI-05 | T-06-03 | Original-answer evaluator routes low-confidence, ambiguous, malformed, and non-English cases without pretending pass/fail certainty. | unit/e2e | `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts && npx playwright test tests/e2e/student-ai-evaluation.spec.ts` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 3 | AI-03, AI-04, AI-05 | T-06-04 | Repeat evaluation, completion compatibility, and teacher-review evidence handoff stay app-owned and auditable. | unit/e2e | `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts tests/server/audio-evidence.test.ts && npx playwright test tests/e2e/student-ai-evaluation.spec.ts tests/e2e/teacher-audio-evidence.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/server/ai-mission-generator.test.ts` — fake OpenAI client fixtures for mission generation, strict-schema success/failure, missing API key, and no paid calls.
- [ ] `tests/domain/mission-generation.test.ts` — pure mapping/schema tests for generated draft shape and compatibility with existing mission schemas.
- [ ] `tests/server/turn-evaluator.test.ts` — fake OpenAI client fixtures for original/repeat evaluation outcomes and schema failure mapping.
- [ ] `tests/domain/turn-evaluation.test.ts` — pure decision helper tests for correct, needs-correction, non-English, low-confidence, and failed-schema paths.
- [ ] `tests/server/student-mission-flow.test.ts` — service-level tests proving conditional skip-repeat, repeat-required corrections, teacher-review routing, and server-owned status writes.
- [ ] `tests/e2e/teacher-ai-mission-draft.spec.ts` — teacher draft generation UI contract with mocked server path or fixture-backed route.
- [ ] `tests/e2e/student-ai-evaluation.spec.ts` — student evaluation UI states for correct/no-repeat, correction/repeat, non-English retry, and teacher-review routing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live OpenAI model quality and exact confidence thresholds | MISS-02, AI-01, AI-02, AI-03, AI-04, AI-05 | Automated tests must use fake clients and fixtures; paid API calls should not run in CI. | With explicit OpenAI env loaded, generate 3 mission drafts and evaluate fixture transcripts for correct English, needs correction, non-English, low-confidence/ambiguous, and repeat-accepted/retry paths; record thresholds and model choice before pilot. |
| Classroom-level teacher-review UX handoff | AI-05 | Full dashboard buckets and manual overrides are Phase 7 scope. | Confirm Phase 6 writes review reasons/status in a way Phase 7 can surface, without building Phase 7 dashboard buckets now. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
