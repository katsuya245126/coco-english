# Roadmap: Coco English

## Milestones

- ✅ **v1.0 — Teacher-Linked Speaking Homework MVP** — Phases 1-7, 26/26 plans, shipped 2026-07-01. Full loop delivered: teacher class setup, mission authoring and AI draft generation, guided voice practice with Coco, transcript-first review, audio evidence, and pilot operations. Audit `passed` with 60/60 requirements verified.
- 🚧 **v2.0 — Coco Comes Alive** — Phases 8-13, in progress. Independently-shippable point releases (voice, pronunciation scoring, VN-style mascot, dynamic chat, UI overhaul, pronunciation remediation videos) layered onto the validated v1 homework loop. Phase 10 briefly pivoted to teacher-POV generated media (2026-07-08) and reverted back to the illustrated mascot (2026-07-09) after hands-on testing showed the image pipeline couldn't reliably hold likeness.

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

### 🚧 v2.0 — Coco Comes Alive (Phases 8-13) — Planned

**Milestone Goal:** Transform Coco English from a functional homework form into an immersive, character-driven speaking experience — Coco speaks, appears on screen, converses naturally, and scores pronunciation — while keeping the teacher-linked homework loop and teacher-verifiability intact. Ships as independently-shippable point releases (v2.1 → v2.6), each verified in production before the next begins. All schema changes are additive; the v1 server-owned status/audit core is untouched.

- [x] **Phase 8: Coco Voice (TTS)** - Coco's mission/prompt lines are spoken aloud with caching and standard `<audio>` playback. All 5 plans executed; automated verification passed; Samsung S23 + Mac preview smoke tests passed; Chromebook/older-tablet coverage unavailable and accepted as residual risk at closeout (2026-07-02).
- [x] **Phase 9: Pronunciation Scoring** - Students get encouraging, banded pronunciation feedback; teachers see word-level diagnostic detail.
- [x] **Phase 10: VN-Style Mascot** - Coco appears as a persistent 2D character with content-tied expressions and audio-driven speaking state. All 4 plans complete 2026-07-11; MASCOT-01..04 verified (real-low-end-device check closed via accepted residual risk — no device available, per Phase 8 precedent).
- [x] **Phase 10.1: Assignment Operations & Student History (INSERTED)** - Add a Gmail-like teacher review inbox, a separate incomplete-work queue, and bounded student Current/Past mission history before Coco Chat. All 12 plans complete; final repository verification passed 2026-07-14.
- [ ] **Phase 11: Coco Chat (dynamic turns + scene framing)** - Missions get a scene premise and an optional bounded, moderated dynamic conversation mode.
- [ ] **Phase 12: UI Overhaul** - One cohesive visual pass unifying voice, mascot, and chat, gated on a full prior-phase UAT re-run.
- [ ] **Phase 13: Pronunciation Remediation Videos** - Data-triggered video homework targeting a student's own weak sound, using stored Azure pronunciation scores from Phase 9. Promoted out of the deferred backlog (2026-07-09).

> **Pivot history (2026-07-08 → 2026-07-09):** Phase 10 was reconsidered mid-flight and replaced by a teacher-POV generated-media approach (MEDIA-*, real photos of the teacher instead of an illustrated mascot; see `mascot-vs-media-handoff.md`). Hands-on testing during that pivot (multiple Fal.ai image models: nano-banana-pro-edit, gpt-image-2, FLUX Kontext) found the pipeline could not reliably preserve the teacher's likeness across a storyboard, and the close-POV framing read as uncomfortable rather than warm. The direction reverted back to the original illustrated mascot on 2026-07-09. Three of the four original mascot plans (10-01 domain logic, 10-02 audio wiring, 10-03 `MascotStage` component) were already executed before the pivot paused work, on a branch (`phase-10-mascot-wip`) that has not been merged to main — see Phase 10 details below.

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

### Phase 10: VN-Style Mascot

**Goal**: Coco appears on screen as a persistent 2D character with a dialogue box, a visible speaking state driven by real audio playback, and a small set of content-tied expressions — without regressing the mission flow, and without over-scoping the asset/animation budget.
**Depends on**: Phase 8 (v2.1 TTS pipeline — the audio element/clock the speaking-state animation reads).
**Requirements**: MASCOT-01, MASCOT-02, MASCOT-03, MASCOT-04
**Success Criteria** (what must be TRUE):

  1. Coco is shown on screen (waist-up, over a background scene) with a dialogue box during the mission flow (MASCOT-01).
  2. Coco's speaking state is driven by the real audio-playback clock (Web Audio amplitude off the `<audio>` element) — not a fixed timer or full lip-sync (MASCOT-02).
  3. Coco shows a small, fixed set of content-tied expressions (idle, speaking, happy/celebrating, encouraging/neutral) — never a punishing expression on a miss (MASCOT-03).
  4. Mascot rendering performs acceptably on low-end school devices with a fixed, small asset scope, verified on a real low-end device, with no regression to the mission loop (MASCOT-04).

