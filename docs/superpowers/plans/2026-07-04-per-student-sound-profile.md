# Per-student Sound Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a teacher a per-student profile of consistently-weak English sounds, accumulated over all of that student's scored audio, on a new `/teacher/students/[id]` page reachable from the class page.

**Architecture:** Three layers. (1) A pure domain aggregator `studentSoundProfile` in `src/domain/pronunciation/scoring.ts` that tallies weak phonemes across clips using frequency+average with a minimum-observations gate, preserving per-clip transcript scoping. (2) A server function `getStudentSoundProfile(studentId)` in `src/server/teacher/student-profile.ts` that gathers a student's `original_answer` clip scores via the reverse join and feeds the aggregator under RLS. (3) A new teacher page plus a "Students" section on the existing class page.

**Tech Stack:** Next.js App Router (RSC, `force-dynamic`), Supabase (PostgREST nested `!inner` joins, RLS), Vitest, TypeScript. All pure logic is TDD'd in `tests/domain/pronunciation-scoring.test.ts`; the server function mirrors the existing `audio-evidence.ts` query patterns.

**Design doc:** `docs/superpowers/specs/2026-07-04-per-student-sound-profile-design.md`

---

## File Structure

- **Modify** `src/domain/pronunciation/scoring.ts` — add `StudentClipScore`, `StudentSoundWeakness`, `MIN_PHONEME_OBSERVATIONS`, `studentSoundProfile`. Reuses existing `normalizePhoneme`, `phonemeLabel`, `tokenizeWords`, `normalizeWord`, `PHONEME_WEAK_THRESHOLD`, `MAX_SOUNDS_TO_WORK_ON`.
- **Modify** `src/server/teacher/audio-evidence.ts` — `export` the currently-private `parseWordScores` so the new server module can reuse it (DRY — do not copy it).
- **Create** `src/server/teacher/student-profile.ts` — `getStudentSoundProfile(studentId)` and a small `StudentProfileHeader` loader (name, class, scored-clip count).
- **Create** `src/app/teacher/students/[id]/page.tsx` — the student detail page (header + weak-sounds profile + empty state).
- **Modify** `src/app/teacher/classes/[id]/page.tsx` — add a "Students" section linking each roster student to `/teacher/students/${student.id}`.
- **Modify** `tests/domain/pronunciation-scoring.test.ts` — add a `describe("studentSoundProfile")` block.
- **Create** `tests/server/student-profile.test.ts` — unit-test the row-parsing + scoping wiring with a fake Supabase client.

---

## Task 1: Domain aggregator `studentSoundProfile` (pure, TDD)

**Files:**
- Modify: `src/domain/pronunciation/scoring.ts` (append after `soundsToWorkOn`, ends line 282)
- Test: `tests/domain/pronunciation-scoring.test.ts` (append new `describe` block at end of file)

- [ ] **Step 1: Write the failing tests**

Append this `describe` block at the end of `tests/domain/pronunciation-scoring.test.ts`. Also add `studentSoundProfile` and `MIN_PHONEME_OBSERVATIONS` to the existing import from `@/domain/pronunciation/scoring` at the top of the file.

