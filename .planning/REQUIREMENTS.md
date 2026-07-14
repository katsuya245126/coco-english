# Requirements — Milestone v2.0 "Coco Comes Alive"

**Milestone goal:** Transform Coco English from a functional homework form into an immersive, character-driven speaking experience — Coco speaks, appears on screen, converses naturally, and scores pronunciation — while keeping the teacher-linked homework loop and teacher-verifiability intact.

**Thesis:** "VN feel, homework substance." VN is atmosphere; free-talk practice stays the substance. Standalone VN product remains deferred. Each mission gets a lightweight scene premise generated from the target pattern.

**Shape:** Independently-shippable point releases (v2.1→v2.5), each verified in production before the next begins. All schema changes are additive — no changes to the v1 server-owned status/audit core.

**Pivot history (2026-07-08 → 2026-07-09):** Phase 10 was briefly reconsidered as a teacher-POV generated-media approach (MEDIA-*, real photos of the teacher instead of an illustrated mascot) — see `mascot-vs-media-handoff.md` for the shelved rationale. After hands-on testing with the media-gen pipeline (identity/likeness drift across multiple models, framing issues), the direction reverted back to the original illustrated mascot on 2026-07-09. **MASCOT-01..04 are back in active scope; MEDIA-01..05 and VOICE-05 (cloned voice) are retired.** Three of the four Phase 10 mascot plans were already executed on a parked branch (`phase-10-mascot-wip`, not yet merged to main) before the pivot paused work — see Phase 10 details in ROADMAP.md.

REQ-ID categories continue from v1 with new codes: VOICE, PRON, MASCOT, CHAT, SCENE, UIX, MEDIA.

---

## v2.0 Requirements

### VOICE — Coco Voice / TTS (point release v2.1)

- [x] **VOICE-01**: Student hears Coco's mission/prompt lines spoken aloud via text-to-speech, using the existing OpenAI TTS (`gpt-4o-mini-tts`) through the current OpenAI SDK.
- [x] **VOICE-02**: Student can tap to replay any spoken Coco line.
- [x] **VOICE-03**: Generated TTS audio is cached by content hash (text + character + voice + provider + format) so identical lines are not regenerated, controlling cost and latency.
- [x] **VOICE-04**: Voice playback works on available real devices using a standard HTML audio element without a streaming pipeline. Samsung S23 + Mac preview smoke tests passed 2026-07-02; Chromebook/older-tablet coverage was unavailable and accepted as residual risk for Phase 8 closeout.

### PRON — Pronunciation Scoring (point release v2.2)

- [x] **PRON-01**: The app scores a student's spoken turn against the target sentence using a pronunciation-assessment API, reusing the per-turn audio and target/improved sentences already captured in v1.
- [x] **PRON-02**: The vendor is **Azure AI Speech Pronunciation Assessment** (pay-per-second; free tier expected to cover the current 6-student/1-class-week volume at ~$0/mo). A documented FERPA/COPPA data-use understanding exists for this new vendor before student audio is sent.
- [ ] **PRON-03**: Scoring accuracy is validated against this app's own students' stored v1 audio before student-facing results are trusted (guard against over-penalizing young Korean/ESL non-native speech).
- [ ] **PRON-04**: Students see pronunciation feedback as encouraging qualitative bands/stars/color and word-level "what to fix" highlights — never a raw numeric score — preserving the app's balanced, no-harsh-failure correction style.
- [ ] **PRON-05**: Teacher review surfaces the per-word pronunciation breakdown as a diagnostic (additive to the existing transcript-first review UI), never displacing the transcript.
- [x] **PRON-06**: Pronunciation scores are stored in a dedicated `pronunciation_scores` table keyed on the audio clip, independent of the existing turn-evaluation data (different provider, independently re-scorable).

### MASCOT — VN-Style Mascot (point release v2.3)

