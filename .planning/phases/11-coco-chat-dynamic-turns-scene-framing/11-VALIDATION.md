---
phase: 11
slug: coco-chat-dynamic-turns-scene-framing
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
approved: 2026-07-03
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6 (`test` script; `openai@6.45.0` already installed — no new AI/test deps this phase) |
| **Config file** | `vitest.config.ts` (environment `node`, `setupFiles: ./tests/setup-realtime-stub.ts`, `@` alias → `./src`) |
| **Quick run command (per file)** | `npx vitest run <path>` (e.g. `npx vitest run src/server/ai/content-moderation.test.ts`) |
| **Full suite command** | `npx vitest run` (non-watch; runs everything the config `include` matches) |
| **Estimated runtime** | ~4 seconds full suite (currently 42 files / 382 tests in ~3.0s; Phase 11 adds ~5 colocated `src/**` test files) |

> **Do NOT use `npm test` for gating.** The `test` script is bare `vitest` (watch mode) and never exits. All gate/CI runs use `npx vitest run` (or `npx vitest run <path>`), which exits non-zero on failure. No `--watch` flag appears in any verify command in this phase.

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `npx vitest run <path>` (see Per-Task Verification Map). Non-test tasks run their `npm run typecheck` / `npm run lint` / grep gate instead.
- **After every plan wave (waves 1→4):** Run the full suite `npx vitest run` plus `npm run typecheck`.
- **Before `/gsd-verify-work`:** Full suite green (`npx vitest run` exits 0) AND the roadmap-mandated manual-review UAT (plan 11-07) signed off. The manual UAT cannot be waived by automated coverage.
- **Max feedback latency:** ~10 seconds (single targeted file < 1s; full suite ~4s; typecheck dominates a wave gate at a few seconds).

---

## Per-Task Verification Map

