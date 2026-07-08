# Requirements — Milestone v2.0 "Coco Comes Alive"

**Milestone goal:** Transform Coco English from a functional homework form into an immersive, character-driven speaking experience — Coco speaks, students practice inside a visual scene, converses naturally, and scores pronunciation — while keeping the teacher-linked homework loop and teacher-verifiability intact.

**Thesis:** "VN feel, homework substance." VN is atmosphere; free-talk practice stays the substance. Standalone VN product remains deferred. Each mission gets a lightweight scene premise tied to the target pattern.

**Pivot (2026-07-08):** The mascot direction (MASCOT-*, an illustrated 2D Coco cat with expression sprites) was reconsidered during brainstorming and **replaced** by a teacher-POV generated-media approach: the student practices inside a short storyboard of first-person-POV scene images featuring the teacher addressing the student directly, spoken in the teacher's own cloned voice. Rationale (see `mascot-vs-media-handoff.md`): the media approach is already classroom-validated (the teacher's PowerPoint-review habit), sidesteps unproven character-art design, and shows the situation and character in one asset instead of requiring a separate mascot + background pipeline. MASCOT-* are retired; a new MEDIA category replaces them; VOICE-F1 (cloned teacher voice) moves into active scope.

**Shape:** Independently-shippable point releases (v2.1→v2.5), each verified in production before the next begins. All schema changes are additive — no changes to the v1 server-owned status/audit core.

REQ-ID categories continue from v1 with new codes: VOICE, PRON, MEDIA, CHAT, SCENE, UIX. (MASCOT retired — see Out of Scope.)

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

### MEDIA — POV Story-Slide Missions (point release v2.3)

*Replaces the retired MASCOT category. The character on screen is the teacher, shown in first-person-POV generated scene images, not an illustrated mascot.*

- [ ] **MEDIA-01**: A mission can present a **storyboard** — an ordered, teacher-authored sequence of slides shown to the student during the mission flow. Each slide is one generated POV scene image (the teacher, in-frame, addressing the student) with accompanying text.
- [ ] **MEDIA-02**: Each slide is one of two types: a **story slide** (scene-setting; the student views and advances, no spoken answer required) or a **question slide** (the existing mission-turn mechanic — the student must speak a response, which is transcribed, evaluated, and gated exactly as today). Question slides reuse the v1 attempt/turn/evaluation machinery unchanged.
- [ ] **MEDIA-03**: The teacher authors the storyboard when creating/editing a mission — choosing the number of slides, their order, each slide's type (story vs. question), and attaching the generated image and text per slide. Storyboard length is variable per mission (not a fixed count).
- [ ] **MEDIA-04**: A slide's text is spoken aloud in the **teacher's cloned voice** via TTS (see VOICE-05), with the same tap-to-replay and content-hash caching behavior as v2.1 voice. This applies to both story and question slides.
- [ ] **MEDIA-05**: Slide media renders acceptably on low-end school devices — generated images are appropriately sized/compressed, no layout shift as slides advance, and the existing mission flow is not regressed.

### VOICE — Cloned Teacher Voice (point release v2.3, additive to v2.1)

- [ ] **VOICE-05**: Coco's / the scene's spoken lines can use a **cloned model of the teacher's own voice** (previously deferred as VOICE-F1), reusing the v2.1 TTS pipeline shape (content-hash cache, `<audio>` playback) with the voice model swapped. Because it is the teacher's own voice on the teacher's own image for the teacher's own students, the consent question that deferred VOICE-F1 is resolved by a documented self-consent note; a vendor-ToS check on whether cloned samples are reused for training is still required before samples are uploaded.

### SCENE + CHAT — Dynamic Turns & Scene Framing / "Coco Chat" (point release v2.4)

- [ ] **SCENE-01**: Each mission is framed by a lightweight scene premise ("you arrive at school and meet Coco — introduce yourself") generated from the mission's target pattern, stored on the mission (`missions.scene_premise`).
- [ ] **CHAT-01**: A mission can run in a dynamic conversation mode (`missions.conversation_mode`) where Coco responds naturally and contextually to what the student says, anchored to the target grammar pattern, instead of fully preset turns.
- [ ] **CHAT-02**: Coco shares first and has a consistent, friendly personality, giving the student something natural to react to (models English, feels like chatting with a friend, not an interrogation).
- [ ] **CHAT-03**: The conversation is bounded to ~5 turns by a **server-enforced** hard cap plus a "wrap it up" nudge — not client-side and not left to the LLM's own judgment.
- [ ] **CHAT-04**: The conversation is kept on the target pattern by architectural guardrails (system-level steering + scene purpose), not prompt hope alone; it does not slide into open-ended free chat.
- [ ] **CHAT-05**: Every Coco output is moderated/safety-checked before it is shown or spoken to a child.
- [ ] **CHAT-06**: Coco's dynamically generated lines are persisted (`attempt_turns.coco_line`) and the full exchange is teacher-reviewable as a transcript, reusing the existing attempts/turns/status/review machinery.

