# Project Research Summary

**Project:** Coco English — v2.0 "Coco Comes Alive"
**Domain:** Character-driven AI speaking-practice UX (TTS voice, pronunciation scoring, VN-style 2D mascot, bounded conversational AI) layered onto a shipped Next.js/Supabase/OpenAI ESL homework app
**Researched:** 2026-07-01
**Confidence:** MEDIUM (architecture over the existing codebase is HIGH — verified by reading source; vendor/feature/pitfall findings are MEDIUM — cross-checked web sources, no HIGH-tier curated source for this niche vendor-comparison space)

## Executive Summary

Coco English v1.0 shipped a validated, transcript-first, teacher-verifiable speaking-homework loop. v2.0 "Coco Comes Alive" layers five independently-shippable point releases on top of that loop — voice (v2.1), pronunciation scoring (v2.2), a 2D VN-style mascot (v2.3), bounded dynamic conversation ("Coco Chat," v2.4), and a UI overhaul (v2.5) — without touching the core assignment/attempt/status machinery that v1 already validated. All four research streams converge on the same posture: **reuse existing infrastructure aggressively, add new external AI vendors narrowly and cheaply, and treat every new capability as additive to the existing schema and review surface, not a parallel system.**

The recommended approach is: default to OpenAI's existing `gpt-4o-mini-tts` (same SDK, same vendor, near-zero incremental cost) for Coco's voice, reserving ElevenLabs strictly for the optional cloned-teacher-voice variant; use Azure AI Speech Pronunciation Assessment rather than SpeechAce (whose $40/mo floor alone exceeds the ~$30/mo total AI budget); build a lightweight amplitude-driven (not full-viseme) 2D mascot on Rive or even static sprite-swaps; and implement Coco Chat as a `conversation_mode` variant of the existing `attempts`/`attempt_turns` tables rather than a new chat schema. Every new feature is additive: two new tables (`tts_audio_cache`, `pronunciation_scores`), three new columns (`missions.conversation_mode`, `missions.scene_premise`, `attempt_turns.coco_line`), two new public Storage buckets, and no changes anywhere to the server-owned status/audit machinery that Phases 1–7 already validated.

The dominant risk is not technical feasibility but **discipline under a tight budget and a bounded-safety surface**: uncached TTS calls, unvalidated pronunciation thresholds, mascot asset scope creep, and — most critically — Coco Chat's dynamic LLM-generated turns drifting off the target grammar pattern, breaking teacher-verifiability, or reaching a child with unmoderated content. Every one of these has a well-understood, cheap-to-build-in-from-day-one mitigation (content-hash caching, banded/qualitative scores, a fixed 3-4 state mascot, and a server-enforced turn cap plus per-turn re-grounding and moderation checks) — the risk is only realized if a release ships without these guardrails baked into its first cut. A secondary but real risk is compliance: 2025 COPPA rules now cover children's voiceprints, and each new AI vendor touching student audio (TTS if ever used on student input, pronunciation scoring always) needs a documented data-use check before launch, not retroactively.

## Key Findings

### Recommended Stack

The existing Next.js 15 (App Router)/Supabase/OpenAI/Playwright stack from v1.0 is unchanged and out of scope for new research — this file covers only new v2.0 additions. All new server-side AI calls should live in Node.js route handlers (not Edge), mirroring the existing `transcription.ts`/`turn-evaluator.ts` pattern exactly, since streaming works fine on Node and Edge adds SDK-compatibility risk for no measurable latency win at 6-student scale.