- [x] **MASCOT-01**: Coco appears on screen as a 2D character (waist-up over a background scene) with a dialogue box, during the mission flow. *(Complete — human-verified 2026-07-11: mount persists, no layout shift.)*
- [x] **MASCOT-02**: Coco has a visible "speaking" state distinct from idle/listening, driven by the actual audio playback clock (Web Audio amplitude off the `<audio>` element), not a timer or full viseme lip-sync. *(Complete — human-verified 2026-07-11: animation tracks real audio, correct hysteresis.)*
- [x] **MASCOT-03**: Coco shows content-tied expression states (idle, speaking, happy/celebrating on a good attempt, encouraging/neutral on a miss) — a small fixed set of 3–5 states, reinforcing the no-harsh-failure principle. (P2, in scope.) *(Complete — human-verified 2026-07-11: expressions content-tied, never sad on a miss.)*
- [x] **MASCOT-04**: Mascot rendering performs acceptably on low-end school devices, with a fixed, small asset scope (guard against asset scope creep). *(Complete — degrade logic unit-tested and wired; real low-end device test accepted as residual risk 2026-07-11, no device available, per Phase 8 precedent.)*

### SCENE + CHAT — Dynamic Turns & Scene Framing / "Coco Chat" (point release v2.4)

- [x] **SCENE-01**: Each mission is framed by a lightweight scene premise ("you arrive at school and meet Coco — introduce yourself") generated from the mission's target pattern, stored on the mission (`missions.scene_premise`).
- [x] **CHAT-01**: A mission can run in a dynamic conversation mode (`missions.conversation_mode`) where Coco responds naturally and contextually to what the student says, anchored to the target grammar pattern, instead of fully preset turns.
- [x] **CHAT-02**: Coco shares first and has a consistent, friendly personality, giving the student something natural to react to (models English, feels like chatting with a friend, not an interrogation).
- [x] **CHAT-03**: The conversation is bounded to ~5 turns by a **server-enforced** hard cap plus a "wrap it up" nudge — not client-side and not left to the LLM's own judgment.
- [x] **CHAT-04**: The conversation is kept on the target pattern by architectural guardrails (system-level steering + scene purpose), not prompt hope alone; it does not slide into open-ended free chat.
- [x] **CHAT-05**: Every Coco output is moderated/safety-checked before it is shown or spoken to a child.
- [x] **CHAT-06**: Coco's dynamically generated lines are persisted (`attempt_turns.coco_line`) and the full exchange is teacher-reviewable as a transcript, reusing the existing attempts/turns/status/review machinery.

### UIX — UI Overhaul (point release v2.5)

- [ ] **UIX-01**: The app receives one cohesive visual pass unifying voice, mascot, and conversation into a scene-like experience rather than a plain form, using the existing Tailwind/React stack.
- [ ] **UIX-02**: The overhaul re-runs the full prior-phase UAT scripts and passes them, confirming the working homework loop (assign → practice → record → review) is not regressed.

### MEDIA — Pronunciation Remediation Videos (point release v2.6, new)

*Promoted from the Future/deferred backlog (2026-07-09). Distinct mechanism from the retired MEDIA-01..05 story-slide idea: data-triggered by a student's own Azure pronunciation scores, not manually authored per mission.*

- [ ] **MEDIA-F1**: When a student's stored Azure pronunciation scores (PRON-*) show a consistent weak sound across multiple attempts, the app can generate (or the teacher can trigger generation of) a short remediation video — the teacher demonstrating the target sound — assigned to that student as homework. Distinct trigger (weak-sound detection vs. grammar pattern), distinct content type (video vs. static scene), and distinct success check (pronunciation improvement on re-scoring vs. general free-talk evaluation) from any story-slide/mascot mechanic.

---

## Future Requirements (deferred, not this milestone)

- **VOICE-F1**: Cloned teacher voice as an optional TTS voice (ElevenLabs voice cloning). Deferred — needs a written, specific, revocable consent flow and a vendor-ToS check on whether cloned samples are reused for model training. Revisit after v2.1 stock-voice is validated. *(The 2026-07-08 mascot→media pivot had briefly promoted this to VOICE-05 in active scope; reverted with the pivot reversal on 2026-07-09.)*
- **PRON-F1**: Phoneme-level (vs word-level) scoring detail. Deferred until word-level scoring is validated in production with real students.
- **MASCOT-F1**: Per-mission scene backgrounds and a larger expression matrix. Deferred — one static scene and 3–5 expressions are enough for v2.0.
- **MASCOT-F2**: Advanced rig (Rive/Live2D) if static sprites prove insufficient — decide via a v2.3 spike; static sprites are a legitimate v0.
- **MEDIA-F2**: Recurring supporting characters in scenes (a friend, a shopkeeper, etc.) via reference-anchored consistent designs. Deferred; only relevant if a generated-media approach is revisited later. Must use original, non-copyrighted character designs.
- **MEDIA-F3**: Per-student personalization of scenes (student appearing in the story). Deferred — would require per-student likeness and parent/guardian consent.

