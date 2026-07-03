# Phase 11: Coco Chat (dynamic turns + scene framing) - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 delivers v2.4 Coco Chat: every new mission gets a lightweight scene premise generated from its target pattern (`missions.scene_premise`), and a mission can opt into a dynamic conversation mode (`missions.conversation_mode`) where Coco responds naturally and contextually to the student — anchored to the target grammar pattern by architectural guardrails, bounded by a server-enforced hard turn cap, with every Coco output (and every student input) moderated before use, and the full exchange persisted (`attempt_turns.coco_line`) and teacher-reviewable in the existing transcript-first review UI.

Out of scope: open-ended free chat (explicit anti-feature), branching storylines or cross-mission arcs (separate deferred VN product), any change to the v1 server-owned status/audit core, mascot visuals (Phase 10), and the cohesive visual pass (Phase 12). Requirements: SCENE-01, CHAT-01 through CHAT-06.

Note: ROADMAP lists Phase 10 (mascot) as a dependency for the full "scene" experience; none of the decisions below require the mascot to exist.

</domain>

<decisions>
## Implementation Decisions

### Dynamic-Turn Loop Shape
- **D-01:** Conversation mode keeps the **full v1 correction loop on every turn**: each student reply is evaluated; when it needs work, the improved sentence is shown and the repeat is required before Coco's next dynamic reply. The conversation pauses for correction, then resumes. Reuses the existing `repeat_accepted` completion rules, audio evidence, and review machinery unchanged.
- **D-02:** The teacher sets `required_turns` per chat mission (**range 3–8, default 5**) — this is the completion target; homework credit is earned there. The existing progress bar and completion logic keep working off `required_turns`.
- **D-03:** The **server owns a fixed hard cap of 8 turns**. It is not a teacher setting and not client-enforced; the server refuses to generate dynamic turns beyond 8 no matter what the client, student, or LLM does (CHAT-03).
- **D-04:** Between `required_turns` and the cap, the **student can simply keep chatting** — no "continue?" prompt or extra UI. The conversation carries on naturally if the student keeps talking.
- **D-05:** As the turn count approaches the cap, the server injects **wind-down steering** into Coco's prompt (the "wrap it up" nudge); at the cap Coco delivers a closing line and the conversation ends. Completion credit is unaffected by whether the student extended.

### Teacher Controls & Scene Premise
- **D-06:** `conversation_mode` is a **teacher toggle on the mission create/edit form, default off**. Preset-turn missions remain the default behavior; chat missions are a deliberate opt-in while the feature is new.
- **D-07:** The scene premise is **auto-generated as part of the AI mission draft** (from the target pattern, via the existing mission-generator flow) and appears as **one more teacher-editable field** on the mission form — the established Phase 6 draft-then-edit pattern. Manually-created missions get a "generate premise" action that fills the same editable field.
- **D-08:** **All new missions get a scene premise — both chat and preset missions** (SCENE-01 framing applies mission-wide). **No backfill** for pre-existing missions: the student flow skips the scene framing when `scene_premise` is null (forward-only, Phase 9 D-08 precedent).
- **D-09:** The student encounters the premise as **scene-setting text at mission start** (on the mission card / above turn 1). It is **not voiced by Coco** and there is no new spoken intro step.

### Moderation & Failure Handling
- **D-10:** When a generated Coco line fails moderation: **regenerate once with stronger safety steering; if the retry also fails, substitute a safe canned Coco line** that keeps the conversation moving. The student never sees an error, homework is never blocked (Phase 8 degrade-gracefully philosophy), and the turn is flagged for teacher review.
- **D-11:** **Student input is also moderated** before it is sent to the LLM: flagged input gets a gentle canned redirect from Coco **without an LLM call**. The extra moderation API call per turn is accepted.
- **D-12:** While Coco's reply is being generated + moderated (+ TTS fetched), the student sees a **character-flavored "Coco is thinking…" indicator** in the speech card (later hostable by the Phase 10 mascot's idle state). No hard timeout budget was locked — latency handling details are Claude's discretion.
- **D-13:** **Provider/generation failures (API error, timeout) reuse the exact same canned-line fallback path** as moderation failures — one shared degrade path to build and test. The turn still counts and the event is logged.

