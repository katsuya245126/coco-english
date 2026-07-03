---
phase: 09-pronunciation-scoring
plan: 05
subsystem: api
tags: [azure-speech, pronunciation-scoring, teacher-evidence, calibration, vitest]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring (plan 02)
    provides: live pronunciation_scores table with RLS, keyed on audio_clip_id
  - phase: 09-pronunciation-scoring (plan 03)
    provides: scorePronunciation adapter + scoreToStarBand domain mapping
  - phase: 09-pronunciation-scoring (plan 04)
    provides: live pronunciation_scores rows written inline on scored turn upload
provides:
  - Teacher per-word pronunciation diagnostic panel (additive, collapsed-by-default, transcript-first preserved)
  - D-04 calibration gate cleared — star band derived from an accuracy-led 60/40 accuracy/fluency blend, operator sign-off recorded
affects: [09-06 (student-facing stars — now unblocked)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Star band is derived from computeBandScore(accuracy, fluency), not Azure's raw PronNScore; thresholds unchanged (80/60), only the input to them changed"
    - "Weighting lives in a single named constant (STAR_BAND_WEIGHTS 0.6/0.4) next to STAR_BAND_THRESHOLDS so it is tunable with a one-line edit + calibration re-run"

key-files:
  created:
    - src/components/teacher/PronunciationDiagnosticPanel.tsx
  modified:
    - src/domain/pronunciation/scoring.ts
    - src/server/audio/pronunciation-scorer.ts
    - src/server/teacher/audio-evidence.ts
    - src/app/teacher/evidence/[attemptId]/page.tsx
    - tests/domain/pronunciation-scoring.test.ts
    - tests/server/pronunciation-scorer.test.ts
    - .planning/phases/09-pronunciation-scoring/09-05-CALIBRATION-NOTES.md

key-decisions:
  - "D-04 calibration (2026-07-03): operator scored 12 real pre-app student homework samples against Azure, listened to representative/borderline samples, and approved the band logic before any student-facing star ships."
  - "Star band derives from bandScore = 0.6*accuracyScore + 0.4*fluencyScore (accuracy-led), falling back to accuracy alone when fluency is unavailable. Azure's default blend let low fluency sink an accurate read to 1 star — the exact over-penalization PRON-03 guards against for young non-native drill homework."
  - "Thresholds left at great>=80 / good>=60; only the value fed into them changed. Effect on the 12 calibration samples: distribution 2/7/3 -> 2/9/1; only a genuinely unintelligible read stays at 1 star."
  - "Raw pronunciationScore is still stored untouched as teacher diagnostic detail; the no-raw-score stance (PRON-04) is unaffected — students never see the number."

patterns-established:
  - "computeBandScore is the single choke point translating sub-scores into the banded input; future weighting/threshold changes happen there and are re-validated via the calibration script"

requirements-completed: [PRON-03, PRON-05]

# Metrics
completed: 2026-07-03
status: complete
---

# Phase 9 Plan 5: Teacher diagnostic panel + D-04 calibration gate Summary

**Teachers now see an additive, collapsed-by-default per-word pronunciation breakdown under each turn without displacing the transcript-first review, and the D-04 calibration gate is cleared: the operator scored 12 real pre-app student homework recordings against Azure, listened to the borderline samples, and approved an accuracy-led 60/40 accuracy/fluency band blend — shifting the 12-sample distribution from 2/7/3 to 2/9/1 so only a genuinely unintelligible read lands at 1 star.**

## Calibration detail

- Local artifacts (not committed — derived from student audio): `~/Downloads/calibration-samples/calibration-report.{md,json}`.
- Decision recorded in `09-05-CALIBRATION-NOTES.md` (status: APPROVED).
- The over-penalization case that drove the change: `student 2 - sample 3`, accuracy 85 / fluency 40 -> Azure raw 58.8 -> would have been 1 star; the 60/40 blend lifts it to 2 stars, which the operator confirmed by ear.

## Follow-ups

- 09-06 (inline student star band, no raw score) is now unblocked.
- Weighting is tunable: change `STAR_BAND_WEIGHTS` in `src/domain/pronunciation/scoring.ts` and re-run the calibration script before it reaches students.
