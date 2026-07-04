# Per-student "sounds to work on" profile — design

**Date:** 2026-07-04
**Status:** Approved (brainstorming) — ready for implementation planning
**Builds on:** Phase 09 pronunciation-scoring (phoneme capture + per-clip `soundsToWorkOn`)

## Problem

Today, weak-phoneme diagnostics are **per-clip and in-the-moment**: on a single
attempt's evidence page a teacher sees "sounds to work on" for that one clip.
There is no **accumulated, per-student** view, so a teacher can't answer "which
sounds is this student *consistently* weak in?" across all their homework.

## Goal

Give a teacher a per-student profile of consistently-weak English sounds,
accumulated over all of that student's scored audio, surfaced on a new student
page reachable from the class page.

Non-goals (YAGNI): no rollup table, no student-facing view of this, no
cross-class or class-wide aggregation, no historical trend/timeline, no changes
to how per-clip `soundsToWorkOn` behaves.

## Key decisions (settled in brainstorming)

1. **Weakness metric — frequency + average.** For each phoneme, tally across all
   the student's attempted words: occurrence count, weak-occurrence count
   (accuracy < `PHONEME_WEAK_THRESHOLD` = 50), and average accuracy. Rank and
   surface sounds that are weak often / on average. This is "consistently weak,"
   not "one bad moment" — robust to a single bad clip.

2. **Bad-audio defense — minimum observations only.** A sound is not reported as
   a weakness until it has been observed in at least `MIN_PHONEME_OBSERVATIONS`
   attempted words across the student's history. This is the sole guard against
   the known caveat (a ⭐1 bad-audio clip shows many sounds near-zero). We do NOT
   exclude low-star clips — a genuinely struggling student's real attempts are
   often ⭐1, and discarding them would hide real weaknesses. If min-observations
   proves insufficient in practice, a star/quality gate can be added later.

3. **Read-time aggregation, no rollup table.** A server query gathers one
   student's `word_scores` (+ `reference_text`) across all their scored clips and
   feeds a pure domain aggregator. No migration, no new write sites. This is
   correct for the data volume (elementary-class scale: tens of students, a
   handful of assignments each — hundreds of rows). Promotable to a rollup table
   later if it's ever slow; that would be a mechanical change.

4. **Transcript-scoping preserved per-clip (correctness must).** Azure scores
   against the mission's target sentence, not what the student said. The existing
   per-clip logic only counts phonemes from words present in the clip's
   `reference_text` transcript. The accumulated profile applies this filter
   **clip-by-clip** before tallying — a word counts only for the clip(s) where the
   student actually said it. Skipping this would re-introduce phantom sounds from
   target-sentence vocabulary the student never uttered. See project memory
   "Words-to-practice source bug."

5. **Surface — new `/teacher/students/[id]` page + a Students section on the
   existing class page.** The class page (`/teacher/classes/[id]`) already lists
   assignments; we add a "Students" section (roster is already loaded there via
   `listRoster`) where each student links to their new detail page. The detail
   page shows a minimal header (name, class, attempt/clip count) and the
   weak-sounds profile. No new class-landing route is needed.

## Architecture — three pieces

### 1. Domain (pure) — `src/domain/pronunciation/scoring.ts`

Add a per-student aggregator alongside the existing per-clip `soundsToWorkOn`,
reusing `normalizePhoneme`, `phonemeLabel`, `tokenizeWords`, `normalizeWord`,
and `PHONEME_WEAK_THRESHOLD`.

```ts
export type StudentClipScore = {
  /** All word scores Azure returned for the clip. */
  wordScores: WordScore[];
  /** The clip's transcript for scoping ("what the student said"). */
  transcript: string;
};

export type StudentSoundWeakness = {
  label: string;          // "th"
  ipa: string;            // "θ"
  weakCount: number;      // attempted words w/ this phoneme scoring < threshold
  totalCount: number;     // attempted words containing this phoneme
  averageAccuracy: number; // mean accuracy across all its occurrences (0-100)
  exampleWord: string;    // a real word the student said where it scored weak
};

export const MIN_PHONEME_OBSERVATIONS = 5;

export function studentSoundProfile(
  clips: StudentClipScore[],
): StudentSoundWeakness[];
```

Behavior:
- For each clip, tokenize `transcript`; consider only word scores whose word is
  in that clip's spoken-word set (per-clip scoping — decision 4).
- For each in-scope word's phonemes, accumulate per normalized phoneme key:
  `totalCount++`, `sumAccuracy += accuracyScore`, and if
  `accuracyScore < PHONEME_WEAK_THRESHOLD` then `weakCount++` and remember the
  lowest-scoring occurrence's word as `exampleWord`.
- After tallying: drop phonemes with `totalCount < MIN_PHONEME_OBSERVATIONS`
  (decision 2). Compute `averageAccuracy = sumAccuracy / totalCount`.
