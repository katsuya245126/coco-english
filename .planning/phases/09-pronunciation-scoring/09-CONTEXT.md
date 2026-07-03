# Phase 9: Pronunciation Scoring - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 adds pronunciation scoring on top of existing v1 stored audio: student turns are scored against the target sentence using Azure AI Speech Pronunciation Assessment, students see encouraging star-based feedback (never a raw score), and teachers get an additive, collapsed per-word diagnostic panel on the existing transcript-first evidence page. No new audio capture — this phase reuses audio already stored by Phase 5.

Out of scope: backfilling scores for attempts completed before this phase ships; any change to the existing transcript-first review flow, meaning/target-pattern evaluation (Phase 6), or student capture UI (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Scoring Trigger
- **D-01:** Pronunciation scoring runs automatically, inline with the existing AI evaluation pipeline — scored right after Whisper transcription / AI evaluation completes for a turn, so results are ready by the time the student sees feedback and the teacher opens review. No separate on-demand or batched job.

### Student-Facing Feedback
- **D-02:** Pronunciation feedback appears inline on the existing per-turn feedback step (`StepAiEvaluationFeedback.tsx`), alongside the meaning/target-pattern feedback the student already sees — one unified feedback moment, not a separate screen or end-of-mission-only summary.
- **D-03:** Band scale is **1-3 stars, always shown**. Star count mirrors the app's existing 3-level qualitative vocabulary (`Understood`/`Try again`/`Needs teacher check` from `src/server/teacher/audio-evidence.ts`): 3★ = great, 2★ = good, 1★ = keep practicing. Every attempt shows at least 1 star with encouraging copy — never an empty/failed-looking result, never a red X, never the raw Azure 0-100 score. A 1-star result still uses positive framing ("Keep practicing!" not "Poor"/"Failed").

### Calibration (PRON-03)
- **D-04:** Score-band thresholds (what Azure score maps to 1★/2★/3★) are validated by a **manual spot-check**: run Azure scoring against a sample of already-stored v1 audio from this app's own 6 students, the teacher/operator reviews raw scores against known student ability, and manually sets/adjusts thresholds before turning on student-facing display. This is a one-time calibration pass gating student visibility, not a permanent automated calibration feature.

### Teacher Diagnostic Panel
- **D-05:** The per-word pronunciation breakdown is a **collapsed/expandable section per turn**, added under each turn's existing transcript block on the evidence page (`src/app/teacher/evidence/[attemptId]/page.tsx`). Collapsed by default; teacher expands only when curious. Never displaces or auto-opens over the transcript — matches the existing on-demand audio-playback pattern (Phase 5 D-13/D-14: transcript-first, audio/detail on-demand).

### Data Storage
- **D-06 (from REQUIREMENTS PRON-06, confirmed in scope):** Pronunciation scores are stored in a dedicated `pronunciation_scores` table keyed on the audio clip (`audio_clips.id`), independent of `attempt_turns.evaluation` (different vendor, independently re-scorable without touching Phase 6's evaluation data).

### FERPA/COPPA Data-Use Note (PRON-02)
- **D-07:** Documentation is a **short markdown doc in the repo** (e.g. `.planning/azure-speech-data-use.md` or similar) summarizing: what's sent to Azure (short per-turn audio clip + target sentence text), Azure's data retention/training-use policy for the Pronunciation Assessment API, and confirmation no PII beyond the clip itself is transmitted. Internal record; must exist before any student audio is sent to Azure — this is a hard gate per PRON-02, not a nice-to-have.

### Backfill Scope
- **D-08:** **Forward-only, no backfill.** Only attempts completed after this phase ships get scored. Attempts completed before this phase are not retroactively scored; the teacher's diagnostic panel simply shows no pronunciation data (empty/not-yet-available state) for those older attempts. No bulk Azure-call backfill job.

### Pronunciation Feedback Coherence
- **D-09:** Pronunciation feedback must use a coherent **practice sentence**: the sentence shown to the student for retry, the sentence used as the Azure pronunciation reference, and the sentence containing the selected focus word/sound must align. The teacher's example answer is not the default pronunciation reference for valid alternate free-response answers. Meaning correction and pronunciation practice are separate. See `.planning/phases/09-pronunciation-scoring/09-PRONUNCIATION-FEEDBACK-DESIGN.md`.

### Claude's Discretion
- Exact Azure SDK integration approach, API call shape, and env var naming (following the existing `.env.example` pattern used for other vendor keys).
- Exact mapping from Azure's accuracy/fluency/completeness score dimensions into the 1-3 star scale — informed by D-04's manual calibration pass.
- Exact word-level highlight rendering within the collapsed teacher panel (color-coding, phoneme detail depth) — must remain additive and never inline-highlight the primary transcript text itself (that stays clean per D-05).
- Where exactly the `.env.example` / config entries and the data-use doc physically live, following existing repo conventions.
- Whether `pronunciation_scores` rows are created eagerly for every scored clip or lazily — implementation detail, does not change D-01's "scoring runs automatically inline" contract from the user's perspective.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Source Of Truth
- `.planning/ROADMAP.md` — Phase 9 goal, dependency on Phase 7 (stored audio, target/improved sentences, teacher review UI), requirements (PRON-01–06), success criteria, and the explicit research flag calling for empirical accuracy validation (not literature research) before score-band thresholds are finalized.
- `.planning/REQUIREMENTS.md` — Requirement definitions for PRON-01 through PRON-06.
- `.planning/STATE.md` — Current phase status; v2.0 milestone context (Coco Comes Alive), Phase 9 is v2.2 point release.
- `.planning/phases/09-pronunciation-scoring/09-05-CALIBRATION-NOTES.md` — Current 09-05 calibration checkpoint status: 12 pre-app homework samples scored, current threshold distribution recorded, explicit operator threshold approval still pending before 09-05 can close.

### Prior Phase Contracts
- `.planning/phases/07-teacher-review-and-pilot-readiness/07-CONTEXT.md` — Evidence page structure, on-demand/collapsed detail pattern (D-08, D-13 precedent), server-owned audited status transitions.
- `.planning/phases/05-voice-capture-and-evidence-storage/05-CONTEXT.md` — Audio storage contract: private `student-audio` Storage bucket, `audio_clips` table schema, teacher playback via signed URLs (D-13/D-14: transcript-first, on-demand, never autoplay), 30-day retention (`audio_expires_at`).
- `.planning/phases/06-ai-mission-and-turn-intelligence/06-CONTEXT.md` — Existing AI evaluation pipeline shape (where inline scoring per D-01 would hook in) and the qualitative-result vocabulary precedent.

### Existing Code (verified during scout)
- `supabase/migrations/202606250001_foundation_schema.sql` — `audio_clips` table (id, attempt_turn_id, clip_kind, object_key, processing_status, audio_expires_at) and `attempt_turns` table (original_transcript, improved_sentence, repeat_transcript, evaluation jsonb) — the join key and existing evaluation-data boundary that `pronunciation_scores` must stay independent of (D-06).
- `src/server/teacher/audio-evidence.ts` — `getAttemptEvidenceForTeacher()`, existing qualitative result mapping (`mapMeaningResult()` → `"Understood" | "Try again" | "Needs teacher check"`), the vocabulary precedent for D-03's star-band tone.
- `src/app/teacher/evidence/[attemptId]/page.tsx` (465 lines) — teacher evidence page; insertion point for the collapsed per-turn diagnostic panel (D-05).
- `src/components/teacher/AudioClipPlayer.tsx` — existing on-demand audio playback component; pattern to follow for "additive, collapsed, teacher-triggered" UI (D-05).
- `src/components/student/StepAiEvaluationFeedback.tsx` — student per-turn feedback step; insertion point for inline star feedback (D-02).
- `package.json` — `openai` (`^6.45.0`) is the only speech-related SDK currently installed (used for Whisper transcription per Phase 5 D-10); Azure Speech SDK is a new dependency this phase introduces.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `audio_clips.object_key` + private `student-audio` bucket + signed-URL pattern (Phase 5): Azure scoring reads the same stored clip via the same signed-URL/service-role access path — no new capture or storage mechanism needed.
- `mapMeaningResult()` / `mapRepeatResult()` qualitative-string pattern in `audio-evidence.ts`: direct precedent for mapping Azure's numeric score into the 1-3 star band with consistent tone.
- `AudioClipPlayer.tsx`'s collapsed/on-demand teacher-triggered pattern: reuse for the new per-word diagnostic section (D-05).

### Established Patterns
- Server-owned, audited computation: all scoring must be computed server-side (never trust a client-submitted score), consistent with how status transitions and AI evaluation already work.
- Transcript-first, additive-only teacher UI: every Phase 5/7 decision reinforces that new evidence/detail is added as on-demand/collapsed, never replacing or auto-surfacing over the transcript.
- Balanced, non-harsh correction tone: existing copy avoids "Failed"/red-X language; D-03 extends this explicitly to the star scale.

### Integration Points
- New `pronunciation_scores` table, migration, keyed on `audio_clips.id` (per PRON-06 / D-06).
- New Azure Speech Pronunciation Assessment adapter, likely alongside the existing Whisper transcription adapter/interface from Phase 5 (D-10 precedent: adapter behind an internal interface, testable/stubbable).
- Hook into the existing turn-completion / AI-evaluation pipeline (Phase 6) to trigger scoring inline (D-01).
- `StepAiEvaluationFeedback.tsx` (student) and `evidence/[attemptId]/page.tsx` (teacher) both need new but additive UI sections.

</code_context>

<specifics>
## Specific Ideas

- Star copy should read positively at every level — "Keep practicing!" for 1★, not "Poor" or a failure marker.
- The manual calibration spot-check (D-04) is explicitly framed as validating against *this app's own 6 real students*, not generic ESL benchmarks — the roadmap calls this out as an empirical-validation task, not literature research.
- Teacher diagnostic panel should feel like "one more thing to check if curious," not "here's a new grade" — collapsed by default is the enforcing mechanism for that framing.

</specifics>

<deferred>
## Deferred Ideas

- Backfilling pronunciation scores for pre-Phase-9 completed attempts — explicitly deferred (D-08); could be a future one-off script if the teacher wants historical data later.
- Automated/self-adjusting calibration (vs. the one-time manual spot-check in D-04) — out of scope; revisit only if score quality drifts or the student count grows significantly.
- Teacher-facing summary of the data-use note (vs. internal-only doc) — user chose internal doc only (D-07); a teacher-visible privacy summary was considered but not selected.

None of these affect Phase 9 planning.

</deferred>

---

*Phase: 09-pronunciation-scoring*
*Context gathered: 2026-07-02*