**Plans**: 4/4 plans complete (2026-07-11)

**Status note (2026-07-11):** Plan 10-04 closed out the phase. Task 3 (mount persistence, real-audio-driven speaking, content-tied expressions) was human-verified and approved in a real browser. Task 4 (real low-end device performance) had no device available, so the user explicitly accepted this as residual risk, mirroring the Phase 8 VOICE-04 closeout precedent. MASCOT-01..04 are all marked complete.

- [x] 10-01-PLAN.md — pure mascot expression, speaking-state, and degrade helpers
- [x] 10-02-PLAN.md — `CocoSpeechAudio` amplitude/playing callback wiring
- [x] 10-03-PLAN.md — `MascotStage` component (4-sprite rendering, amplitude motion, silent degrade)
- [x] 10-04-PLAN.md — mount `MascotStage` in `MissionFlowShell`, thread callbacks through `Step*` components, device checkpoints (Task 4 closed via accepted residual risk)

**Copyright/asset note**: 7 mascot expression sprites (idle/happy/celebrate/encouraging + alpha variants) already committed to `public/images/` on `main` (commit `8661cb65`).

### Phase 10.1: Assignment Operations & Student History (INSERTED)

**Goal:** Teachers can process cross-class submissions and incomplete work from one fresh, auditable in-app workspace, while students can navigate bounded Current/Past missions and safely revisit the final completed conversation.
**Requirements**: Phase decisions D-01 through D-28 in `10.1-CONTEXT.md` (inserted operational scope; no new v2 REQ IDs)
**Depends on:** Phase 10
**Success Criteria** (what must be TRUE):

  1. `/teacher` is a combined newest-first Needs review inbox with per-class policy, unread/viewed/reviewed receipts, explicit Mark reviewed/Request retry, Undo, and permanent reopen without conflating teacher workflow with student completion.
  2. The shared teacher shell keeps Needs review counts/notices fresh within about 30 seconds on every teacher route, while the visible inbox applies new rows only after a teacher clicks the new-submissions banner.
  3. Incomplete work stays separate and is grouped by assignment under Missed, Due soon (24 hours), and collapsed Later with accurate Not started/Started labels and item counts.
  4. Class and assignment drill-downs reuse the same queue model, preserve ownership, and highlight the selected incomplete student without hiding nearby classmates.
  5. Student home has bounded Current/Past pages: Retry → due soon → later/no-date ordering, late/missed open work remains launchable, and Past contains five completed missions per page newest-first.
  6. A Past mission opens only the unlocked student's final completed attempt as a read-only Coco/You said recap with transcripts, retained audio, qualitative pronunciation feedback, and Recording expired fallback.

**Plans:** 12/12 plans complete

**Wave 1** *(independent foundations)*

- [x] 10.1-01-PLAN.md — additive review-policy/receipt schema, atomic review/retry RPCs, live schema push, and pure teacher queue/incomplete rules
- [x] 10.1-05-PLAN.md — audited `missed → started` late-submission path

**Wave 2** *(server operations and student lists)*

- [x] 10.1-02-PLAN.md — tenant-safe teacher queue/activity/incomplete services plus view/review/reopen/retry/policy actions
- [x] 10.1-06-PLAN.md — student-scoped Current/Past ordering, five-item pagination, tabs, cards, and page links
- [x] 10.1-11-PLAN.md — preserve late-opened in-progress attempts across the missed-status cron and prove same-attempt resume

**Wave 3** *(primary user surfaces)*

- [x] 10.1-03-PLAN.md — shared teacher workspace, 30-second non-disruptive freshness, Needs review, Incomplete, and All activity
- [x] 10.1-07-PLAN.md — student-scoped final-attempt recap, on-demand audio, expiry fallback, and isolation tests
- [x] 10.1-09-PLAN.md — restore policy-aware queue eligibility, policy-independent activity history, and owned review-policy mutation

**Wave 4** *(teacher drill-down integration)*

- [x] 10.1-04-PLAN.md — class/assignment queue integration, review policy, selected-student drill-down, and exact evidence review/recovery loop
- [x] 10.1-12-PLAN.md — derive recap practice words from the displayed transcript through shared pronunciation behavior

**Wave 5** *(UI gap closure and final repository verification)*