Requirement IDs: `SCENE-01, CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06`.
Threat refs are from each plan's `<threat_model>` STRIDE register.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | SCENE-01, CHAT-01, CHAT-06 | T-11-01 | Migration additive-only (no drop/rename/type-change on v1 tables) | migration grep | `grep -iE "add column" supabase/migrations/202607030001_coco_chat_dynamic_turns.sql \| grep -c "" \| awk '$1>=4{exit 0} {exit 1}'` | ✅ (created by task) | ⬜ pending |
| 11-01-02 | 01 | 1 | — (infra) | — | Wave 0: broaden `vitest.config.ts` include to discover colocated `src/**` tests; existing suite still green | config edit + full suite | `npx vitest run` | ✅ (edits existing config) | ⬜ pending |
| 11-01-03 | 01 | 1 | CHAT-01 | T-11-02, T-11-03 | Server-side 3-8 range guard; conditional refine (zero-turn chat snapshot validates, preset still strict) | unit (tdd) | `npx vitest run src/domain/mission/schemas.test.ts` | ✅ (Wave 0 owned by 11-01-02) | ⬜ pending |
| 11-01-04 | 01 | 1 | SCENE-01, CHAT-06 | T-11-01 | Snapshot captures premise+mode; DB types match additive columns | typecheck | `npm run typecheck` | ✅ | ⬜ pending |
| 11-01-05 | 01 | 1 | SCENE-01, CHAT-06 | T-11-01 | Live migration push confirmed (four columns present) | manual | See Manual-Only Verifications | N/A | ⬜ pending |
| 11-02-D | 02 | 1 | CHAT-05 | T-11-06 | FERPA/COPPA data-use posture decided before any student input flows through moderation | manual (decision) | See Manual-Only Verifications | N/A | ⬜ pending |
| 11-02-01 | 02 | 1 | CHAT-05 | T-11-06 | Data-use note exists before moderation code sends any transcript | file/grep | `test -f .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-MODERATION-DATA-USE.md && grep -qi "omni-moderation" .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-MODERATION-DATA-USE.md` | ✅ (created by task) | ⬜ pending |
| 11-02-02 | 02 | 1 | CHAT-05 | T-11-05 | Moderation wrapper fails CLOSED on throw / empty / non-boolean flagged (never safe:true) | unit (tdd) | `npx vitest run src/server/ai/content-moderation.test.ts` | 🔨 created by task; Wave 0 include owned by 11-01-02 | ⬜ pending |
| 11-02-03 | 02 | 1 | CHAT-01, CHAT-02, CHAT-04 | T-11-04, T-11-07 | Stateless per-turn re-grounding (no `previous_response_id`); three-tier error union; transcript passed as data | unit (tdd) | `npx vitest run src/server/ai/conversation-generator.test.ts` | 🔨 created by task; Wave 0 include owned by 11-01-02 | ⬜ pending |
| 11-03-01 | 03 | 2 | CHAT-03, CHAT-06 | T-11-08, T-11-11 | Hard cap 8 server-owned (refuses turnOrder>8); idempotent owner-scoped coco_line upsert; AI-06 boundary preserved | unit (tdd) | `npx vitest run src/server/student-access/mission-flow.test.ts` | 🔨 created by task; Wave 0 include owned by 11-01-02 | ⬜ pending |
| 11-03-02 | 03 | 2 | CHAT-01, CHAT-05, CHAT-06 | T-11-08, T-11-09, T-11-10, T-11-12 | Dual-direction moderation (pre-input, post-output); regenerate-once; shared canned fallback; windDown vs fixed 8; preset path unchanged | unit (tdd) | `npx vitest run src/server/student-access` | ⚠ mixed — new `src/` file discoverable via 11-01-02 Wave 0 include; existing `tests/server/audio-upload.test.ts` already covered | ⬜ pending |
| 11-03-03 | 03 | 2 | SCENE-01 | — (T-11 register n/a) | Scene premise in AI mission draft; missing-premise draft → schema_failed; premise-only path for manual missions | unit (tdd) | `npx vitest run src/server/ai/mission-generator.test.ts src/domain/ai` | 🔨 created by task; Wave 0 include owned by 11-01-02 | ⬜ pending |
| 11-04-01 | 04 | 3 | SCENE-01 | T-11-13, T-11-14 | Premise card unvoiced (no CocoSpeechAudio), omitted when null | source grep + typecheck | `grep -Lq "CocoSpeechAudio" src/components/student/ScenePremiseCard.tsx && npm run typecheck` | ✅ (created by task) | ⬜ pending |
| 11-04-02 | 04 | 3 | CHAT-02 | T-11-13 | Thinking indicator reuses inline SVG spinner (no spinner lib) | source grep + typecheck | `grep -q "Coco is thinking" src/components/student/StepCocoThinking.tsx && npm run typecheck` | ✅ (created by task) | ⬜ pending |
| 11-04-03 | 04 | 3 | SCENE-01, CHAT-02 | T-11-13, T-11-14 | Dynamic line reuses existing CocoSpeechAudio; no second progress indicator for cap; preset flow unchanged | typecheck + lint | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 11-04-04 | 04 | 3 | SCENE-01, CHAT-02 | T-11-13, T-11-14 | Visual/interaction confirm: premise card, thinking indicator, dynamic playback, unchanged preset | manual | See Manual-Only Verifications | N/A | ⬜ pending |
| 11-05-01 | 05 | 3 | SCENE-01, CHAT-01 | T-11-15, T-11-16 | Premise-only generate action; save persists conversation_mode/scene_premise; premise failure never blocks save | typecheck | `npm run typecheck` | ✅ | ⬜ pending |
| 11-05-02 | 05 | 3 | SCENE-01, CHAT-01 | T-11-15, T-11-17 | Default-OFF toggle; conditional 3-8 field; premise textarea+generate; TurnEditor hidden/optional in chat mode | typecheck + lint | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 11-05-03 | 05 | 3 | SCENE-01, CHAT-01 | T-11-15, T-11-16, T-11-17 | End-to-end authoring: zero-turn chat save + assign; premise auto-fill + manual generate | manual | See Manual-Only Verifications | N/A | ⬜ pending |
| 11-06-01 | 06 | 3 | CHAT-06 | T-11-18 | Evidence shape gains cocoLine/moderationFlag/targetPattern/scenePremise; `mapModerationFlag` safe-default null on malformed jsonb (never throws) | unit (tdd) | `npx vitest run src/server/teacher` | ⚠ mixed — new colocated `src/server/teacher/*.test.ts` discoverable via 11-01-02 Wave 0 include; existing `tests/server/teacher-*.test.ts` already covered | ⬜ pending |
| 11-06-02 | 06 | 3 | CHAT-06 | T-11-20 | Collapsed moderation-flag panel (aria-expanded disclosure), amber tier not red, omitted when null | source grep + typecheck | `grep -q "aria-expanded" src/components/teacher/ModerationFlagPanel.tsx && npm run typecheck` | ✅ (created by task) | ⬜ pending |
| 11-06-03 | 06 | 3 | CHAT-06, SCENE-01 | T-11-19 | Header chip+premise, Coco-said row, pattern badge (green/neutral never red), moderation flag; preset review unchanged | typecheck + lint | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 11-06-04 | 06 | 3 | CHAT-06, SCENE-01 | T-11-18, T-11-19, T-11-20 | Chat transcript reviews correctly; preset review unchanged; flag expands to correct copy | manual | See Manual-Only Verifications | N/A | ⬜ pending |
| 11-07-01 | 07 | 4 | CHAT-04, CHAT-05, CHAT-02, CHAT-03 | T-11-21, T-11-22 | Rubric defines pass/fail for on-pattern, moderation-in-practice, personality, cap+wind-down | doc grep | `grep -qE "CHAT-04" .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CHAT-UAT-RUBRIC.md && grep -qE "CHAT-05" .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CHAT-UAT-RUBRIC.md` | ✅ (created by task) | ⬜ pending |
| 11-07-02 | 07 | 4 | CHAT-02, CHAT-03, CHAT-04, CHAT-05 | T-11-21, T-11-22 | Real transcripts captured + scored; 8-turn cap + wind-down + fallback empirically confirmed | doc grep | `grep -qi "verdict" .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CHAT-UAT-TRANSCRIPTS.md && grep -qiE "turn 8\|hard cap\|cap" .planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CHAT-UAT-TRANSCRIPTS.md` | ✅ (created by task) | ⬜ pending |
| 11-07-03 | 07 | 4 | CHAT-02, CHAT-03, CHAT-04, CHAT-05 | T-11-21, T-11-22 | Human sign-off: on-pattern, safe fallback reading, personality, cap+wind-down (blocking-human, not auto-approvable) | manual | See Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**BLOCKING — must complete before any `src/**/*.test.ts` verify command can pass:**

