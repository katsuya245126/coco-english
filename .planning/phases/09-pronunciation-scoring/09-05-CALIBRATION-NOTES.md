# Phase 09 Plan 05 Calibration Notes

**Date:** 2026-07-03
**Status:** APPROVED — operator listened to representative samples and signed off on the 60/40 accuracy/fluency band weighting (D-04 gate cleared).

## What Was Run

The operator provided 12 pre-app homework recording samples from KakaoTalk-era
homework, each with a matching reference-text file:

- 9 `.m4a` samples
- 3 `.amr` samples

The samples were scored locally against Azure Speech Pronunciation Assessment
using the same Azure Speech resource configured for Phase 09. The scoring pass
sent only the local audio clip and its matching reference text to Azure.

Generated local reports:

- `/Users/john/Downloads/calibration-samples/calibration-report.md`
- `/Users/john/Downloads/calibration-samples/calibration-report.json`

These reports are local calibration artifacts and are not committed into the
repo because they are derived from student homework audio.

## Current Thresholds Evaluated

Current `STAR_BAND_THRESHOLDS` in `src/domain/pronunciation/scoring.ts`:

```ts
great: 80,
good: 60,
```

Meaning:

- `3 stars`: pronunciation score >= 80
- `2 stars`: pronunciation score >= 60 and < 80
- `1 star`: pronunciation score < 60

## Results

All 12 samples scored successfully after switching the calibration runner to
read the raw Azure JSON response fields directly.

Score distribution with current thresholds:

| Star band | Count |
|---|---:|
| 3 stars | 2 |
| 2 stars | 7 |
| 1 star | 3 |

Sorted pronunciation scores:

```text
39.6, 58.2, 58.8, 60.0, 61.2, 65.6, 67.8, 69.4, 74.2, 75.0, 83.0, 90.4
```

Initial read:

- The current thresholds do not appear obviously too harsh from the score
  distribution alone.
- The two strongest samples landed at 3 stars.
- Most samples landed at 2 stars.
- Three samples landed at 1 star, all near or below the current `good >= 60`
  boundary except one clearly low sample at 39.6.

## Implementation Note Found During Calibration

The Azure SDK helper `PronunciationAssessmentResult.fromResult(result)` failed
on several longer phrase-list samples with `throwIfNullOrUndefined:json`, even
though Azure returned valid raw JSON with pronunciation scores and phoneme data.

The calibration report was therefore generated from the raw Azure JSON response
fields:

- `NBest[0].PronunciationAssessment`
- `NBest[0].Words`
- `Words[].Phonemes`

This supports the saved D-09/fine-grained feedback direction and should be
considered when implementing phoneme-level parsing.

## Decision (D-04 gate cleared, 2026-07-03)

The operator listened to representative samples — including the borderline
`student 2 - sample 3` (accuracy 85 / fluency 40) — and confirmed the outcome.

**Approved change:** the star band is now derived from an accuracy-led blend
rather than Azure's raw `PronNScore`. Thresholds are unchanged (`great >= 80`,
`good >= 60`); the *input* to those thresholds is now:

```
bandScore = 0.6 * accuracyScore + 0.4 * fluencyScore
```

(falls back to accuracy alone when fluency is unavailable).

**Rationale:** Azure's default blend let a very low fluency drag an accurate
read into the 1-star "you failed" band — the exact over-penalization PRON-03
guards against. For young non-native kids doing drill homework, accuracy is the
lesson and fluency mostly reflects reading pace/nerves, so accuracy leads while
fluency still counts.

**Effect on the 12 calibration samples:** distribution shifts from `2/7/3` to
`2/9/1`. Only the genuinely unintelligible read (`student 2 - sample 1`, acc 52
/ flu 32) stays at 1 star; the well-pronounced-but-halting samples move to 2
stars.

**Implemented in:**

- `src/domain/pronunciation/scoring.ts` — `STAR_BAND_WEIGHTS` (0.6 / 0.4) and
  `computeBandScore(accuracy, fluency)`.
- `src/server/audio/pronunciation-scorer.ts` — bands off `computeBandScore(...)`;
  raw `pronunciationScore` still stored as teacher diagnostic detail.

**Tunable later:** change `STAR_BAND_WEIGHTS` (or the thresholds) and re-run the
calibration script to re-check the distribution before it reaches students.

09-06 student-facing stars are now unblocked.
