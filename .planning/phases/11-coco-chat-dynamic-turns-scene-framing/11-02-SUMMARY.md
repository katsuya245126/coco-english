---
phase: 11-coco-chat-dynamic-turns-scene-framing
plan: 02
subsystem: api
tags: [openai, moderation, zod, vitest, tdd, ferpa-coppa]

# Dependency graph
requires:
  - phase: 11-coco-chat-dynamic-turns-scene-framing
    provides: "11-01 additive schema (attempt_turns.coco_line/moderation_event columns) and broadened Vitest src/** discovery"
  - phase: 06-mission-generation-turn-evaluation
    provides: "turn-evaluator.ts deps/client/resolveApiKey/createClient adapter pattern mirrored here"
provides:
  - "conversation-generator.ts: generateCocoReply — stateless per-turn dynamic Coco reply generation with three-tier error union"
  - "content-moderation.ts: isContentSafe — fail-closed moderation wrapper for both student input and Coco output"
  - "conversation-generation.ts domain schemas + buildConversationPrompt (pure, unit-testable grounding-payload builder)"
  - "fallback-lines.ts: static in-character canned redirect line library, no AI call"
  - "11-MODERATION-DATA-USE.md FERPA/COPPA data-use note for the OpenAI moderation endpoint"
affects: [11-03-dynamic-turn-orchestration, 11-06-evidence-transcript]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed adapter divergence: content-moderation.ts inverts the other adapters' optimistic error handling — any thrown error, empty results, or non-boolean flagged field resolves to safe:false/failedOpen:true, never safe:true ambiguously"
    - "Stateless per-turn re-grounding: buildConversationPrompt() reconstructs the full steering payload (scene premise, target pattern, turn order, hard cap, wind-down, last transcript/line) fresh on every generateCocoReply call — no provider-side response chaining, no stateful conversation object"
    - "Source-contract test: conversation-generator.test.ts reads its own module source at test time to assert zero occurrences of provider-side response-chaining identifiers, independent of runtime behavior tests"

key-files:
  created:
    - src/domain/ai/conversation-generation.ts
    - src/domain/conversation/fallback-lines.ts
    - src/server/ai/conversation-generator.ts
    - src/server/ai/conversation-generator.test.ts
    - src/server/ai/content-moderation.ts
    - src/server/ai/content-moderation.test.ts
    - .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-MODERATION-DATA-USE.md
  modified: []

key-decisions:
  - "Checkpoint resolved as option-a (existing OpenAI data-use posture extends to the moderation endpoint) but the note was written with full Phase-9/Azure structural rigor rather than a rubber-stamp — documents endpoint, payload, retention posture, jurisdiction disclaimer, and an explicit pre-send confirmation, per the checkpoint's resolution instructions"
  - "mission-generator.ts referenced throughout RESEARCH.md as the adapter to mirror does not actually exist in this codebase (mission drafts are teacher-authored, not AI-generated) — turn-evaluator.ts was used as the real structural precedent instead; this is a research-vs-codebase drift, not a plan deviation requiring a rule"
  - "Own doc-comment text in conversation-generator.ts originally used the literal provider-chaining identifier while describing what NOT to use, which the source-contract test (correctly) flagged as a false positive — reworded to 'provider-side response chaining' / 'provider-side response id' so the guarantee is described without containing the literal token"

requirements-completed: [CHAT-01, CHAT-02, CHAT-04, CHAT-05]

