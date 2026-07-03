# Phase 09 Plan 05 Calibration Notes

**Date:** 2026-07-03
**Status:** Calibration sample report generated; threshold approval pending

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

## Pending Human Decision

The 09-05 calibration checkpoint is **not approved yet**.

The operator still needs to review/listen to representative samples and choose
one of:

1. Approve current thresholds: `great >= 80`, `good >= 60`.
2. Lower `good` slightly, for example to `55`, if the 58-ish samples feel too
   harsh as 1 star.
3. Adjust both thresholds if the teacher judgment disagrees with the star bands.

Do not create `09-05-SUMMARY.md` or proceed to 09-06 student-facing stars until
the operator explicitly approves the calibration threshold decision.