**Core technologies:**
- **OpenAI `gpt-4o-mini-tts`** (existing `openai@6.45.0` SDK, no new install) — default Coco voice for v2.1; ~$0.015/min, zero new vendor relationship, streaming-capable.
- **ElevenLabs (`@elevenlabs/elevenlabs-js@2.55.0`)** — scoped *narrowly* to the optional cloned-teacher-voice variant only; the only realistic option for voice cloning, but adding it as the default voice for all TTS would double vendor cost/surface for no proportionate benefit.
- **Azure AI Speech — Pronunciation Assessment** (REST or `microsoft-cognitiveservices-speech-sdk`) — v2.2 scoring; free tier covers ~5 audio-hours/month, keeping this near-$0/mo at 6-student scale. SpeechAce is explicitly ruled out as default (flat $40/mo exceeds the entire budget) but remains a fallback if Azure's accuracy on child/non-native speech proves inadequate post-launch.
- **Rive (`@rive-app/react-canvas` + `@rive-app/canvas`)** — v2.3 mascot rendering; lighter authoring pipeline than Live2D for a solo-dev/tiny-budget project. Static sprite-swap PNGs are an explicitly acceptable v0 if even Rive's overhead is too much for a fast first cut.
- **No new library for v2.4/v2.5** — dynamic turns reuse the existing OpenAI Responses API/structured-output pattern already proven in `turn-evaluator.ts`; the UI overhaul reuses existing Tailwind + shadcn/ui.

### Expected Features

**Must have (table stakes) per release:**
- v2.1: TTS auto-plays on every Coco line; tap-to-replay reusing cached audio; one default stock voice sufficient to launch (cloned voice deferred to "add after validation").
- v2.2: Word-level score computed from *existing* stored v1 audio (no new capture); banded/qualitative feedback to students (never a raw number); word-level detail surfaced additively in the existing teacher review screen.
- v2.3: Static art (waist-up, one background), 3 functional states (idle/speaking/one reaction), dialogue box reusing existing mission-flow typography.
- v2.4: Scene premise generated from target pattern; Coco opens the exchange; hard server-enforced ~5-turn cap with wrap-up nudge; full transcript capture of dynamic turns, teacher-reviewable identically to guided turns.
- v2.5: last, visual-only — no new schema/services.