coverage:
  - id: D1
    description: "FERPA/COPPA data-use note for the OpenAI moderation endpoint written with Phase 9 structural rigor and committed before any moderation code exists"
    verification:
      - kind: other
        ref: "test -f 11-MODERATION-DATA-USE.md && grep -qi omni-moderation — pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "isContentSafe fails closed (safe:false, failedOpen:true) on thrown error, empty results, and non-boolean flagged; safe:true only on explicit flagged:false"
    requirement: "CHAT-05"
    verification:
      - kind: unit
        ref: "src/server/ai/content-moderation.test.ts (15 tests incl. held-out property-style malformed-shape cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "generateCocoReply returns the three-tier error union (missing_api_key/provider_failed/schema_failed) and a schema-valid reply on the happy path via an injected fake client"
    requirement: "CHAT-01"
    verification:
      - kind: unit
        ref: "src/server/ai/conversation-generator.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Conversation grounding is rebuilt fresh every call (no provider-side response chaining, no stateful conversation object) — CHAT-04 architectural guardrail"
    requirement: "CHAT-04"
    verification:
      - kind: unit
        ref: "conversation-generator.test.ts: prompt-payload assertion + source-contract test asserting zero chaining-identifier occurrences"
        status: pass
    human_judgment: false
  - id: D5
    description: "Canned fallback line library reads in Coco's voice, never as a system error, with no AI call"
    requirement: "CHAT-02"
    verification: []
    human_judgment: true
    rationale: "Tone/voice quality is a subjective judgment (Pitfall 5); no automated test can verify a line 'reads as in-character' — primary line matches 11-UI-SPEC.md verbatim, additional variants are Claude's discretion per the plan"

# Metrics
duration: 20min
completed: 2026-07-15
status: complete
---

# Phase 11 Plan 02: Coco Reply Generation + Moderation Adapters Summary

**Two new server-only OpenAI adapters — stateless per-turn `generateCocoReply` and fail-closed `isContentSafe` — plus their domain Zod schemas, a static Coco-voiced fallback line library, and a Phase-9-rigor FERPA/COPPA data-use note for the OpenAI moderation endpoint, all built test-first with injected fake clients.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-15T00:48:00Z (continuation from checkpoint, zero prior commits)
- **Completed:** 2026-07-15T00:54:00Z
- **Tasks:** 3 (1 checkpoint-resolution doc task + 2 TDD tasks)
- **Files modified:** 7 (all new files)

## Accomplishments

- Resolved the blocking checkpoint (option-a) and wrote `11-MODERATION-DATA-USE.md` with full structural rigor mirroring `docs/azure-speech-data-use.md` — endpoint, payload (text-only, no PII beyond transcript content), retention/training-use posture, jurisdiction disclaimer, and an explicit pre-send confirmation — before any moderation code was written
- `src/domain/ai/conversation-generation.ts`: `conversationTurnInputSchema`, `generatedCocoReplySchema`, `parseGeneratedCocoReply`, and the pure `buildConversationPrompt()` grounding-payload builder (hardCap=8, turnsRemaining derived, wind-down/instructions structure)
- `src/server/ai/content-moderation.ts`: `isContentSafe` wraps `client.moderations.create({ model: "omni-moderation-latest" })`, fails closed on every ambiguous path (thrown error, empty results, non-boolean `flagged`) — 15/15 tests green including held-out property-style cases across 8 malformed shapes
- `src/server/ai/conversation-generator.ts`: `generateCocoReply` mirrors `turn-evaluator.ts`'s adapter shape, rebuilds the full grounding payload fresh every call via `buildConversationPrompt`, passes the student transcript as JSON data only (never string-concatenated into system instructions), logs `provider_failed` events — 6/6 tests green, zero provider-side response-chaining identifiers in the module (grep gate + source-contract test)
- `src/domain/conversation/fallback-lines.ts`: `CANNED_FALLBACK_LINES` (primary line verbatim from 11-UI-SPEC.md) + deterministic `selectFallbackLine`, no AI call
- Full regression suite green: 65 files / 577 tests passed (4 skipped); `npm run typecheck` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the FERPA/COPPA moderation data-use note** - `dfc2d613` (docs)
2. **Task 2: Domain schema + content-moderation adapter (fail-closed)** - `84f31e31` (test, RED) → `2fbc58b6` (feat, GREEN)
3. **Task 3: conversation-generator adapter + fallback lines** - `451226d3` (test, RED) → `0cc9646b` (feat, GREEN)

**Plan metadata:** (this commit)

_Note: Both TDD tasks are test → feat; no refactor commit was needed — implementations passed cleanly on first GREEN attempt after one doc-comment wording fix caught by the source-contract test itself (see Deviations)._

## Files Created/Modified

