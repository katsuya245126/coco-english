# Phase 06 — UI Review

**Audited:** 2026-06-30
**Baseline:** 06-UI-SPEC.md
**Method:** Code-only audit (no dev server)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Six contracted strings diverge from UI-SPEC; critical student headings and CTAs are wrong |
| 2. Visuals | 3/4 | `reviewPending` heading uses `fontSize: 24` (undeclared); non-English outcome missing body text |
| 3. Color | 3/4 | Countdown bar uses `#EF4444` (not in spec); spec destructive color is `#B42318` |
| 4. Typography | 2/4 | `fontSize: 13`, `15`, and `24` used — all off the 4-size scale (14/16/20/28) |
| 5. Spacing | 3/4 | `summaryStyle` and `turnCardStyle` use `padding: 20` — not in spacing scale |
| 6. Experience Design | 3/4 | `repeatRetry` falls to generic fallback; spec-required two-part message absent |

**Overall: 16/24**

---

## Priority Fixes

### 1. Copy divergences in StepAiEvaluationFeedback.tsx (Pillar 1)

| Outcome | Spec string | Actual string |
|---|---|---|
| `acceptedOriginal` heading | "Nice answer!" | "Great!" |
| `acceptedOriginal` body | "You used the English practice well. Let's keep going." | Missing |
| `acceptedOriginal` CTA | "Continue mission" | "Next" |
| `needsCorrection` heading | "Nice try! Here is a clearer way to say it:" | "Better way to say it:" |
| `needsCorrection` body | "Now repeat this sentence." | "Now say it out loud." |
| `retryOriginal` heading | "Try that in English." | "Please say it in English." |
| `retryOriginal` body | "Record your answer again using English." | Missing |
| `teacherReview` heading | "Your teacher will check this answer." | "Your teacher will check this." |
| `teacherReview` body | "Keep going. Your teacher can review this turn later." | Missing |
| `repeatAccepted` heading | "Good repeat." | "Great job!" |
| `repeatAccepted` CTA | "Continue practice" | "Next" |
| `repeatRetry` heading | "Try the repeat again." | Falls to generic "Try again." |
| `repeatRetry` body | "Listen to the sentence and record it one more time." | Missing |

### 2. repeatRetry has no explicit branch (Pillars 1 + 6)

`repeatRetry` falls through to the generic error fallback. The student sees only a de-emphasized underline "Record again" link with no instruction. Add an explicit branch with the correct heading, body, and a proper `onRetry` button.

### 3. Off-scale font sizes (Pillar 4)

Spec declares 4 sizes only: 14 (Label), 16 (Body), 20 (Heading), 28 (Display).

- `annotationLabelStyle` → `fontSize: 13` → fix to 14
- Annotation value cells → `fontSize: 15` → fix to 16
- `reviewPending` heading in MissionFlowShell → `fontSize: 24` → fix to 20

### 4. Countdown bar color (Pillar 3)

`#EF4444` is not in the design system. Spec destructive color is `#B42318`. Change in `VoiceRecorderControl.tsx`.

### 5. Off-scale padding in teacher evidence page (Pillar 5)

`summaryStyle` and `turnCardStyle` both use `padding: 20`. Spec scale: 16 (md) or 24 (lg). Change to 24.

---

## Passing

- Teacher-side copy (MissionDraftPanel) matches spec exactly
- Teacher evidence review reason labels all match spec
- Evaluation outcome color tokens correct (`evaluationSuccessStyle`, `evaluationReviewStyle`, `evaluationErrorStyle`)
- `#2563EB` accent used correctly throughout
- Student component spacing spec-compliant (24/16 scale)
- Loading states, error states, aria-live, role="alert" all correct
- No raw AI JSON, confidence scores, or model names in rendered output
- Teacher-review routing correct — does not call completeMissionAction