- [x] 10.1-08-PLAN.md — child-facing recap: label-aware pronunciation feedback (all-clear summary vs. surfaced practice words) and a button-styled back-to-past-missions control
- [x] 10.1-10-PLAN.md — restore the approved per-class review-policy control, both policy-direction queue outcomes, and the final full verification gate

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

**Plans**: 3/7 plans executed

**Wave 1** *(parallel foundation)*

- [x] 11-01-PLAN.md — additive migration (missions.scene_premise/conversation_mode, attempt_turns.coco_line/moderation_event) + conditional snapshot refine + live push (SCENE-01, CHAT-01, CHAT-06)
- [x] 11-02-PLAN.md — conversation-generator + fail-closed content-moderation adapters, domain schemas, fallback lines, FERPA/COPPA moderation data-use note (CHAT-01, CHAT-02, CHAT-04, CHAT-05)

**Wave 2** *(server orchestration, blocked on Wave 1)*

- [x] 11-03-PLAN.md — hard-turn-cap gate + coco_line persistence (mission-flow), conversation orchestration with dual-direction moderation + retry-once + shared fallback (audio-upload), standalone scene-premise generation without restoring full AI mission drafting (CHAT-01, CHAT-03, CHAT-05, CHAT-06, SCENE-01)

**Wave 3** *(parallel UI, blocked on Wave 2)*

- [ ] 11-04-PLAN.md — student scene-premise card (unvoiced) + "Coco is thinking…" step + dynamic-line playback (SCENE-01, CHAT-02)
- [ ] 11-05-PLAN.md — teacher mission form: conversation-mode toggle, 3-8 required-turns field, editable scene-premise + generate action (SCENE-01, CHAT-01)
- [ ] 11-06-PLAN.md — teacher evidence page: header pattern chip + premise, Coco-said row, pattern-used badge, collapsed moderation flag (CHAT-06, SCENE-01)

**Wave 4** *(manual-review gate, blocked on Wave 3)*

- [ ] 11-07-PLAN.md — roadmap-mandated manual-review UAT: rubric + real scored transcripts confirming on-pattern-ness, moderation-in-practice, personality, and 8-turn cap/wind-down (CHAT-02, CHAT-03, CHAT-04, CHAT-05)

**Research flag**: Highest-risk release in the milestone — needs the deepest phase-specific research/spike on (a) per-turn re-grounding prompt design to prevent drift, (b) moderation-endpoint integration pattern, (c) UI pattern for target-pattern transcript markup, and a concrete UAT/manual-review deliverable confirming drift/safety guardrails hold in practice. Research + UI-SPEC complete; the manual-review deliverable is planned as 11-07.

### Phase 11.1: Coco Chat Opening Line & Dynamic-Turn Runnability (INSERTED)

**Goal:** Chat missions always open with a teacher-reviewed Coco line and remain runnable when the student advances beyond the authored snapshot turns, using real persisted conversation context without weakening preset behavior, ownership, or the server-owned hard cap.
**Requirements**: CHAT-01, CHAT-02, CHAT-06 (verified runnability gaps in the Phase 11 implementation; canonical requirement ownership remains Phase 11)
**Depends on:** Phase 11 plans 11-01 through 11-05 as present on `main`; this repair must complete before Phase 11 plan 11-07 manual conversation UAT.
**Success Criteria** (what must be TRUE):

  1. An authenticated teacher can generate, review, edit, or hand-type Coco's mission-level opening line, and a chat mission cannot save or be assigned without that opener stored as a complete turn-1 template in the immutable snapshot.
  2. The opener is the normal turn-1 student-reply interaction and uses the ordinary cacheable `mission_prompt` TTS path; generation failure stays a soft retry/manual-entry error, with no runtime moderation or canned opener substitution.
  3. An owned chat turn beyond the authored snapshot array is accepted only through the server-owned `HARD_TURN_CAP`, while preset out-of-snapshot turns and chat turns above the cap remain rejected.
  4. Dynamic original evaluation uses the one real persisted previous `attempt_turns.coco_line` as `missionQuestion`, passes `targetExample: null`, skips exact-match acceptance, and leaves original/repeat pronunciation reference selection unchanged.
  5. The student shell renders one dynamic question branch only beyond authored snapshots, carries/restores the real Coco prompt for current and resumed attempts, and exposes one generic pattern-derived hint without fabricating a snapshot turn.

**Plans:** 4 plans

**Wave 1** *(parallel opener/runtime contracts)*

- [x] 11.1-01-PLAN.md — save-time opener schemas, fake-client generator, and authenticated soft-failure teacher action (CHAT-02)
- [x] 11.1-03-PLAN.md — nullable evaluator grounding plus ownership/cap-preserving dynamic snapshot-gate relaxation (CHAT-01, CHAT-06)