- `.planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-MODERATION-DATA-USE.md` - FERPA/COPPA data-use note for `omni-moderation-latest`
- `src/domain/ai/conversation-generation.ts` - Zod schemas + `buildConversationPrompt` for Coco reply generation
- `src/domain/conversation/fallback-lines.ts` - Static in-character canned fallback/redirect line library
- `src/server/ai/content-moderation.ts` - Fail-closed `isContentSafe` moderation wrapper
- `src/server/ai/content-moderation.test.ts` - 15 tests: flagged/unflagged/error/malformed/held-out-property cases
- `src/server/ai/conversation-generator.ts` - `generateCocoReply` stateless per-turn adapter
- `src/server/ai/conversation-generator.test.ts` - 6 tests: three-tier errors, prompt-freshness, source contract

## Decisions Made

- Checkpoint resolved as **option-a**: the existing OpenAI data-use posture (already covering `turn-evaluator.ts` sending student transcripts to OpenAI since Phase 6) extends to the moderation endpoint. Written with the same structural rigor as the Phase 9 Azure note rather than as a rubber stamp — see `key-decisions` in frontmatter and the note itself for full reasoning.
- `mission-generator.ts`, cited throughout `11-RESEARCH.md` as the adapter-shape precedent, does not exist in this codebase (mission content is teacher-authored, not AI-drafted, in the current build). `turn-evaluator.ts` was used as the actual mirrored precedent instead — same deps/client/resolveApiKey/createClient/three-tier-error-union shape, verified by direct file read before implementation.
- The domain schema module's `parseGeneratedCocoReply` follows the `turn-evaluation.ts` schema-module convention (pure, no server/AI imports) rather than a nonexistent `parseGeneratedMissionDraft` — same `{ ok, error: "schema_failed" }` shape pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-comment literal token tripped the module's own source-contract test**
- **Found during:** Task 3 (conversation-generator.ts implementation, first GREEN attempt)
- **Issue:** The module's doc comments described the stateless guarantee by naming the literal provider-side response-chaining identifier the plan's grep gate checks for ("no `previous_response_id` chaining"), which caused the source-contract test (`expect(source).not.toContain(...)`) to fail even though no chaining code existed — a false positive from prose, not implementation.
- **Fix:** Reworded the two doc-comment sentences to describe the guarantee without containing the literal identifier ("no provider-side response chaining" / "never reuses a provider-side response id").
- **Files modified:** src/server/ai/conversation-generator.ts
- **Verification:** `npx vitest run src/server/ai/conversation-generator.test.ts` — 6/6 green; `grep -c "previous_response_id" src/server/ai/conversation-generator.ts` returns 0
- **Committed in:** 0cc9646b (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor wording-only fix; no functional or scope change. This is exactly the situation the plan's own "Do NOT hard-code the literal token" instruction (Task 2's action block, analogous concern) was guarding against, applied here in Task 3's source-contract test.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no new external service configuration required. `OPENAI_API_KEY` (already required for transcription/evaluation/TTS since Phases 5/6/8) is the only credential these adapters use; the moderation endpoint is free and uses the same key.

## Next Phase Readiness

- `generateCocoReply` and `isContentSafe` are ready to be wired into orchestration in 11-03 (`mission-flow.ts`/`audio-upload.ts` per RESEARCH.md Open Question 3's resolution) — both are fully unit-tested in isolation with injectable fake clients, no orchestration coupling yet.
- `attempt_turns.coco_line` and `attempt_turns.moderation_event` (from 11-01) are ready to be populated by 11-03 using these adapters' outputs.
- `CANNED_FALLBACK_LINES`/`selectFallbackLine` are ready for the shared D-10/D-11/D-13 degrade path in 11-03.
- `11-MODERATION-DATA-USE.md` is in place — no further compliance blocker before 11-03 sends any student transcript through `isContentSafe` in an orchestrated flow.
- No blockers for 11-03.

---
*Phase: 11-coco-chat-dynamic-turns-scene-framing*
*Completed: 2026-07-15*

## Self-Check: PASSED

All 7 key files and 5 task commit hashes verified present on disk and in git log.
