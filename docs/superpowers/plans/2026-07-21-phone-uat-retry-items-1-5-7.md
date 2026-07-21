# Phone UAT Retry Redesign and Items 1, 5, 7 Implementation Plan

**Execution status (2026-07-21):** Completed locally. Final evidence,
environment blockers, reviewer findings, and the Git-metadata write limitation
are recorded in
`docs/tasks/archive/2026-07-21-phone-uat-retry-items-1-5-7.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans. Production edits remain lead-owned; subagents
> are read-only investigators/reviewers.

**Goal:** Redesign minimal-effort retry help, prevent dynamic topic/run-on
failures, improve translation-hint chunks/wrapping, and move Coco's thinking
line into the chatbox.

**Architecture:** Extend the existing evaluation JSON with presentation
metadata instead of adding schema columns. Keep conversation quality inside
the existing stateless generator by mirroring stronger prompt rules and adding
one pure line-policy check with a single corrective retry. Version the
translation cache through its digest and make phrase boxes participate in
inline flow. Reuse the existing `cocoThinking` state and sprite.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Vitest, fake provider
clients, Supabase JSON persistence.

## Global constraints

- Work only in `.claude/worktrees/minimal-effort-answer-guard`.
- Do not touch `.claude/worktrees/dynamic-dialogue-pagination`.
- Item 4 is excluded.
- No migrations, new production dependencies, real provider calls, deploy,
  merge, or push.
- Preserve ownership checks, audit writes, exact-target bypass, early guard
  ordering, two-block escape hatch, and preset/conversation split.
- Use failing tests before production behavior changes.
- Keep each implementation task in its own local commit.

---

### Task 1: Minimal-effort retry redesign and semantic backstop

**Files:**

- Create `src/domain/ai/minimal-effort-feedback.ts`.
- Create `tests/domain/minimal-effort-feedback.test.ts`.
- Modify `src/domain/ai/turn-evaluation.ts` and its tests.
- Modify `src/server/ai/turn-evaluator.ts` and its fake-client tests.
- Modify `src/server/student-access/audio-upload.ts` and both upload suites.
- Modify `src/domain/flow/completion.ts` and mission-flow tests.
- Modify `StepAiEvaluationFeedback.tsx`, `MissionFlowShell.tsx`, character
  expression types/tests, the student TTS route, and TTS source tests.

- [ ] Add RED tests for classification, safe examples, distinct unsure copy,
      persisted/resumed metadata, counter preservation, exact-match behavior,
      prompt guidance, and the post-cap `How often` regression.
- [ ] Add a deterministic feedback classifier without changing the existing
      boolean detector or blocklist.
- [ ] Use answer-shaped preset examples; derive only the bounded conversation
      `How often do you ...?` example; otherwise persist no example.
- [ ] Rename the branch-only client outcome to `retryMinimalEffort` and carry
      `minimalEffortKind` / `retryExample` through upload and resume.
- [ ] Render `It's okay to guess!` guidance for `I don't know`; render an
      example or detail fallback for other blocked answers. Keep mascot and
      TTS descriptors server-owned.
- [ ] Preserve a count of two through later evaluation JSON so generic retry
      outcomes cannot restart the blocking cycle.
- [ ] For a post-cap one-word polar response to an information question,
      convert only an auxiliary polar correction such as `Yes, I do.` to
      `teacher_review/ambiguous`; never fabricate or accept a false answer.
- [ ] Run the handoff's Task 1 focused matrix, typecheck, and lint; inspect and
      commit only Task 1 files.

### Task 2: Item 1 active-topic and generated-line quality

**Files:**

- Modify `src/domain/ai/conversation-generation.ts` and its tests.
- Modify `src/server/ai/conversation-generator.ts` and its fake-client tests.

- [ ] Add RED prompt tests for keeping the latest question's activity active,
      treating person/place as details, the swimming/friend/games
      counterexample, and sentence-boundary punctuation.
- [ ] Add RED pure-policy tests rejecting the UAT line, over-12-word lines,
      missing/multiple questions, trailing text, and run-ons while accepting a
      short punctuated follow-up and a final closing line.
- [ ] Mirror prompt rules in domain and system instructions.
- [ ] Consolidate format and either/or failures into one reasoned corrective
      regeneration; reject a still-invalid second candidate without a third
      provider call.
- [ ] Run conversation domain/adapter/history/upload tests plus typecheck and
      lint; verify preset mode stays untouched; commit only Item 1 files.

### Task 3: Item 5 translation granularity, wrapping, and cache freshness

**Files:**

- Modify `src/server/ai/translation-hint-generator.ts` and tests.
- Modify `src/server/ai/translation-hint-cache.ts` and tests.
- Modify `src/components/student/CocoDialogueBox.tsx`, `styles.ts`, and TTS UI
  source tests.

- [ ] Add RED prompt tests for conditional 2–3 chunks, roughly 2–4 words,
      separable meaning units, and no punctuation-only remainder.
- [ ] Add RED cache tests proving the policy-versioned digest misses legacy
      rows and then hits without a migration.
- [ ] Add RED source tests requiring both the relative phrase wrapper and the
      button to be inline with normal wrapping.
- [ ] Implement prompt, digest version, and paired inline styles; do not hard
      reject legitimate idioms or single difficult words.
- [ ] Run translation generator/cache/domain/source suites, typecheck, and
      lint; record the sandbox's localhost visual-verification status; commit
      only Item 5 files.

### Task 4: Item 7 thinking line inside `CocoDialogueBox`

**Files:**

- Modify `MissionFlowShell.tsx` and `CocoDialogueBox.tsx`.
- Delete the now-orphaned `StepCocoThinking.tsx`.
- Modify conversation recovery and TTS UI source tests.

- [ ] Add RED source tests for the in-box text, polite atomic live-region
      treatment, and absence of duplicate step-card rendering.
- [ ] Make `getMascotDialogue` return `Coco is thinking…` through the existing
      dialogue-text path, and remove the duplicate card.
- [ ] Run recovery/source/expression/mission-page tests, typecheck, and lint;
      record localhost visual-verification status; commit only Item 7 files.

### Task 5: Combined review, verification, and archive

- [ ] Review the complete branch diff for duplicated logic, stale variants,
      missing callers, generated files, secrets, and Item 4 scope creep.
- [ ] Request a final read-only reviewer against the stable task commit range;
      fix Critical/Important findings and rerun affected checks.
- [ ] Run focused matrix, all non-socket tests, full suite, typecheck, lint,
      and production build. Report exact outcomes and environmental blockers.
- [ ] Update this task's checks, archive `TASK.md` under
      `docs/tasks/archive/`, inspect final Git status, and leave the branch
      local for user review.
