# Roadmap: Coco English

## Milestones

- ✅ **v1.0 — Teacher-Linked Speaking Homework MVP** — Phases 1-7, 26/26 plans, shipped 2026-07-01. Full loop delivered: teacher class setup, mission authoring and AI draft generation, guided voice practice with Coco, transcript-first review, audio evidence, and pilot operations. Audit `passed` with 60/60 requirements verified.
- 🚧 **v2.0 — Coco Comes Alive** — Phases 8-12, in progress. Independently-shippable point releases (voice, pronunciation scoring, POV story-slide missions, dynamic chat [under review], UI overhaul) layered onto the validated v1 homework loop. Phase 10 pivoted from an illustrated mascot to teacher-POV generated media on 2026-07-08.

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

- [x] **Phase 8: Coco Voice (TTS)** - Coco's mission/prompt lines are spoken aloud with caching and standard `<audio>` playback. All 5 plans executed; automated verification passed; Samsung S23 + Mac preview smoke tests passed; Chromebook/older-tablet coverage unavailable and accepted as residual risk at closeout (2026-07-02).
- [x] **Phase 9: Pronunciation Scoring** - Students get encouraging, banded pronunciation feedback; teachers see word-level diagnostic detail.
- [ ] **Phase 10: POV Story-Slide Missions** - The student practices inside a teacher-authored storyboard of first-person-POV scene images (the teacher addressing the student), spoken in the teacher's cloned voice. *(Replaces the retired mascot direction — see pivot note below.)*
- [ ] **Phase 11: Coco Chat (dynamic turns + scene framing)** - Missions get a scene premise and an optional bounded, moderated dynamic conversation mode. *(Needs revisiting post-pivot — see note.)*
- [ ] **Phase 12: UI Overhaul** - One cohesive visual pass unifying voice, scene media, and chat, gated on a full prior-phase UAT re-run.

> **Pivot (2026-07-08):** Phase 10 was fully planned as an illustrated 2D Coco mascot (MASCOT-*), then reconsidered in brainstorming and replaced by the teacher-POV generated-media approach (MEDIA-*). Rationale in `mascot-vs-media-handoff.md`. The old mascot planning artifacts and sprite assets are retired (dead history, not executed). **Phases 11 and 12 are intentionally left as-was pending a separate decision on Chat's fate after this pivot** — in particular, Phase 11's SCENE-01 framed the scene premise as *text*, but the Phase 10 storyboard now IS the visual scene-framing, so SCENE-01 and the dynamic-chat concept must be re-evaluated (does a teacher-POV product still want an AI chatbot layer?) before Phase 11 is planned. Do not plan Phase 11 until that is resolved.

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

**Plans**: 5/5 plans complete

- [x] 08-01-PLAN.md
- [x] 08-02-PLAN.md
- [x] 08-03-PLAN.md
- [x] 08-04-PLAN.md
- [x] 08-05-PLAN.md

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

**Plans**: 6/6 plans executed
**Wave 1**

