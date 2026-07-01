# Roadmap: Coco English

## Milestones

- ✅ **v1.0 — Teacher-Linked Speaking Homework MVP** — Phases 1-7, 26/26 plans, shipped 2026-07-01. Full loop delivered: teacher class setup, mission authoring and AI draft generation, guided voice practice with Coco, transcript-first review, audio evidence, and pilot operations. Audit `passed` with 60/60 requirements verified.
- 🚧 **v2.0 — Coco Comes Alive** — Phases 8-12, planned. Five independently-shippable point releases (voice, pronunciation scoring, mascot, dynamic chat, UI overhaul) layered onto the validated v1 homework loop.

## Phases

<details>
<summary>✅ v1.0 — Teacher-Linked Speaking Homework MVP (Phases 1-7) — SHIPPED 2026-07-01</summary>

- [x] Phase 1: Data, Privacy, and Workflow Foundation — 1/1 plan, completed 2026-06-25
- [x] Phase 2: Teacher Classroom Access — 4/4 plans, completed 2026-06-26
- [x] Phase 3: Manual Mission Assignment — 3/3 plans, completed 2026-06-26
- [x] Phase 4: Guided Student Attempt Loop — 5/5 plans, completed 2026-06-27
- [x] Phase 5: Voice Capture and Evidence Storage — 5/5 plans, completed 2026-06-27
- [x] Phase 6: AI Mission and Turn Intelligence — 4/4 plans, completed 2026-06-29
- [x] Phase 7: Teacher Review and Pilot Readiness — 4/4 plans, completed 2026-07-01

Archive:

- [v1.0 roadmap archive](milestones/v1.0-ROADMAP.md)
- [v1.0 requirements archive](milestones/v1.0-REQUIREMENTS.md)
- [v1.0 milestone audit](v1.0-MILESTONE-AUDIT.md)

</details>

### 🚧 v2.0 — Coco Comes Alive (Phases 8-12) — Planned

**Milestone Goal:** Transform Coco English from a functional homework form into an immersive, character-driven speaking experience — Coco speaks, appears on screen, converses naturally, and scores pronunciation — while keeping the teacher-linked homework loop and teacher-verifiability intact. Ships as five independently-shippable point releases (v2.1 → v2.5), each verified in production before the next begins. All schema changes are additive; the v1 server-owned status/audit core is untouched.

- [ ] **Phase 8: Coco Voice (TTS)** - Coco's mission/prompt lines are spoken aloud with caching and low-end-device playback.
- [ ] **Phase 9: Pronunciation Scoring** - Students get encouraging, banded pronunciation feedback; teachers see word-level diagnostic detail.
- [ ] **Phase 10: Mascot (VN-style)** - Coco appears on screen as a 2D character with an audio-driven speaking state.
- [ ] **Phase 11: Coco Chat (dynamic turns + scene framing)** - Missions get a scene premise and an optional bounded, moderated dynamic conversation mode.
- [ ] **Phase 12: UI Overhaul** - One cohesive visual pass unifying voice, mascot, and chat, gated on a full prior-phase UAT re-run.

## Phase Details

### Phase 8: Coco Voice (TTS)

**Goal**: Students hear Coco's mission and prompt lines spoken aloud, with fast, cheap, cache-first playback that works on low-end school devices.
**Depends on**: Phase 7 (v1.0 — homework loop, mission flow shell, character profile)
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):

  1. Student hears Coco's mission/prompt lines spoken aloud automatically during the mission flow, using OpenAI TTS (`gpt-4o-mini-tts`).
  2. Student can tap to replay any spoken Coco line on demand.
  3. Requesting the same line (same text + character + voice + provider + format) a second time serves a cached result instead of calling the TTS provider again — verified via a cache-hit check, not just visual playback.
  4. Voice playback works using a standard HTML `<audio>` element (no streaming pipeline) tested on a real low-end school device (Chromebook or older tablet), not just a dev machine.

**Plans**: 2/5 plans executed

- [x] 08-01-PLAN.md
- [x] 08-02-PLAN.md
- [ ] 08-03-PLAN.md
- [ ] 08-04-PLAN.md
- [ ] 08-05-PLAN.md

### Phase 9: Pronunciation Scoring

**Goal**: Students get encouraging, non-discouraging pronunciation feedback tied to their own spoken attempts, and teachers get an additive diagnostic detail view — without ever showing a raw score to a child or displacing the transcript-first review.
**Depends on**: Phase 7 (v1.0 — stored per-turn audio clips, target/improved sentences, teacher review UI). Independent of Phase 8.
**Requirements**: PRON-01, PRON-02, PRON-03, PRON-04, PRON-05, PRON-06
**Success Criteria** (what must be TRUE):

  1. A student's spoken turn is scored against the target sentence using Azure AI Speech Pronunciation Assessment, reusing existing v1-stored audio (no new capture required).
  2. Scoring accuracy has been spot-checked against this app's own students' real stored v1 audio, and score bands are calibrated so normal child/non-native speech is not over-penalized, before any student sees a result.
  3. Students see only qualitative bands/stars/color and word-level "what to fix" highlights — never a raw numeric score.
  4. Teacher review shows a per-word pronunciation breakdown as an additive diagnostic panel that never displaces or hides the existing transcript-first view.
  5. Pronunciation scores are stored in a dedicated `pronunciation_scores` table keyed on the audio clip, independent of existing turn-evaluation data.
  6. A documented FERPA/COPPA data-use note for Azure Speech exists before any student audio is sent to the vendor.