### UIX — UI Overhaul (point release v2.5)

- [ ] **UIX-01**: The app receives one cohesive visual pass unifying voice, mascot, and conversation into a scene-like experience rather than a plain form, using the existing Tailwind/React stack.
- [ ] **UIX-02**: The overhaul re-runs the full prior-phase UAT scripts and passes them, confirming the working homework loop (assign → practice → record → review) is not regressed.

---

## Future Requirements (deferred, not this milestone)

- **VOICE-F1**: ~~Cloned teacher voice~~ — **promoted into scope as VOICE-05** (2026-07-08). The mascot→teacher-POV pivot resolved the consent concern (teacher's own voice on teacher's own image for teacher's own students).
- **PRON-F1**: Phoneme-level (vs word-level) scoring detail. Deferred until word-level scoring is validated in production with real students.
- **MEDIA-F1**: **Video slides / "pronunciation missions"** — a distinct mission type where a slide is a short generated video (the teacher demonstrating a target sound), assigned as data-triggered homework once a student's Azure pronunciation scores show a consistent weak sound. Deferred: different trigger (weak-sound detection vs. grammar pattern), different content type (video vs. image), and different success check (pronunciation improvement vs. general free-talk eval) than MEDIA story-slides. Design as its own phase after MEDIA story-slides ship. See `coco-english-pronunciation-remediation-video-idea` memory.
- **MEDIA-F2**: **Recurring supporting characters** in scenes (a friend, a shopkeeper, etc.) via reference-anchored consistent designs — additive to the solo-teacher-POV baseline. Deferred; must use original, non-copyrighted character designs (explicitly not meme/"brainrot" or franchise characters, which carry infringement risk even when they feel ownerless).
- **MEDIA-F3**: Per-student personalization of scenes (student appearing in the story). Deferred — would require per-student likeness and parent/guardian consent; the POV framing (camera IS the student) intentionally avoids this for the baseline.

## Out of Scope (explicit exclusions)

- **Illustrated Coco mascot (retired MASCOT-01..04)** — the 2D cartoon-cat character with expression sprites, audio-driven speaking state, and dialogue box. Reconsidered and dropped 2026-07-08 in favor of the teacher-POV generated-media approach (MEDIA-*). The 7 committed sprite assets and the Phase 10 mascot planning artifacts become dead history; not deleted from git, but no longer executed. If a fictional mascot is ever revisited (e.g. for a distributable product where a real teacher's likeness doesn't scale to strangers), it would be a fresh scope decision — see `mascot-vs-media-handoff.md` for the personal-vs-distributable analysis behind this call.
- Full standalone visual novel *product* (branching storyline, arc across missions, story-first) — remains a separate deferred product. v2.0 adds VN *atmosphere* only.
- Open-ended free chat — CHAT-* must stay bounded and on-pattern; free chat is an anti-feature already ruled out in PROJECT.md.
- Raw numeric pronunciation scores shown to students — anti-feature (discouraging for children); teacher-only detail per PRON-05.
- Romance/dating mechanics, heart/life "lives" pressure systems — inappropriate/anxiety-inducing for the classroom.
- Full viseme/phoneme lip-sync for the mascot — disproportionate at this scale; simple audio-driven speaking state is enough.
- Moving all TTS to ElevenLabs — unnecessary second vendor; OpenAI TTS covers the default.

## Traceability

Each active v2.0 requirement is mapped to exactly one phase. 24/24 mapped, no orphans. (MASCOT-01..04 retired 2026-07-08 and moved to Out of Scope; MEDIA-01..05 + VOICE-05 replace them in Phase 10.)

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
| MEDIA-01 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| MEDIA-02 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| MEDIA-03 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| MEDIA-04 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| MEDIA-05 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| VOICE-05 | Phase 10 (v2.3 POV Story-Slides) | Pending |
| SCENE-01 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-01 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-02 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-03 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-04 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-05 | Phase 11 (v2.4 Coco Chat) | Pending |
| CHAT-06 | Phase 11 (v2.4 Coco Chat) | Pending |
| UIX-01 | Phase 12 (v2.5 UI Overhaul) | Pending |
| UIX-02 | Phase 12 (v2.5 UI Overhaul) | Pending |