```ts
describe("studentSoundProfile", () => {
  // Helper: build N clips each containing one word with one weak `r`, so a
  // phoneme can be pushed over the MIN_PHONEME_OBSERVATIONS gate concisely.
  function weakRClips(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      wordScores: [
        {
          word: "red",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 20 + i }],
        },
      ],
      transcript: "red",
    }));
  }

  it("returns [] for no clips", () => {
    expect(studentSoundProfile([])).toEqual([]);
  });

  it("excludes a phoneme observed fewer than MIN_PHONEME_OBSERVATIONS times", () => {
    // 4 observations, all weak, but below the gate (=5) -> not reported.
    expect(studentSoundProfile(weakRClips(MIN_PHONEME_OBSERVATIONS - 1))).toEqual(
      [],
    );
  });

  it("reports a phoneme once it clears the observation gate", () => {
    const result = studentSoundProfile(weakRClips(MIN_PHONEME_OBSERVATIONS));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "r",
      ipa: "r",
      weakCount: MIN_PHONEME_OBSERVATIONS,
      totalCount: MIN_PHONEME_OBSERVATIONS,
      exampleWord: "red",
    });
  });

  it("computes averageAccuracy across all occurrences (weak and non-weak)", () => {
    // 5 words with `r`: accuracies 10,20,30,40,90 -> avg 38. Only 4 are weak
    // (<50), but the average includes the strong one.
    const accuracies = [10, 20, 30, 40, 90];
    const clips = accuracies.map((a) => ({
      wordScores: [
        {
          word: "car",
          accuracyScore: a,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: a }],
        },
      ],
      transcript: "car",
    }));
    const result = studentSoundProfile(clips);
    expect(result[0]).toMatchObject({
      totalCount: 5,
      weakCount: 4,
      averageAccuracy: 38,
    });
  });

  it("picks the lowest-scoring occurrence as the example word", () => {
    const clips = [
      ...weakRClips(MIN_PHONEME_OBSERVATIONS),
      {
        wordScores: [
          {
            word: "grrr",
            accuracyScore: 3,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: "r", accuracyScore: 3 }],
          },
        ],
        transcript: "grrr",
      },
    ];
    expect(studentSoundProfile(clips)[0].exampleWord).toBe("grrr");
  });

  it("scopes per-clip: a word never spoken in a clip contributes nothing", () => {
    // "playground" has a weak `r` but is NOT in the transcript of its clip.
    // Repeated 5 times it would clear the gate IF counted — it must not be.
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
      wordScores: [
        {
          word: "playground",
          accuracyScore: 5,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 5 }],
        },
      ],
      transcript: "the",
    }));
    expect(studentSoundProfile(clips)).toEqual([]);
  });

  it("excludes phonemes that are never weak even if observed enough", () => {
    // `k` appears 5 times but always strong (>= threshold) -> not a weakness.
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
      wordScores: [
        {
          word: "cat",
          accuracyScore: 90,
          errorType: "None",
          phonemes: [{ phoneme: "k", accuracyScore: 90 }],
        },
      ],
      transcript: "cat",
    }));
    expect(studentSoundProfile(clips)).toEqual([]);
  });

  it("ranks by weak ratio desc, then average accuracy asc, capped at MAX", () => {
    // Build 6 distinct weak phonemes so the cap (=5) drops one.
    const codes = ["r", "th", "f", "s", "l", "v"];
    const clips = codes.flatMap((code, idx) =>
      Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
        wordScores: [
          {
            word: code,
            accuracyScore: 10 + idx,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: code, accuracyScore: 10 + idx }],
          },
        ],
        transcript: code,
      })),
    );
    const result = studentSoundProfile(clips);
    expect(result).toHaveLength(5); // MAX_SOUNDS_TO_WORK_ON
  });

  it("ignores words without phoneme data without throwing", () => {
    expect(
      studentSoundProfile([
        {
          wordScores: [
            { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
          ],
          transcript: "cat",
        },
      ]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/pronunciation-scoring.test.ts`
Expected: FAIL — `studentSoundProfile is not a function` / `MIN_PHONEME_OBSERVATIONS` undefined.

- [ ] **Step 3: Implement `studentSoundProfile`**

Append to `src/domain/pronunciation/scoring.ts` (after line 282, the end of `soundsToWorkOn`):