**Plans**: TBD
**Research flag**: Needs an explicit accuracy-validation pass (Azure vs. real stored student audio for this app's 6 students) as a phase task before score-band thresholds are finalized — not literature research, empirical validation.

### Phase 10: Mascot (VN-style)

**Goal**: Coco is visually present during the mission flow as a 2D on-screen character whose speaking/idle/reaction state is driven by real audio, not a timer, without letting art scope grow beyond a small fixed set.
**Depends on**: Phase 8 (needs the real audio-playback signal/clock to drive the speaking state)
**Requirements**: MASCOT-01, MASCOT-02, MASCOT-03, MASCOT-04
**Success Criteria** (what must be TRUE):

  1. Coco appears on screen as a 2D character (waist-up, over a background scene) with a dialogue box during the mission flow.
  2. Coco's "speaking" state is visibly distinct from idle/listening and is driven by the actual audio playback clock (Web Audio amplitude off the `<audio>` element) rather than a fixed timer.
  3. Coco shows a small fixed set of 3-5 content-tied expression states (idle, speaking, happy/celebrating, encouraging/neutral on a miss) — no more, no per-scene background variants.
  4. Mascot rendering has been tested and performs acceptably on a real low-end school device (Chromebook/older tablet).

**Plans**: TBD
**Research flag**: Needs a lightweight Rive-vs-static-sprite spike/decision at the start of phase planning before committing to an authoring pipeline; static sprites are an explicitly acceptable v0.
**UI hint**: yes

### Phase 11: Coco Chat (dynamic turns + scene framing)

**Goal**: Each mission is framed by a lightweight scene premise tied to its target pattern, and missions can optionally run in a dynamic, bounded, moderated conversation mode where Coco responds naturally while staying on-pattern and fully teacher-reviewable — without drifting off-topic, exceeding a hard turn cap, or reaching a student with unmoderated content.
**Depends on**: Phase 8 (voice) and Phase 10 (mascot presence), for the full "scene" experience described in PROJECT.md.
**Requirements**: SCENE-01, CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06
**Success Criteria** (what must be TRUE):

  1. Each mission has a lightweight scene premise generated from its target pattern and stored on the mission (`missions.scene_premise`).
  2. A mission can run in a dynamic conversation mode (`missions.conversation_mode`) where Coco responds naturally and contextually to what the student says, anchored to the target grammar pattern.
  3. Coco shares first and maintains a consistent, friendly personality across turns, giving the student something natural to react to.
  4. The conversation is held to a hard, server-enforced ~5-turn cap (not client-side, not left to LLM judgment) with a "wrap it up" nudge as the cap approaches.
  5. The conversation stays on the target pattern across turns via architectural guardrails (per-turn re-grounding / system-level steering), verified by manual review of test transcripts, not prompt wording alone.
  6. Every Coco output is moderated/safety-checked before it is shown or spoken to a student.
  7. Coco's dynamically generated lines are persisted (`attempt_turns.coco_line`) and the full exchange is teacher-reviewable as a transcript using the existing review UI, with the target pattern visually identifiable in the transcript.

**Plans**: TBD
**Research flag**: Highest-risk release in the milestone — needs the deepest phase-specific research/spike on (a) per-turn re-grounding prompt design to prevent drift, (b) moderation-endpoint integration pattern, (c) UI pattern for target-pattern transcript markup, and a concrete UAT/manual-review deliverable confirming drift/safety guardrails hold in practice. Recommend `/gsd-plan-phase --research-phase 11`.

### Phase 12: UI Overhaul

**Goal**: The app receives one cohesive visual pass that unifies voice, mascot, and conversation into a scene-like experience, without regressing the working v1 homework loop.
**Depends on**: Phase 8, Phase 9, Phase 10, Phase 11 (visual pass over all prior v2.0 surfaces plus the existing v1 app)
**Requirements**: UIX-01, UIX-02
**Success Criteria** (what must be TRUE):

  1. Voice, mascot, and conversation surfaces read as one cohesive scene-like visual experience rather than a plain form, built on the existing Tailwind/React stack.
  2. The full prior-phase UAT scripts (login, roster, assignment, mission completion, review, status transitions) have been re-run after the visual pass and pass — confirming the assign → practice → record → review loop is not regressed.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9 → 10 → 11 → 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|-----------------|--------|-----------|
| 1. Data, Privacy, and Workflow Foundation | v1.0 | 1/1 | Complete | 2026-06-25 |
| 2. Teacher Classroom Access | v1.0 | 4/4 | Complete | 2026-06-26 |
| 3. Manual Mission Assignment | v1.0 | 3/3 | Complete | 2026-06-26 |
| 4. Guided Student Attempt Loop | v1.0 | 5/5 | Complete | 2026-06-27 |
| 5. Voice Capture and Evidence Storage | v1.0 | 5/5 | Complete | 2026-06-27 |
| 6. AI Mission and Turn Intelligence | v1.0 | 4/4 | Complete | 2026-06-29 |
| 7. Teacher Review and Pilot Readiness | v1.0 | 4/4 | Complete | 2026-07-01 |
| 8. Coco Voice (TTS) | v2.0 | 2/5 | In Progress|  |
| 9. Pronunciation Scoring | v2.0 | 0/TBD | Not started | - |
| 10. Mascot (VN-style) | v2.0 | 0/TBD | Not started | - |
| 11. Coco Chat (dynamic turns + scene framing) | v2.0 | 0/TBD | Not started | - |
| 12. UI Overhaul | v2.0 | 0/TBD | Not started | - |

## Next Up

Run `/gsd-plan-phase 8` to plan Coco Voice (TTS), the first v2.0 point release.