- [ ] **Broaden `vitest.config.ts` `include` to cover colocated `src` tests.** — **Owned by plan 11-01, Task 2 (`11-01-02`).**
  Change `include: ["tests/**/*.test.ts"]` → `include: ["tests/**/*.test.ts", "src/**/*.test.ts"]`.
  **Why (verified this session):** Vitest 3.x intersects an explicit-path filter with the config `include` glob. Under the current tests-only `include`, running `npx vitest run src/server/ai/content-moderation.test.ts` returns `No test files found, exiting with code 1` — the test is never discovered, so the verify command fails for an infrastructure reason, not a code reason. This affects every new colocated `src` test in plans 11-01 (schemas.test.ts), 11-02 (content-moderation.test.ts, conversation-generator.test.ts), 11-03 (mission-flow.test.ts, mission-generator.test.ts + src/domain/ai), and 11-06 (audio-evidence colocated test). This edit is now explicitly assigned: plan 11-01 lists `vitest.config.ts` in `files_modified` and Task 2 (`11-01-02`) performs the include broadening and runs `npx vitest run` to confirm the existing suite stays green — it executes before 11-01 Task 3's `npx vitest run src/domain/mission/schemas.test.ts` verify and before any other Phase 11 colocated-`src` test verify. `--include` is NOT a valid Vitest 3.x CLI flag (config-only), so this cannot be worked around per-command.
  *Verified fix:* with the broadened `include`, an explicit `src/**` test path runs and passes (probe: `Test Files 1 passed`), and a bare `npx vitest run` discovers both roots. The existing 42-file/382-test suite still passes after the change.

**Test scaffolds created by the tasks themselves (RED-first, no separate Wave 0 file needed):**

- [ ] `src/domain/mission/schemas.test.ts` — created in 11-01 Task 2 (conditional refine, 3-8 range, backward compat)
- [ ] `src/server/ai/content-moderation.test.ts` — created in 11-02 Task 2 (fail-closed branches)
- [ ] `src/server/ai/conversation-generator.test.ts` — created in 11-02 Task 3 (three-tier errors, stateless prompt)
- [ ] `src/server/student-access/mission-flow.test.ts` — created/extended in 11-03 Task 1 (cap refusal, idempotent upsert)
- [ ] `src/server/ai/mission-generator.test.ts` — created/extended in 11-03 Task 3 (scene premise in draft)
- [ ] `src/server/teacher/audio-evidence` colocated test — created/extended in 11-06 Task 1 (safe-default jsonb mappers)