- [x] 09-01-PLAN.md — FERPA/COPPA Azure data-use note + server-only env vars (PRON-02)
- [x] 09-02-PLAN.md — pronunciation_scores table, RLS, grants + live schema push (PRON-06)
- [x] 09-03-PLAN.md — install Azure SDK + ffmpeg-static; transcode, scorer adapter, score→star mapping (PRON-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-04-PLAN.md — wire scoring inline into upload pipeline + persist scores (PRON-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 09-05-PLAN.md — teacher per-word diagnostic panel + D-04 calibration gate (PRON-03, PRON-05)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 09-06-PLAN.md — inline student star band, no raw score (PRON-04)

**Research flag**: Needs an explicit accuracy-validation pass (Azure vs. real stored student audio for this app's 6 students) as a phase task before score-band thresholds are finalized — not literature research, empirical validation. (Handled by the D-04 calibration checkpoint in 09-05, which gates the 09-06 student-facing stars.)

### Phase 10: POV Story-Slide Missions

**Goal**: A mission can present the student with a short, teacher-authored storyboard of first-person-POV scene images (the teacher, in-frame, addressing the student), where some slides set the scene and some are spoken question-turns, all voiced in the teacher's cloned voice — without regressing the v1 attempt/turn/evaluation loop and without a content-production workflow so heavy the teacher can't sustain it.
**Depends on**: Phase 8 (v2.1 TTS pipeline — cache + `<audio>` playback, reused with a cloned-voice model); Phase 4/6 (v1 mission flow shell, attempt/turn/evaluation machinery reused unchanged for question slides).
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05, VOICE-05
**Success Criteria** (what must be TRUE):

  1. **[Production-volume validation gate — early, before app UI is built]** The teacher generates 5–6 real storyboards (POV teacher scene images + text) for actual upcoming grammar patterns using the chosen generation tool, and confirms the workflow holds up at per-mission volume with acceptable character/likeness consistency. This de-risks the load-bearing unknown (occasional PowerPoint habit → systematic per-mission pipeline) before engineering investment. If it does not hold up, the phase re-scopes before building.
  2. During a mission, the student is shown an ordered storyboard of slides; **story slides** advance on view (no spoken answer), and **question slides** require the student to speak a response that is transcribed, evaluated, and gated by the existing v1 mission-turn mechanic — with no regression to that loop.
  3. The teacher authors the storyboard when creating/editing a mission: variable slide count, per-slide type (story vs. question), and per-slide image + text, persisted with the mission.
  4. Each slide's text is spoken aloud in the teacher's cloned voice, with tap-to-replay and content-hash caching, reusing the v2.1 TTS pipeline (voice model swapped).
  5. Slide images are appropriately sized/compressed and render with no layout shift on a real low-end school device (Chromebook/older tablet); the existing mission flow is not regressed.

**Plans**: TBD (to be created by `/gsd-plan-phase 10` against the new MEDIA requirements — the old 4 mascot plans are retired)

**Research flags**:
- **Generation tooling + character consistency (open):** which image-generation tool/workflow (e.g. Gemini / "Nano Banana"–style) best holds the teacher's likeness consistent across many POV scenes from a small base set of reference expression photos; expected regeneration/curation overhead per mission. This is the subject of the Success Criterion 1 validation gate.
- **Voice-clone vendor + ToS (open):** which TTS provider supports voice cloning within budget, and whether uploaded voice samples are reused for model training (VOICE-05 blocker before any samples are uploaded).
- **Storyboard data model (open):** additive schema for an ordered per-mission slide list (type, image ref, text) — must stay additive to the v1 mission/attempt/turn core, mirroring the discipline of prior v2 phases.

**Copyright note**: any supporting characters (deferred, MEDIA-F2) must use original designs — no franchise or meme/"brainrot" characters.
**UI hint**: yes

### Phase 11: Coco Chat (dynamic turns + scene framing)

> ⚠️ **Needs post-pivot re-evaluation before planning (2026-07-08).** This phase and its plans were written for the mascot-era product. Two things changed: (a) SCENE-01 framed the scene premise as *text*, but the Phase 10 POV storyboard is now the visual scene-framing — SCENE-01 likely folds into MEDIA or is redefined; (b) the whole "Coco Chat" dynamic-AI-conversation concept assumed a chatbot persona (the cat) — with a teacher-POV product, whether an AI chatbot layer still fits is an open product question. **Do not run `/gsd-plan-phase 11` until Chat's fate is decided.** The plan artifacts below are retained for reference but may be substantially rewritten or dropped.

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

**Plans**: 7 plans

**Wave 1** *(parallel foundation)*

- [ ] 11-01-PLAN.md — additive migration (missions.scene_premise/conversation_mode, attempt_turns.coco_line/moderation_event) + conditional snapshot refine + live push (SCENE-01, CHAT-01, CHAT-06)
- [ ] 11-02-PLAN.md — conversation-generator + fail-closed content-moderation adapters, domain schemas, fallback lines, FERPA/COPPA moderation data-use note (CHAT-01, CHAT-02, CHAT-04, CHAT-05)

**Wave 2** *(server orchestration, blocked on Wave 1)*

- [ ] 11-03-PLAN.md — hard-turn-cap gate + coco_line persistence (mission-flow), conversation orchestration with dual-direction moderation + retry-once + shared fallback (audio-upload), scene-premise generation in mission draft (CHAT-01, CHAT-03, CHAT-05, CHAT-06, SCENE-01)

**Wave 3** *(parallel UI, blocked on Wave 2)*

- [ ] 11-04-PLAN.md — student scene-premise card (unvoiced) + "Coco is thinking…" step + dynamic-line playback (SCENE-01, CHAT-02)
- [ ] 11-05-PLAN.md — teacher mission form: conversation-mode toggle, 3-8 required-turns field, editable scene-premise + generate action (SCENE-01, CHAT-01)
- [ ] 11-06-PLAN.md — teacher evidence page: header pattern chip + premise, Coco-said row, pattern-used badge, collapsed moderation flag (CHAT-06, SCENE-01)

**Wave 4** *(manual-review gate, blocked on Wave 3)*

- [ ] 11-07-PLAN.md — roadmap-mandated manual-review UAT: rubric + real scored transcripts confirming on-pattern-ness, moderation-in-practice, personality, and 8-turn cap/wind-down (CHAT-02, CHAT-03, CHAT-04, CHAT-05)

**Research flag**: Highest-risk release in the milestone — needs the deepest phase-specific research/spike on (a) per-turn re-grounding prompt design to prevent drift, (b) moderation-endpoint integration pattern, (c) UI pattern for target-pattern transcript markup, and a concrete UAT/manual-review deliverable confirming drift/safety guardrails hold in practice. Research + UI-SPEC complete; the manual-review deliverable is planned as 11-07.

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
| 8. Coco Voice (TTS) | v2.0 | 5/5 | Complete (accepted with residual low-end-device risk) | 2026-07-02 |
| 9. Pronunciation Scoring | v2.0 | 6/6 | Complete | 2026-07-03 |
| 10. POV Story-Slide Missions | v2.0 | 0/TBD | Re-planning (pivoted from mascot) | - |
| 11. Coco Chat (dynamic turns + scene framing) | v2.0 | 0/7 | Planned — needs post-pivot re-evaluation | - |
| 12. UI Overhaul | v2.0 | 0/TBD | Not started | - |

## Next Up

Phase 10 was re-scoped from the mascot direction to **POV Story-Slide Missions** (2026-07-08). Before planning, note that Success Criterion 1 is a production-volume validation gate — the teacher should generate 5–6 real storyboards by hand to prove the workflow is sustainable, either as a pre-step or as the first task in the plan.

Run `/gsd-discuss-phase 10` (or `/gsd-plan-phase 10`) to plan POV Story-Slide Missions against the new MEDIA-* / VOICE-05 requirements. Phase 11 (Coco Chat) is on hold pending a decision about whether a dynamic AI-chat layer still fits the teacher-POV product.