**Should have (differentiators):** cloned teacher voice (P2, optional toggle); per-mission scene premise generated per-mission from teacher-input target English (the actual novel v2.4 mechanic vs. competitors' canned scenario libraries); word-level pronunciation detail surfaced to the *teacher* as a diagnostic tool (not just the student); Coco's stable recognizable personality across missions (already decided via `characterId` in v1).

**Explicitly anti-features (ruled out, cross-cutting risk if built):** raw numeric scores shown to kids; heart/life-loss or streak-break mechanics; full phoneme-viseme lip-sync; open-ended free chat with no turn limit; cross-mission story-arc/memory continuity; romance/relationship mechanics; large expression/pose libraries; real-time speech-to-speech (Realtime-API-style) pipelines; strict pass/fail gating on pronunciation score.

### Architecture Approach

The existing system (verified by reading source, not inferred) is a clean layered Next.js/Supabase app with a hard invariant set: server-owned, audited status transitions (`assertTransitionRequest` + `assignment_status_events`); a server-only adapter boundary for all AI/Storage credentials; `attempt_turns` as a fixed-slot `(attempt_id, turn_order)` upsert table; a first-class, already-replaceable `characterId` seam; per-turn private-bucket signed-URL audio; and a single transcript-first teacher-evidence assembly function (`getAttemptEvidenceForTeacher`). Every v2.0 feature is designed to extend these seams, not replace them.

**Major components (new):**
1. `/api/tts` route + `tts-generator.ts` + `tts-cache.ts` (v2.1) — content-hash cache lookup before any provider call; new `tts_audio_cache` table and a new **public**, immutable-cacheable `tts-audio` Storage bucket (deliberately different sensitivity class than `student-audio` since synthesized Coco audio contains no student PII).
2. `/api/pronunciation-score` + `pronunciation-scorer.ts` (v2.2) — new dedicated `pronunciation_scores` table (one row per `audio_clip_id`, NOT bolted onto `attempt_turns.evaluation` jsonb, since it's a separate provider/lifecycle/failure-mode concern), joined additively into the existing evidence view; fire-and-forget/best-effort so a scoring outage never blocks completion.
3. `MascotStage` (v2.3) — new client component, amplitude-driven (Web Audio `AnalyserNode` on the existing `<audio>` element) 5-state machine (idle/talking/happy/encouraging/thinking); zero new server/schema footprint; new public `mascot-assets` bucket keyed `{characterId}/{expression}.webp` for future multi-character extensibility.
4. `chat-turn-generator.ts` + `scene-generator.ts` (v2.4) — new `missions.conversation_mode` enum (`'guided' | 'chat'`, additive, default preserves all v1 behavior), new `attempt_turns.coco_line` and `missions.scene_premise` columns; conversation state is derived from `attempt_turns` on each request (Postgres as the state store — no new session/Redis infrastructure); turn bounding is server-enforced against `missions.required_turns`, mirroring the existing status-machine pattern.
5. UI overhaul (v2.5) — visual pass only; explicitly gated on re-running all prior-phase UAT scripts, not a fresh visual review alone.

### Critical Pitfalls

1. **TTS cost blowup from uncached regeneration** — must ship v2.1 with content-hash caching from day one (`sha256(text+characterId+voiceId+provider+format)`); retrofitting after a cost incident is far more expensive. Pre-synthesize/permanently cache static template lines at authoring time.
2. **Pronunciation scoring penalizes normal child/non-native speech as "wrong"** — vendor scores are trained mostly on adult/native speech; must spot-check the chosen vendor (Azure) against this app's own 6 students' real v1-stored audio before setting thresholds, and never show a raw number to a child (banded/qualitative only, wide non-penalizing pass band).
3. **Coco Chat drifts off the target grammar pattern** — system-prompt-only control degrades measurably with turn count; must re-inject target pattern/scene context every turn (not rely on conversation history alone), validate each reply against the target pattern before sending, and hard-cap turns structurally.
4. **Coco Chat breaks teacher-verifiability** — natural/dynamic dialogue is harder to fast-scan than v1's fixed guided turns; must visually tag where the target pattern appears in the transcript and keep personality turns visually distinct from practice turns, gated on the same "teacher scans in under N seconds" bar Phase 7 already established.
5. **Unsafe/off-topic content reaching a child + unbounded turns/cost** — a kid-safe system prompt alone is insufficient; every Coco Chat reply needs a moderation-endpoint check before playback, and the ~5-turn cap must be server-enforced (not client-trusted), paired with basic per-conversation cost tracking/circuit-breaker given the tight $30/mo budget.
6. **Mascot scope creep and low-end device failure** — ship v2.3 with a fixed 3-4 state set (no per-scene backgrounds, no second character) decided before art production starts; test explicitly on a low-end tablet/Chromebook with a static-fallback path, since dev-machine testing alone hides this failure mode.
7. **New-vendor compliance gaps** — 2025 COPPA rules cover children's voiceprints; each new vendor touching student audio (pronunciation scoring always, TTS if ever used on student input) needs a lightweight documented data-use/retention check (and explicit opt-out of default "train on our data" vendor settings) before launch, plus a FERPA-style data-use note per vendor even for a single-teacher pilot.

## Implications for Roadmap

Based on research, suggested phase structure follows the dependency-aware order already specified in PROJECT.md, with each release scoped tightly around its own P1 launch-with list and explicit pitfall guardrails baked in from the first cut (not deferred to a follow-up fix).

### Phase 1: v2.1 Coco Voice (TTS)
**Rationale:** Zero new schema dependencies on anything else in v2.0; lightest-weight release; unlocks the "speaking-state" signal every later mascot/chat feature needs.
**Delivers:** `/api/tts` route (Node runtime), `tts-generator.ts` adapter (OpenAI `gpt-4o-mini-tts` default; ElevenLabs scoped to optional cloned-teacher-voice), `tts_audio_cache` table + public `tts-audio` bucket, TTS auto-play + tap-to-replay wired into `MissionFlowShell`.
**Addresses:** FEATURES.md table-stakes "TTS plays automatically," "replay reuses cached audio"; differentiator "cloned teacher voice" (P2, add-after-validation).
**Avoids:** Pitfall 1 (uncached TTS cost blowup — cache-first is a hard requirement, not optional); Pitfall 2 (voice-cloning consent gap — written consent required before the cloned-voice option ships, or ship v2.1 with stock voice only and defer cloning).

### Phase 2: v2.2 Pronunciation Scoring
**Rationale:** No dependency on v2.1 (reuses v1-stored audio directly); can run in parallel with or immediately after v2.1 without blocking either.
**Delivers:** New `pronunciation_scores` table + `pronunciation_score_status` enum, `/api/pronunciation-score` route, `pronunciation-scorer.ts` adapter (Azure Speech Assessment default), banded/qualitative student-facing feedback UI, additive word-level badge in existing teacher review (`AttemptTurnEvidence` extension).
**Uses:** Azure AI Speech Pronunciation Assessment (STACK.md); reuses v1's stored `audio_clips` + target sentences (no new capture).
**Implements:** Dedicated-table pattern (not bolted onto `attempt_turns.evaluation` jsonb) per ARCHITECTURE.md Anti-Pattern 1.
**Avoids:** Pitfall 3 (score over-penalizes child/non-native speech — validate against this app's real 6 students' audio before setting thresholds); Pitfall 4 (discouraging test-like UX — banded feedback only, never raw numbers to students).

### Phase 3: v2.3 Mascot (VN-style)
**Rationale:** Depends on v2.1 (needs a real audio-playback signal to drive the "speaking" state) — must ship after voice, per both FEATURES.md and ARCHITECTURE.md dependency analysis.
**Delivers:** `MascotStage` client component, `mascot-assets` public bucket, amplitude-driven (`AnalyserNode`) 3-state machine (idle/talking/one reaction) wired to the v2.1 `<audio>` element, `CharacterProfile` extension (`voiceId`, `spriteSetId`, expression mapping).
**Uses:** Rive (`@rive-app/react-canvas`) or static sprite-swap as an acceptable v0; zero new server/schema footprint.
**Implements:** `MascotStage` component per ARCHITECTURE.md target-state diagram.
**Avoids:** Pitfall 5 (asset scope creep — fix the 3-4 state set before any art is commissioned); Pitfall 6 (uncanny/inconsistent art style — lock one style guide, pilot with the teacher first); Pitfall 7 (low-end device failure — test explicitly on a low-end tablet/Chromebook, ship a static fallback); Pitfall 8 (animation/audio desync — bind mouth state to real `<audio>` playback events, never a fixed timer).

### Phase 4: v2.4 Dynamic Turns + Scene Framing ("Coco Chat")
**Rationale:** Depends on both v2.1 (voice) and v2.3 (mascot presence) for the full "scene" experience; highest schema/product/safety risk in the milestone, so it benefits from voice+mascot already being stable in production — sequence last among functional features.
**Delivers:** `missions.conversation_mode` enum column (additive, default `'guided'` preserves all v1 behavior unchanged), `missions.scene_premise` + `attempt_turns.coco_line` columns, `scene-generator.ts` (extends existing mission-draft flow) + `chat-turn-generator.ts` (extends existing Responses-API structured-output pattern), new chat-mode branch in the mission flow shell, hard server-enforced ~5-turn cap.
**Addresses:** FEATURES.md P1 items — scene premise generation, Coco-opens-first, server-enforced turn cap with wrap-up nudge, full teacher-reviewable transcript of dynamic turns.
**Avoids:** Pitfall 9 (grammar-pattern drift — per-turn re-grounding, not system-prompt-only); Pitfall 10 (breaks teacher-verifiability — target-pattern markup in transcript UI); Pitfall 11 (unsafe content — moderation check on every reply before playback); Pitfall 12 (unbounded turns/runaway cost — server-owned cap, not client-trusted); Pitfall 13 (scene premise doesn't cue the target pattern — validate premises against a checklist during UAT).

### Phase 5: v2.5 UI Overhaul
**Rationale:** Explicitly ordered last per PROJECT.md so layout isn't redone mid-stream once voice/scoring/mascot/chat have all landed; visual-only, no new services or schema.
**Delivers:** One cohesive visual/design pass across all v1+v2.0 screens.
**Avoids:** Pitfall 16 (silent functional regression to the core homework loop) — must explicitly gate release on re-running the full set of prior-phase UAT scripts (login, roster, assignment, completion, review, status transitions), not just a fresh aesthetic review.

### Phase Ordering Rationale

- **Dependency chain drives order:** v2.1 → v2.2 (independent of v2.1, can be parallel/either-order) → v2.3 (needs v2.1's audio signal) → v2.4 (needs v2.1 + v2.3) → v2.5 (needs all). This matches PROJECT.md's explicit "lightest → heaviest" release ordering and is corroborated independently by both FEATURES.md and ARCHITECTURE.md dependency analysis.
- **Schema strategy is additive throughout:** every new table/column/enum/bucket is additive-only; no existing v1 table, enum, or status-transition path is modified. This lets each release ship and verify in production independently, per PROJECT.md's "each release verified before the next begins" constraint, without any release risking regression to the validated v1 core.
- **Risk is front-loaded intentionally into v2.4:** all three research files independently flag Coco Chat as the highest-risk release (schema fit, grammar drift, safety, cost). Sequencing it fourth (after voice and mascot are stable) rather than earlier reduces the number of moving, unvalidated parts at the point this risk is taken on.

### Research Flags

Needs deeper research during phase planning:
- **Phase 4 (v2.4 Coco Chat):** highest-risk release — needs deeper research/prototyping on (a) per-turn re-grounding prompt design to prevent drift, (b) moderation-endpoint integration pattern, (c) UI pattern for target-pattern transcript markup. Recommend `/gsd-plan-phase --research-phase 4`.
- **Phase 2 (v2.2 Pronunciation):** needs a validation research pass specifically against Azure's accuracy on this app's own 6 students' real stored audio before finalizing scoring thresholds — this is empirical validation, not literature research, but should be explicitly scheduled as a phase task.
- **Phase 3 (v2.3 Mascot):** needs a lightweight research/decision spike on Rive vs. static-sprite-swap v0 tradeoff before committing to an authoring pipeline.

Phases with standard, well-documented patterns (research-phase likely unnecessary):
- **Phase 1 (v2.1 TTS):** OpenAI TTS integration is a direct extension of the existing, already-proven `openai` SDK server-adapter pattern (`transcription.ts`/`turn-evaluator.ts`) — low novelty.
- **Phase 5 (v2.5 UI overhaul):** visual-only, no new integration surface; the main risk is regression-testing discipline, not unknown-unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Vendor pricing/capability claims (OpenAI TTS, ElevenLabs, Azure, SpeechAce, Rive, Live2D) are from official docs/pricing pages, cross-checked where possible, but no HIGH-tier curated source exists for this specific niche vendor-comparison question. |
| Features | MEDIUM | Cross-checked across multiple competitor products (Duolingo, ELSA, Speechace, Univerbal/Talkpal) and one arXiv gamification-misuse paper; solid triangulation but no single authoritative source. |
| Architecture | MEDIUM-HIGH | Existing-system facts are HIGH confidence (verified by directly reading the codebase: migrations, `src/server/*`, `src/domain/character/profile.ts`, `package.json`); new-integration patterns (TTS caching, Rive/AnalyserNode wiring, Azure/SpeechAce REST shape) are MEDIUM — vendor docs and web search, not yet prototyped in this codebase. |
| Pitfalls | MEDIUM | Corroborated across 3-10 independent web sources per pitfall, including some peer-reviewed/academic sources (LLM conversational drift, uncanny valley, GenAI instructional design), but nothing has been validated yet against this app's actual 6 students — several pitfalls explicitly require that validation as part of their own prevention step. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Pronunciation-scoring accuracy for this app's specific students:** no vendor claim (Azure or SpeechAce) has been validated against real recordings from Coco English's 6 elementary Korean/general ESL students. Address during Phase 2 planning/execution as an explicit validation task using already-stored v1 audio, before finalizing score-band thresholds.
- **Rive vs. static-sprite-swap decision for v2.3:** research surfaces both as reasonable, with static sprites as an explicit "ship fast" v0 option. Address as a lightweight spike at the start of Phase 3 planning rather than deciding definitively now.
- **ElevenLabs voice-cloning consent process:** no consent-document template exists yet; needs to be drafted (written, specific, informed, revocable) before the optional cloned-teacher-voice feature in v2.1 ships, or that sub-feature should be explicitly deferred out of the v2.1 launch-with list.
- **Per-new-vendor compliance documentation:** no lightweight data-use/retention/consent checklist exists yet for TTS or pronunciation-scoring vendors. Recommend creating a one-page-per-vendor template during Phase 1 planning and reusing it for every new AI vendor introduced across v2.1/v2.2.
- **Coco Chat drift/safety validation:** no test transcripts exist yet to confirm per-turn re-grounding and moderation actually prevent drift/unsafe content in practice for this specific prompt design — this needs to be a concrete UAT/manual-review deliverable within Phase 4, not just an architectural intention.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `supabase/migrations/202606250001_foundation_schema.sql`, `supabase/migrations/202606270001_student_audio_storage.sql`, `src/server/student-access/mission-flow.ts`, `src/server/teacher/audio-evidence.ts`, `src/server/audio/transcription.ts`, `src/server/ai/turn-evaluator.ts`, `src/domain/character/profile.ts`, `package.json`
- `.planning/PROJECT.md` — v2.0 milestone scope, constraints, prior validated decisions

### Secondary (MEDIUM confidence)
- OpenAI `gpt-4o-mini-tts` model/pricing docs; ElevenLabs docs/pricing/streaming-latency pages
- Azure AI Speech pronunciation-assessment docs and pricing; SpeechAce API plans/pricing; ELSA API overview
- Rive React runtime/state-machine docs; Live2D Cubism SDK license terms
- Duolingo engineering blog series (character voices, viseme lip-sync, Video Call with Lily/Rive integration)
- TTS content-hash caching pattern (cross-referenced across independent sources: pipecat-ai GitHub issue, Jovo TTS S3 cache)
- Voice-cloning law/ethics coverage (Duquesne Law, National Security Law Firm, Skadden Arps)
- COPPA 2025 rule update and FERPA/AI-vendor-DPA coverage (Recording Law, FAS.org, SchoolAI, Secure Privacy blog)
- LLM conversational drift research (arXiv 2404.03820 "CantTalkAboutThis", arXiv 2409.04987 EFL-chatbot paper)
- Uncanny valley design research (ACM Interactions, ResearchGate) — MEDIUM-HIGH, peer-reviewed
- ASR bias/accuracy research on child/non-native speech (The Learning Agency, arXiv 2306.16710, arXiv 2312.15499) — MEDIUM-HIGH, academic

### Tertiary (LOW confidence)
- Community lip-sync/AudioWorklet projects (illustrative pattern only, not production-validated)
- Practitioner blogs on Lottie/Rive animation performance and VN scope-creep (community/indie-dev sources)

---
*Research completed: 2026-07-01*
*Ready for roadmap: yes*