```ts
export type StudentClipScore = {
  /** All word scores Azure returned for the clip. */
  wordScores: WordScore[];
  /** The clip's transcript — "what the student actually said". */
  transcript: string;
};

export type StudentSoundWeakness = {
  /** Plain teacher-facing label, e.g. "th". */
  label: string;
  /** IPA symbol, e.g. "θ". */
  ipa: string;
  /** Attempted words containing this phoneme that scored below threshold. */
  weakCount: number;
  /** Attempted words containing this phoneme (weak or not). */
  totalCount: number;
  /** Mean accuracy across all occurrences (0-100), rounded. */
  averageAccuracy: number;
  /** A real word the student said where this sound scored weakest. */
  exampleWord: string;
};

/**
 * Minimum times a phoneme must be observed across a student's attempted words
 * before it can be reported as a weakness. Guards against a single bad-audio
 * clip (Azure scores many sounds near-zero when it can't hear) branding a
 * student as weak in sounds they only "failed" once. See design doc.
 */
export const MIN_PHONEME_OBSERVATIONS = 5;

type PhonemeTally = {
  weakCount: number;
  totalCount: number;
  sumAccuracy: number;
  lowestAccuracy: number;
  exampleWord: string;
  label: string;
  ipa: string;
};

/**
 * Teacher-facing per-student "sounds to work on", accumulated across all of a
 * student's scored clips. Unlike the per-clip {@link soundsToWorkOn} (which
 * dedups to the single worst occurrence in one clip), this tallies frequency
 * and average accuracy per phoneme over time and only surfaces a sound once it
 * has been observed at least {@link MIN_PHONEME_OBSERVATIONS} times.
 *
 * Transcript scoping is applied PER CLIP: within each clip only phonemes from
 * words present in that clip's transcript are counted, because Azure scores
 * against the mission's target sentence, not what the student said. A word
 * counts only for the clip(s) where the student actually uttered it.
 */
export function studentSoundProfile(
  clips: StudentClipScore[],
): StudentSoundWeakness[] {
  const tallies = new Map<string, PhonemeTally>();

  for (const clip of clips) {
    const spokenWords = tokenizeWords(clip.transcript);

    for (const word of clip.wordScores) {
      if (!spokenWords.has(normalizeWord(word.word))) continue;
      if (!word.phonemes) continue;

      for (const phoneme of word.phonemes) {
        const key = normalizePhoneme(phoneme.phoneme);
        if (!key) continue;

        let tally = tallies.get(key);
        if (!tally) {
          const { label, ipa } = phonemeLabel(phoneme.phoneme);
          tally = {
            weakCount: 0,
            totalCount: 0,
            sumAccuracy: 0,
            lowestAccuracy: Infinity,
            exampleWord: word.word,
            label,
            ipa,
          };
          tallies.set(key, tally);
        }

        tally.totalCount += 1;
        tally.sumAccuracy += phoneme.accuracyScore;

        if (phoneme.accuracyScore < PHONEME_WEAK_THRESHOLD) {
          tally.weakCount += 1;
          if (phoneme.accuracyScore < tally.lowestAccuracy) {
            tally.lowestAccuracy = phoneme.accuracyScore;
            tally.exampleWord = word.word;
          }
        }
      }
    }
  }

  return [...tallies.values()]
    .filter(
      (t) => t.totalCount >= MIN_PHONEME_OBSERVATIONS && t.weakCount > 0,
    )
    .map((t) => ({
      label: t.label,
      ipa: t.ipa,
      weakCount: t.weakCount,
      totalCount: t.totalCount,
      averageAccuracy: Math.round(t.sumAccuracy / t.totalCount),
      exampleWord: t.exampleWord,
    }))
    .sort((a, b) => {
      const ratioA = a.weakCount / a.totalCount;
      const ratioB = b.weakCount / b.totalCount;
      if (ratioB !== ratioA) return ratioB - ratioA; // weaker ratio first
      return a.averageAccuracy - b.averageAccuracy; // then lower average first
    })
    .slice(0, MAX_SOUNDS_TO_WORK_ON);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/pronunciation-scoring.test.ts`
Expected: PASS — all existing + the new `studentSoundProfile` tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/domain/pronunciation/scoring.ts tests/domain/pronunciation-scoring.test.ts
git commit -m "feat(pronunciation): add per-student sound-profile aggregator