### Teacher Transcript View
- **D-14:** The target pattern is made visually identifiable via a **pattern chip in the evidence-page header plus a small per-turn "pattern used ✓ / not yet" badge** driven by the existing AI evaluation. The transcript text itself stays clean — **no inline highlighting** (consistent with Phase 9 D-05's keep-the-transcript-clean rule).
- **D-15:** Coco's persisted dynamic line (`attempt_turns.coco_line`) renders as a **labeled row at the top of each existing per-turn block** on the evidence page. Purely additive — no new layout; preset and chat missions review identically. (A chat-bubble conversation view was considered and rejected as Phase 12 territory.)
- **D-16:** Moderation/fallback interventions (retried line, canned fallback, flagged student input) surface as a **small collapsed flag on the affected turn block**; expanding explains what happened. Matches the Phase 9 collapsed-diagnostic-panel pattern.
- **D-17:** The **scene premise appears as a short line in the evidence-page header** next to the target-pattern chip, so the teacher reads the transcript with the same framing the student had (available from the mission snapshot).

### Claude's Discretion
- Exact system-prompt / per-turn re-grounding architecture for keeping Coco on-pattern (CHAT-04) — the roadmap research flag covers this; decisions above constrain behavior, not prompt design.
- Moderation provider/endpoint choice and integration pattern (e.g., OpenAI moderation endpoint) — flagged for research; must satisfy D-10/D-11 behavior.
- Exact latency budget/timeout handling behind the "Coco is thinking…" state (D-12).
- Canned fallback/redirect line copy — must keep the no-harsh-failure, classroom-safe Coco tone.
- Wind-down steering mechanics (which turn the nudge starts, prompt shape) within D-05's behavior.
- Whether/how dynamic Coco lines interact with the Phase 8 TTS cache (unique lines will rarely cache-hit; cost is acceptable at 6-student scale) and TTS invocation timing.
- Schema details beyond the locked column names (`missions.scene_premise`, `missions.conversation_mode`, `attempt_turns.coco_line`), migration shape, and where flagged-turn metadata is stored — all schema changes must be additive per the milestone rule.
- Turn-count enforcement implementation (where the server counts, how it refuses turn 9).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Source Of Truth
- `.planning/ROADMAP.md` — Phase 11 goal, dependencies (Phase 8 voice, Phase 10 mascot), requirements (SCENE-01, CHAT-01–06), success criteria, and the explicit research flag: highest-risk release; needs deep research on (a) per-turn re-grounding prompt design, (b) moderation-endpoint integration pattern, (c) target-pattern transcript markup UI, plus a concrete UAT/manual-review deliverable confirming drift/safety guardrails hold in practice.
- `.planning/REQUIREMENTS.md` — Requirement definitions for SCENE-01 and CHAT-01 through CHAT-06; "Out of Scope" list (open-ended free chat is an explicit anti-feature).
- `.planning/PROJECT.md` — "VN feel, homework substance" thesis, no-harsh-failure correction style, guided-not-open-ended AI behavior constraint, 2–3 minute mission length.
- `.planning/STATE.md` — Accumulated cross-phase decisions (server-owned status transitions, adapter/fake-client test pattern, transcript-first review).

### Prior Phase Contracts
- `.planning/phases/06-ai-mission-and-turn-intelligence/06-CONTEXT.md` — Existing AI evaluation pipeline, mission draft-then-edit pattern (D-07 builds on it), server-only adapter + fake-client testing rules.
- `.planning/phases/08-coco-voice-tts/08-CONTEXT.md` — Which lines Coco voices, TTS degrade-to-text rule, replay UX; dynamic Coco lines inherit these voice rules.
- `.planning/phases/09-pronunciation-scoring/09-CONTEXT.md` — Collapsed/additive teacher diagnostic panel pattern (D-16 follows it) and the keep-the-transcript-clean rule (D-14).
- `.planning/phases/07-teacher-review-and-pilot-readiness/07-CONTEXT.md` — Evidence page structure, server-owned audited status transitions, review dashboard navigation.
- `.planning/phases/04-guided-student-attempt-loop/04-CONTEXT.md` — Student attempt loop, completion rules (`repeat_accepted`), hint rollup, resume behavior that D-01/D-02 reuse.

### Key Existing Code (verified during scout)
- `supabase/migrations/202606250001_foundation_schema.sql` — `missions` (target_pattern, required_turns, character_id), `mission_turn_templates` (preset prompt/target_example/hint_ladder — the assumption dynamic mode breaks), `attempt_turns` (where `coco_line` is added), `assignments.mission_snapshot`.
- `src/components/student/MissionFlowShell.tsx` — one-step-at-a-time student mission state machine; dynamic mode integrates here without converting the flow into open chat.
- `src/server/student-access/mission-flow.ts` — server-owned turn recording/completion service (AI-06: imports no AI client); turn-cap enforcement and coco_line persistence connect here or alongside.
- `src/server/ai/turn-evaluator.ts` — existing per-turn evaluation adapter (injectable fake client pattern); the "pattern used" badge (D-14) draws from its output.
- `src/server/ai/mission-generator.ts` — mission draft generation; scene-premise generation extends this (D-07).
- `src/app/teacher/evidence/[attemptId]/page.tsx` — evidence page; host for D-14–D-17 additions.
- `src/components/student/CocoSpeechAudio.tsx` + Phase 8 TTS server path — playback path for voiced dynamic Coco lines.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MissionFlowShell.tsx` step machine + existing Step components: conversation mode is a variation of the same one-step flow (Coco line → student answer → evaluation/repeat → next), not a new chat UI.
- `turn-evaluator.ts` evaluation results: already produce target-pattern attempted/meaning signals — source for the per-turn pattern badge (D-14) and for grounding Coco's next reply.
- Phase 8 TTS adapter + `CocoSpeechAudio`: dynamic Coco lines get voiced through the same path; cache will rarely hit for unique lines (accepted at this scale).
- `assignments.mission_snapshot`: premise + conversation_mode must be captured in the snapshot at assign time so attempts are reproducible and the evidence header (D-17) can read them.
- Phase 9's collapsed diagnostic panel and Phase 5/7 additive-evidence patterns: direct templates for the moderation flag (D-16) and Coco-line row (D-15).

### Established Patterns
- Server-only AI adapters with injected fake clients — no paid API calls in automated tests; conversation generation and moderation adapters must follow this.
- `mission-flow.ts` imports no AI client (AI-06 structural boundary) — dynamic-turn generation must live in the AI layer with the flow service orchestrating, preserving the boundary.
- Server-owned, audited state: turn counting and the hard cap are server-enforced; the client never decides when the conversation ends.
- No-harsh-failure tone in all student-facing copy, including canned fallback lines.
- All v2.0 schema changes are additive; the v1 status/audit core is untouched.

### Integration Points
- Additive migration: `missions.scene_premise`, `missions.conversation_mode`, `attempt_turns.coco_line` (+ wherever moderation-flag metadata lands).
- Mission create/edit form: conversation-mode toggle (D-06), editable premise field + generate action (D-07).
- Mission assign path: premise/mode into `mission_snapshot`.
- Student flow: scene-premise text at mission start (D-09), dynamic Coco reply step with "thinking" state (D-12), turn-cap/wind-down behavior (D-03–D-05).
- New server AI surface: conversation-reply generator with per-turn re-grounding + moderation wrapper (input and output) + canned-fallback library.
- Teacher evidence page: header premise + pattern chip, per-turn badge, Coco-line row, collapsed moderation flag (D-14–D-17).

</code_context>

<specifics>
## Specific Ideas

- The user questioned the fixed "~5 turns" and chose teacher control: the requirement's substance is "a server-enforced hard ceiling exists and is small," not the digit 5 — hence teacher-set `required_turns` 3–8 (default 5) with a fixed server ceiling of 8.
- Extension should feel organic: the student "can keep chatting" with no explicit continue prompt; Coco winding down is the only signal the end is near.
- Fallback lines should keep the conversation moving (e.g., "That's interesting! Tell me more about…"), never read as an error.
- The evidence page should let preset and chat missions review identically — chat is additive rows/flags on the same blocks, not a new review mode.

</specifics>

<deferred>
## Deferred Ideas

- Chat-style conversation view (speaker bubbles) for the evidence page — considered for D-15, deliberately deferred to Phase 12's cohesive visual pass.
- Voiced Coco scene intro step — considered for D-09; user chose unvoiced text. Revisit in Phase 12 if the scene experience feels flat.

</deferred>

---

*Phase: 11-coco-chat-dynamic-turns-scene-framing*
*Context gathered: 2026-07-03*