**Wave 2** *(opener integration, blocked on its Wave 1 contract)*

- [x] 11.1-02-PLAN.md — mirrored form/snapshot opener backstop and complete turn-1 generate-then-edit serialization (CHAT-01, CHAT-02)

**Wave 3** *(student integration, blocked on opener + runtime contracts)*

- [ ] 11.1-04-PLAN.md — single dynamic student branch, one pattern hint, correct TTS provenance, and persisted prompt resume (CHAT-01, CHAT-02, CHAT-06)

### Phase 12: UI Overhaul

**Goal**: The app receives one cohesive visual pass that unifies voice, mascot, and conversation into a scene-like experience, without regressing the working v1 homework loop.
**Depends on**: Phase 8, Phase 9, Phase 10, Phase 11 (visual pass over all prior v2.0 surfaces plus the existing v1 app)
**Requirements**: UIX-01, UIX-02
**Success Criteria** (what must be TRUE):

  1. Voice, mascot, and conversation surfaces read as one cohesive scene-like visual experience rather than a plain form, built on the existing Tailwind/React stack.
  2. The full prior-phase UAT scripts (login, roster, assignment, mission completion, review, status transitions) have been re-run after the visual pass and pass — confirming the assign → practice → record → review loop is not regressed.

**Plans**: TBD
**UI hint**: yes

### Phase 13: Pronunciation Remediation Videos

**Goal**: When a student's stored Azure pronunciation scores show a consistent weak sound, the teacher can trigger (or the app can generate) a short remediation video targeting that sound, assigned to the student as homework — a data-triggered, individualized mechanic distinct from the general grammar-pattern mission flow.
**Depends on**: Phase 9 (Azure pronunciation_scores data to detect weak sounds from). Independent of Phase 10/11/12 (no mascot or chat dependency).
**Requirements**: MEDIA-F1
**Success Criteria** (what must be TRUE):

  1. The app can identify, from stored `pronunciation_scores`, when a student has a consistent weak sound across multiple attempts (detection logic, thresholds TBD in planning).
  2. A short remediation video (the teacher demonstrating the target sound) can be generated or attached and assigned to that specific student as homework, reusing the existing assignment/mission machinery where possible.
  3. The mechanic is verifiably distinct in the data model and UI from grammar-pattern missions — triggered by pronunciation data, not authored per class.
  4. Success is measured by re-scoring the targeted sound after the student completes the remediation homework, not by general free-talk evaluation.

**Plans**: TBD (to be created by `/gsd-plan-phase 13`)
**Research flags**: Weak-sound detection thresholds (how many low-scoring attempts on the same phoneme trigger a remediation assignment); video generation/production workflow for the teacher (reuses media-gen tooling explored 2026-07-09, or a simpler manual-upload path); whether this needs its own vendor/cost note beyond Azure Speech (PRON-02).

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9 → 10 → 10.1 → 11 → 11.1 → 12 → 13 (Phase 11.1 closes urgent Phase 11 runnability gaps before 11-07 UAT; Phase 13 has no hard dependency on 10-12 and could be reordered earlier if desired)

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
| 10. VN-Style Mascot | v2.0 | 4/4 | Complete (accepted with residual low-end-device risk) | 2026-07-11 |
| 10.1 Assignment Operations & Student History | v2.0 | 12/12 | Complete   | 2026-07-14 |
| 11. Coco Chat (dynamic turns + scene framing) | v2.0 | 2/7 | In Progress|  |
| 11.1 Coco Chat Opening Line & Dynamic-Turn Runnability | v2.0 | 3/4 | In Progress | - |
| 12. UI Overhaul | v2.0 | 0/TBD | Not started | - |
| 13. Pronunciation Remediation Videos | v2.0 | 0/TBD | Not planned | - |

## Next Up

Phase 10.1 (Assignment Operations & Student History) completed all four verification gap plans: late-open resume safety, policy-aware queue contracts, transcript-accurate recap words, and the live per-class policy UI with final repository verification. A later Nyquist audit found one remaining decision mismatch (D-19: sidebar Incomplete badge excluded Later-urgency items) and 4 unresolved security-register entries; both were closed 2026-07-14 (lean TDD fix + user-approved accepted risks in `10.1-SECURITY.md`, 41/41 threats closed). Phase 10.1 is now fully closed and ready to deploy.

Phase 11 (Coco Chat) remains fully planned (7 plans, 4 waves) and follows Phase 10.1 once it closes; its existing plans are unchanged.

Phase 13 (Pronunciation Remediation Videos) is newly promoted from the deferred backlog and not yet planned — run `/gsd-discuss-phase 13` or `/gsd-plan-phase 13` when ready, independently of Phase 11-12 sequencing.