## Out of Scope (explicit exclusions)

- Teacher-POV generated-media story-slides (retired MEDIA-01..05, briefly scoped 2026-07-08 → 2026-07-09) — replaced the mascot for about a day, then reverted after hands-on testing showed the image-generation pipeline could not reliably preserve the teacher's likeness across models (nano-banana-pro-edit, gpt-image-2, FLUX Kontext all drifted or failed identity preservation) and the close-POV framing read as uncomfortable. See `mascot-vs-media-handoff.md` for the original dilemma and this session's test results for the reversal.
- Full standalone visual novel *product* (branching storyline, arc across missions, story-first) — remains a separate deferred product. v2.0 adds VN *atmosphere* only.
- Open-ended free chat — CHAT-* must stay bounded and on-pattern; free chat is an anti-feature already ruled out in PROJECT.md.
- Raw numeric pronunciation scores shown to students — anti-feature (discouraging for children); teacher-only detail per PRON-05.
- Romance/dating mechanics, heart/life "lives" pressure systems — inappropriate/anxiety-inducing for the classroom.
- Full viseme/phoneme lip-sync for the mascot — disproportionate at this scale; simple audio-driven speaking state is enough.
- Moving all TTS to ElevenLabs — unnecessary second vendor; OpenAI TTS covers the default.

## Traceability

Each active v2.0 requirement is mapped to exactly one phase. 25/25 mapped, no orphans. (MEDIA-01..05/VOICE-05 retired 2026-07-09 with the pivot reversal; MASCOT-01..04 restored to Phase 10; MEDIA-F1 promoted out of the Future backlog into a new Phase 13.)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| VOICE-01 | Phase 8 (v2.1 Coco Voice) | Complete |
| VOICE-02 | Phase 8 (v2.1 Coco Voice) | Complete |
| VOICE-03 | Phase 8 (v2.1 Coco Voice) | Complete |
| VOICE-04 | Phase 8 (v2.1 Coco Voice) | Complete — accepted with residual Chromebook/older-tablet risk |
| PRON-01 | Phase 9 (v2.2 Pronunciation Scoring) | Complete |
| PRON-02 | Phase 9 (v2.2 Pronunciation Scoring) | Complete |
| PRON-03 | Phase 9 (v2.2 Pronunciation Scoring) | Pending |
| PRON-04 | Phase 9 (v2.2 Pronunciation Scoring) | Pending |
| PRON-05 | Phase 9 (v2.2 Pronunciation Scoring) | Pending |
| PRON-06 | Phase 9 (v2.2 Pronunciation Scoring) | Complete |
| MASCOT-01 | Phase 10 (v2.3 Mascot) | Complete 2026-07-11 |
| MASCOT-02 | Phase 10 (v2.3 Mascot) | Complete 2026-07-11 |
| MASCOT-03 | Phase 10 (v2.3 Mascot) | Complete 2026-07-11 |
| MASCOT-04 | Phase 10 (v2.3 Mascot) | Complete 2026-07-11 (accepted residual risk — no low-end device available) |
| SCENE-01 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-01 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-02 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-03 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-04 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-05 | Phase 11 (v2.4 Coco Chat) | Complete |
| CHAT-06 | Phase 11 (v2.4 Coco Chat) | Complete |
| UIX-01 | Phase 12 (v2.5 UI Overhaul) | Pending |
| UIX-02 | Phase 12 (v2.5 UI Overhaul) | Pending |
| MEDIA-F1 | Phase 13 (v2.6 Pronunciation Remediation Videos) | Pending |