- Keep only phonemes that are actually weak (at least one weak occurrence, i.e.
  `weakCount > 0`). Rank by weakness — primary `weakCount / totalCount` (weak
  ratio) desc, tiebreak `averageAccuracy` asc — and cap at
  `MAX_SOUNDS_TO_WORK_ON` (reuse existing constant = 5).

Pure, no server imports — same contract as the rest of this file.

### 2. Server — `src/server/teacher/audio-evidence.ts` (or a sibling module)

Add a function that, given a `studentId`, gathers that student's scored clips and
returns the profile:

```ts
export async function getStudentSoundProfile(
  studentId: string,
): Promise<StudentSoundWeakness[]>;
```

- Query `pronunciation_scores` joined down to the student (the 4 join-hops:
  `pronunciation_scores → audio_clips → attempt_turns → attempts →
  assignment_students.student_id`), selecting `word_scores` (jsonb) and the
  clip's `reference_text` for each row. Scope to `original_answer` clips where
  `reference_text` is the student's own transcript (repeat-attempt clips'
  `reference_text` is the target sentence — wrong scope for "what they said").
- Runs under RLS / existing teacher-ownership helpers so a teacher only sees
  their own students' data.
- Parse each row's `word_scores` with the existing `parseWordScores`; build
  `StudentClipScore[]`; call `studentSoundProfile`. Return the result.
- Also expose a lightweight count (clips/attempts scored) for the page header.

### 3. UI

**New page — `src/app/teacher/students/[id]/page.tsx`:**
- `force-dynamic`, gated by `requireTeacherProfile`, loads under RLS (a student in
  another teacher's class resolves to `notFound`).
- Minimal header: student name, class name, count of scored attempts.
- Weak-sounds profile: one row/chip per `StudentSoundWeakness` showing the label
  + IPA, the frequency/average detail ("weak in 8 of 12 words, avg 34"), and the
  example word. Empty state when the profile is empty (no weaknesses past the
  min-observations gate yet) — friendly "not enough data yet / no consistent weak
  sounds" copy, not an error.
- Visual style matches the existing evidence / class pages (inline styles, same
  palette).

**Existing class page — `src/app/teacher/classes/[id]/page.tsx`:**
- Add a "Students" section listing the already-loaded roster; each student name
  links to `/teacher/students/${student.id}`. Keep the existing Assignments
  section. (Optional: rename the H1 from "— Assignment Review" to just the class
  name now that the page hosts both, if it reads better.)

## Data flow

```
class page ──click student──▶ /teacher/students/[id]
                                      │
                          getStudentSoundProfile(studentId)
                                      │
        pronunciation_scores ⋈ … ⋈ assignment_students   (RLS-scoped, original_answer)
                                      │  rows: { word_scores, reference_text }
                                      ▼
                parseWordScores → StudentClipScore[]
                                      ▼
                studentSoundProfile(clips)   (pure: per-clip scope, tally,
                                              min-obs gate, rank, cap)
                                      ▼
                    StudentSoundWeakness[]  ──▶ profile UI
```

## Error / edge handling

- **Student with no scored audio:** empty `clips` → empty profile → friendly empty
  state.
- **All observations below min-observations:** phonemes dropped by the gate →
  empty profile → same empty state (this is the correct, honest outcome).
- **Older score rows without `phonemes`:** already `phonemes?` optional; such
  words contribute nothing to the tally (no crash), consistent with per-clip.
- **Bad-audio ⭐1 clips:** their scores are included but can only brand a sound as
  weak once that sound clears the min-observations gate across the student's
  history (decision 2).
- **Cross-teacher access:** blocked by RLS; page resolves to `notFound`.

## Testing (TDD — extend the existing pure-domain suite)

`tests/domain/pronunciation-scoring.test.ts`, mirroring the existing
`soundsToWorkOn` tests:
- tally: frequency + average computed correctly across multiple clips.
- **per-clip transcript scoping:** a target-sentence word the student never said
  in any clip contributes nothing; a word said in one clip but not another counts
  only for the clip where it appears.
- **min-observations gate:** a phoneme with `totalCount < MIN` is excluded even if
  every occurrence was weak; the same phoneme appears once it clears the gate.
- ranking + cap at `MAX_SOUNDS_TO_WORK_ON`.
- empty inputs / words without `phonemes` → `[]`, no throw.

Server test (`tests/server/audio-evidence.test.ts` or sibling): the query scopes
to `original_answer`, parses `word_scores`, and returns the aggregated profile
(reuse the existing real-data fixtures / the re-scored clips noted in the
handoff).

## Out of scope / follow-ups

- Rollup table (`student_phoneme_stats`) — only if read-time proves slow.
- Star/quality gate on clips — only if min-observations over-reports in practice.
- Student-facing view, trends over time, class-wide sound summary.