> The tasks above are `tdd="true"` and write their own RED-first tests. The ONLY standalone Wave 0 infrastructure action is the `vitest.config.ts` include broadening, now owned by plan 11-01 Task 2 (`11-01-02`). Shared fixtures already exist (`tests/setup-realtime-stub.ts` via `setupFiles`); no new conftest/fixture file is required.

---

## Manual-Only Verifications

These behaviors cannot be fully covered by automated tests and are gated by blocking human checkpoints. Plan 11-07 is the roadmap-mandated manual UAT deliverable; its criteria (CHAT-02/03/04/05 in-practice) are inherently human-judged.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Supabase migration push (four additive columns present) | SCENE-01, CHAT-06 | Build/typecheck pass off `src/lib/db/types.ts`, not the live DB; the push is a separate real-infra step | 11-01 Task 5: `supabase db push`; confirm `202607030001` applied; `information_schema.columns` shows `missions.(scene_premise,conversation_mode)` + `attempt_turns.(coco_line,moderation_event)` |
| FERPA/COPPA moderation data-use posture decision | CHAT-05 | Compliance/policy judgment (option-a vs option-b), not testable code | 11-02 decision checkpoint: choose posture; executor records it in `11-MODERATION-DATA-USE.md` BEFORE any transcript is routed through moderation |
| Student UI: premise card + thinking indicator + dynamic playback + unchanged preset flow | SCENE-01, CHAT-02 | Visual/interaction correctness on a running app | 11-04 checkpoint: `npm run dev`, open a chat-mode mission; confirm unvoiced premise card, "Coco is thinking…" spinner, replayable dynamic line, no "continue?" past required turns, preset flow identical |
| Teacher authoring: default-off toggle, 3-8 field, premise auto-fill + manual generate, zero-turn chat save + assign | SCENE-01, CHAT-01 | End-to-end form + persistence + assignment behavior across screens | 11-05 checkpoint: `npm run dev`, Create Mission; verify toggle default-off, conditional 3-8 field w/ "Choose between 3 and 8 turns." error, AI-draft premise auto-fill, manual "Generate premise", zero-turn chat save, successful assignment |
| Teacher evidence: header chip+premise, Coco-said row, pattern badge (never red), moderation flag; unchanged preset review | CHAT-06, SCENE-01 | Visual review of a real chat transcript vs. an unchanged preset transcript | 11-06 checkpoint: complete a chat mission incl. one fallback turn; open evidence; confirm chip/premise, Coco-said row, green/neutral badge, collapsible "safety check" flag with correct copy; preset attempt unchanged |
| CHAT-04 on-pattern-ness across turns (drift check) | CHAT-04 | Automated tests prove plumbing, not whether real generated conversations stay on-pattern | 11-07: score ≥2 real transcripts against the rubric; human confirms every Coco turn steers to the target pattern with no drift after turns 2-3 |
| CHAT-05 moderation-in-practice (fallback reads as normal Coco reply) | CHAT-05 | Requires a human to judge that fallback/flagged turns read safely and never expose moderation/error language to a child | 11-07: include ≥1 flagged-input and ≥1 output-fallback transcript; human confirms the line reads as an ordinary Coco reply (Pitfall 5) |
| CHAT-02 personality / shares-first, consistent tone | CHAT-02 | Subjective tone/personality judgment | 11-07: human confirms Coco shares first each opening turn and keeps a consistent friendly (non-interrogation) tone |
| CHAT-03 hard-cap + wind-down empirically (in practice) | CHAT-03 | Automated test proves the gate refuses turnOrder>8; a real transcript must show the conversation forcibly ending at turn 8 with an observable wind-down and credit still firing at required_turns | 11-07 blocking-human checkpoint (NOT auto-approvable): transcript reaches turn 8, wind-down nudge visible approaching cap, completion credit fires at required_turns |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a manual/Wave 0 dependency (every code-producing task has an automated command; manual-only tasks are enumerated above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest manual-only run is the 11-07 UAT deliverable (Tasks 1 & 2 have doc-grep automated gates; only the final sign-off is purely human), and every other checkpoint is immediately preceded by automated (grep/typecheck/vitest) tasks in the same plan
- [x] Wave 0 covers all MISSING references — the single blocking infrastructure gap (`vitest.config.ts` include broadening) is documented; all other test files are created RED-first by their own `tdd="true"` tasks
- [x] No watch-mode flags — all gates use `npx vitest run` / `npm run typecheck` / `npm run lint`; the bare `npm test` (watch) is explicitly excluded from gating
- [x] Feedback latency < ~10s (targeted file <1s, full suite ~4s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-03