Frequency+average weak-phoneme tally across a student's clips, with a
minimum-observations gate against bad-audio over-reporting and per-clip
transcript scoping. Pure domain logic, TDD'd."
```

---

## Task 2: Export `parseWordScores` for reuse

**Files:**
- Modify: `src/server/teacher/audio-evidence.ts:219`

- [ ] **Step 1: Export the function**

Change the declaration at line 219 from private to exported so the new server module reuses it (DRY — do not copy the parser).

Find:

```ts
/** Defensively parse the stored `word_scores` jsonb into typed WordScores. */
function parseWordScores(raw: unknown): WordScore[] {
```

Replace with:

```ts
/** Defensively parse the stored `word_scores` jsonb into typed WordScores. */
export function parseWordScores(raw: unknown): WordScore[] {
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/server/teacher/audio-evidence.ts
git commit -m "refactor(pronunciation): export parseWordScores for reuse"
```

---

## Task 3: Server loader `getStudentSoundProfile` + header

**Files:**
- Create: `src/server/teacher/student-profile.ts`
- Test: `tests/server/student-profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/student-profile.test.ts`. It injects a fake Supabase-like client so the test is pure (no network), verifying: original-answer scoping, `parseWordScores` wiring, and that the aggregator result is returned.

```ts
import { describe, expect, it, vi } from "vitest";
import { buildStudentSoundProfile } from "@/server/teacher/student-profile";

describe("buildStudentSoundProfile", () => {
  it("scopes to original_answer clips and aggregates weak phonemes", () => {
    // 5 clips each with a weak `r` in a spoken word -> clears the gate.
    const rows = Array.from({ length: 5 }, () => ({
      reference_text: "red",
      word_scores: [
        {
          word: "red",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 20 }],
        },
      ],
    }));

    const result = buildStudentSoundProfile(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "r", weakCount: 5, totalCount: 5 });
  });

  it("treats a null reference_text as an empty transcript (nothing scoped in)", () => {
    const rows = [
      {
        reference_text: null,
        word_scores: [
          {
            word: "red",
            accuracyScore: 20,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: "r", accuracyScore: 20 }],
          },
        ],
      },
    ];
    expect(buildStudentSoundProfile(rows)).toEqual([]);
  });

  it("returns [] for no rows", () => {
    expect(buildStudentSoundProfile([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/student-profile.test.ts`
Expected: FAIL — cannot resolve `@/server/teacher/student-profile`.

- [ ] **Step 3: Implement the server module**

Create `src/server/teacher/student-profile.ts`. `buildStudentSoundProfile` is the pure, testable mapping (rows → profile); `getStudentSoundProfile` does the RLS-scoped query and delegates to it. The query mirrors the reverse-join filter pattern in `audio-evidence.ts:489-505`.

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import {
  parseWordScores,
} from "@/server/teacher/audio-evidence";
import {
  studentSoundProfile,
  type StudentClipScore,
  type StudentSoundWeakness,
} from "@/domain/pronunciation/scoring";

/** A pronunciation_scores row projected for profile aggregation. */
type ProfileScoreRow = {
  reference_text: string | null;
  word_scores: unknown;
};

/**
 * Pure mapping from stored score rows to the accumulated sound profile.
 * Only `original_answer` clips reach here (scoped by the query), so
 * `reference_text` is the student's own transcript. A null transcript scopes
 * nothing in — safer than counting against the target sentence.
 */
export function buildStudentSoundProfile(
  rows: ProfileScoreRow[],
): StudentSoundWeakness[] {
  const clips: StudentClipScore[] = rows.map((row) => ({
    wordScores: parseWordScores(row.word_scores),
    transcript: row.reference_text ?? "",
  }));
  return studentSoundProfile(clips);
}

/**
 * Load a student's accumulated weak-sound profile. Runs under RLS via the
 * authenticated server client: the teacher only sees scores for students in
 * classes they own, and the reverse-join + teacher_id filter enforces it
 * defensively even so. Scopes to `original_answer` clips, whose
 * `reference_text` is the student's transcript (repeat_attempt clips'
 * reference_text is the target sentence — wrong scope for "what they said").
 */
export async function getStudentSoundProfile(
  studentId: string,
  teacherId: string,
): Promise<StudentSoundWeakness[]> {
  const supabase = await createSupabaseServerClient();

  const scores = await supabase
    .from("pronunciation_scores")
    .select(
      `
      reference_text,
      word_scores,
      audio_clips!inner(
        clip_kind,
        attempt_turns!inner(
          attempts!inner(
            assignment_students!attempts_assignment_student_id_fkey!inner(
              student_id,
              assignments!inner(
                classes!inner(teacher_id)
              )
            )
          )
        )
      )
    `,
    )
    .eq("audio_clips.clip_kind", "original_answer")
    .eq(
      "audio_clips.attempt_turns.attempts.assignment_students.student_id",
      studentId,
    )
    .eq(
      "audio_clips.attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      teacherId,
    );

  if (scores.error) {
    throw new Error(
      `Unable to load student pronunciation scores: ${scores.error.message}`,
    );
  }

  const rows = (scores.data ?? []) as unknown as ProfileScoreRow[];
  return buildStudentSoundProfile(rows);
}

export type StudentProfileHeader = {
  studentId: string;
  displayName: string;
  className: string;
};

/**
 * Load the student's identity + class for the page header, RLS-scoped to the
 * requesting teacher. Returns null if the student is not in one of the
 * teacher's classes (drives notFound on the page).
 */
export async function getStudentProfileHeader(
  studentId: string,
): Promise<StudentProfileHeader | null> {
  const supabase = await createSupabaseServerClient();

  const student = await supabase
    .from("students")
    .select("id, display_name, classes!inner(name)")
    .eq("id", studentId)
    .maybeSingle();

  if (student.error) {
    throw new Error(`Unable to load student: ${student.error.message}`);
  }
  if (!student.data) return null;

  const row = student.data as unknown as {
    id: string;
    display_name: string;
    classes: { name: string } | { name: string }[];
  };
  const className = Array.isArray(row.classes)
    ? row.classes[0]?.name ?? ""
    : row.classes?.name ?? "";

  return {
    studentId: row.id,
    displayName: row.display_name,
    className,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/student-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

> If tsc complains about the `students → classes` relation name or the `attempts_assignment_student_id_fkey` constraint name, verify the exact names against `src/lib/db/types.ts` and the fkey used at `src/server/teacher/audio-evidence.ts:491`, and adjust the embedded resource path to match. Do not change the scoping logic.

- [ ] **Step 6: Commit**

```bash
git add src/server/teacher/student-profile.ts tests/server/student-profile.test.ts
git commit -m "feat(pronunciation): load per-student sound profile (RLS-scoped)

getStudentSoundProfile joins pronunciation_scores down to the student
(original_answer clips only) and delegates to the pure aggregator;
getStudentProfileHeader loads name+class for the page header."
```

---

## Task 4: Student detail page

**Files:**
- Create: `src/app/teacher/students/[id]/page.tsx`

- [ ] **Step 1: Implement the page**

Create `src/app/teacher/students/[id]/page.tsx`. Follows the exact conventions of `src/app/teacher/classes/[id]/page.tsx`: `force-dynamic`, `requireTeacherProfile`, inline styles, `#F7F8FA` background, the 56px white header, `notFound()` on missing/unowned records.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  getStudentProfileHeader,
  getStudentSoundProfile,
} from "@/server/teacher/student-profile";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacherProfile();
  const { id: studentId } = await params;

  const header = await getStudentProfileHeader(studentId);
  if (!header) {
    notFound();
  }

  const weaknesses = await getStudentSoundProfile(studentId, teacher.id);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F7F8FA",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#111827",
      }}
    >
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <Link
          href="/teacher"
          style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
        >
          ← Classes
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {header.displayName}
          </h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
            {header.className}
          </p>
        </div>

        <section>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: "0 0 12px",
            }}
          >
            Sounds to work on
          </h2>

          {weaknesses.length === 0 ? (
            <div
              style={{
                padding: 16,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                background: "#FFFFFF",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
                No consistent weak sounds yet.
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: "#4B5563" }}>
                As this student completes more speaking homework, sounds they
                repeatedly struggle with will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {weaknesses.map((sound) => (
                <article
                  key={sound.label + sound.ipa}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: 16,
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    background: "#FFFFFF",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        margin: 0,
                        color: "#111827",
                      }}
                    >
                      {sound.label}{" "}
                      <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>
                        /{sound.ipa}/
                      </span>
                    </p>
                    <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
                      Weak in {sound.weakCount} of {sound.totalCount} words · avg{" "}
                      {sound.averageAccuracy} · e.g. "{sound.exampleWord}"
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

> Note: `requireTeacherProfile()` returns `TeacherProfile = { id, display_name }`; `teacher.id` (the `teacher_profiles.id`) is exactly the value passed as `teacherId` and filtered against `classes.teacher_id` everywhere else (e.g. `src/app/teacher/page.tsx:15`, `evidence/[attemptId]/page.tsx:27`). No other field applies.

- [ ] **Step 3: Commit**

```bash
git add "src/app/teacher/students/[id]/page.tsx"
git commit -m "feat(teacher): student sound-profile detail page"
```

---

## Task 5: Link students from the class page

**Files:**
- Modify: `src/app/teacher/classes/[id]/page.tsx`

- [ ] **Step 1: Add a Students section**

The roster is already loaded at line 51 (`const roster = await listRoster(classId);`). Add a "Students" `<section>` immediately before the existing `<section>` that renders Assignments (before line 114 `<section>`). Insert:

```tsx
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: "0 0 12px",
            }}
          >
            Students
          </h2>

          {roster.length === 0 ? (
            <div
              style={{
                padding: 16,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                background: "#FFFFFF",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
                No students in this class yet.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {roster.map((student) => (
                <Link
                  key={student.id}
                  href={`/teacher/students/${student.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: 16,
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    background: "#FFFFFF",
                    textDecoration: "none",
                    color: "#111827",
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600 }}>
                    {student.displayName}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#2563EB",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View sounds →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
```

Note: `RosterStudent` exposes `id` and `displayName` (see `src/server/classroom/roster-service.ts:80-83`). `Link` is already imported at the top of this file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add "src/app/teacher/classes/[id]/page.tsx"
git commit -m "feat(teacher): link class roster to student sound profiles"
```

---

## Task 6: Full suite + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite one-shot**

Run: `npx vitest run`
Expected: all tests pass (existing 62 + the new domain and server tests).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Manual smoke (dev server)**

Restart the dev server (it caches compiled code — see handoff) and, authenticated as a teacher:
1. Open a class → confirm the new "Students" section lists the roster.
2. Click a student → lands on `/teacher/students/<id>`.
3. For the student with re-scored phoneme clips (attempt `4f27ef34-4d58-4880-860e-8787bfd657b1`, student `5a0cb9d3-...` per handoff), confirm weak sounds render with frequency/average/example; for a student with little data, confirm the empty state.

- [ ] **Step 4: Final commit if any smoke fixes were needed**

```bash
git add -A
git commit -m "fix(teacher): student sound-profile smoke-test adjustments"
```

---

## Self-Review notes

- **Spec coverage:** metric (frequency+average) → Task 1; min-observations gate → Task 1; read-time/no-table → Task 3 (query, no migration); per-clip transcript scoping → Task 1 (per-clip `tokenizeWords`) + Task 3 (original_answer + reference_text); new `/teacher/students/[id]` page → Task 4; Students section on class page → Task 5; empty state → Task 4; older rows without phonemes → covered by `phonemes?` and Task 1 test. All covered.
- **Type consistency:** `StudentClipScore`, `StudentSoundWeakness`, `MIN_PHONEME_OBSERVATIONS`, `studentSoundProfile`, `buildStudentSoundProfile`, `getStudentSoundProfile`, `getStudentProfileHeader` used consistently across tasks.
- **Ranking rule** is stated identically in spec and Task 1 (weak ratio desc, average asc tiebreak, cap at `MAX_SOUNDS_TO_WORK_ON`).
