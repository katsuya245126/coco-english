# Phase 9: Pronunciation Scoring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 09-pronunciation-scoring
**Areas discussed:** Scoring trigger, Student surfacing, Band scale, Teacher panel, Star scale detail, Calibration approach, Data-use note format, Backfill scope

---

## Scoring Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic, same time as AI evaluation | Score every completed turn's audio right after Whisper transcription / AI evaluation runs | ✓ |
| Automatic, but deferred/batched | Queue scoring shortly after attempt completion, not inline | |
| On-demand only | Only score when a teacher opens the diagnostic panel for the first time | |

**User's choice:** Automatic, same time as AI evaluation (Recommended option).
**Notes:** Matches the existing "evidence is already there" expectation from prior phases.

---

## Student Surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on the existing feedback step | Add pronunciation bands/stars to StepAiEvaluationFeedback.tsx alongside existing meaning/target-pattern feedback | ✓ |
| Separate mini-step after existing feedback | A distinct short screen just for pronunciation | |
| End-of-mission summary only | Aggregate summary once at the end, no per-turn interruption | |

**User's choice:** Inline on the existing feedback step (Recommended option).
**Notes:** One unified feedback moment rather than fragmenting the per-turn flow.

---

## Band Scale

| Option | Description | Selected |
|--------|-------------|----------|
| 3-band scale: Great / Good / Keep practicing | Mirrors existing 3-state vocabulary pattern | |
| Star rating (e.g. 1-3 or 1-5 stars) | Visual star count, game-like, kid-friendly | ✓ |
| Let Claude decide based on research | Defer exact band design until research shows Azure's available score dimensions | |

**User's choice:** Star rating.
**Notes:** Followed up immediately with a second question to pin down exact scale size (see "Star Scale Detail" below) — user's initial pick of star rating over the 3-band word scale was itself a clear preference, but needed one more round to lock star count and low-score handling.

---

## Teacher Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed/expandable section per turn | Added under each turn's existing transcript block, teacher expands on demand | ✓ |
| Always-visible inline word highlighting | Per-word color/underline highlighting directly inline with transcript text | |
| Separate diagnostic tab/section | Distinct tab/page aggregating pronunciation detail across the whole attempt | |

**User's choice:** Collapsed/expandable section per turn (Recommended option).
**Notes:** Matches the existing on-demand audio-playback pattern (Phase 5 D-13/D-14) — never displaces the transcript.

---

## Star Scale Detail

| Option | Description | Selected |
|--------|-------------|----------|
| 1-3 stars, always shown | Matches existing 3-state pattern; 1-star still uses encouraging language, never a red X | ✓ |
| 1-5 stars, always shown | Finer-grained scale, more differentiation | |
| 1-3 stars, explicit floor + encouragement guarantee | Same 3-level scale with explicit guarantee of never showing 0 stars/empty | |

**User's choice:** 1-3 stars, always shown (Recommended option).
**Notes:** Every attempt shows at least 1 star; copy stays positive at every level ("Keep practicing!" not "Poor"/"Failed").

---

## Calibration Approach (PRON-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Manual spot-check by the teacher/operator | Run Azure scoring against a sample of stored v1 audio, operator manually reviews and sets thresholds | ✓ |
| Build a small internal calibration script/report | One-off script producing a full report (score distributions, sample transcripts) before picking thresholds | |
| Let Claude decide during planning/research | Defer tooling approach to research; requirement is locked, mechanism is not | |

**User's choice:** Manual spot-check by the teacher/operator (Recommended option).
**Notes:** One-time gate before student-facing display goes live, not a permanent calibration feature.

---

## Data-Use Note Format (PRON-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Short markdown doc in the repo | Internal doc summarizing what's sent to Azure, Azure's retention/training policy, PII confirmation | ✓ |
| Doc + teacher-facing summary | Same internal doc plus a short teacher-facing note in a settings/about page or README | |

**User's choice:** Short markdown doc in the repo (Recommended option).
**Notes:** Internal record only; must exist before any student audio is sent to Azure (hard gate, not optional).

---

## Backfill Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-only, no backfill | Only new attempts after ship get scored; older attempts show empty/not-yet-available panel | ✓ |
| Backfill existing stored audio too | Also score already-completed attempts within the 30-day retention window | |

**User's choice:** Forward-only, no backfill (Recommended option).
**Notes:** Avoids a bulk Azure-call backfill job; simplest rollout.

---

## Claude's Discretion

- Exact Azure SDK integration approach, API call shape, and env var naming.
- Exact mapping from Azure's accuracy/fluency/completeness score dimensions into the 1-3 star scale (informed by the manual calibration pass).
- Exact word-level highlight rendering within the collapsed teacher panel (color-coding, phoneme detail depth).
- Where exactly the `.env.example` / config entries and the data-use doc physically live.
- Whether `pronunciation_scores` rows are created eagerly or lazily.

## Deferred Ideas

- Backfilling pronunciation scores for pre-Phase-9 completed attempts.
- Automated/self-adjusting calibration vs. the one-time manual spot-check.
- Teacher-facing summary of the data-use note (vs. internal-only doc).
