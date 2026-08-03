import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { parseWordScores } from "@/server/teacher/audio-evidence";
import { oneOrMany } from "@/lib/supabase/one-or-many";
import {
  normalizeWord,
  phonemeLabel,
  studentSoundProfile,
  tokenizeWords,
  type StudentClipScore,
  type StudentSoundWeakness,
} from "@/domain/pronunciation/scoring";

/** A pronunciation_scores row projected for profile aggregation. */
const profileScoreRowSchema = z.object({
  reference_text: z.string().nullable(),
  word_scores: z.unknown(),
});
type ProfileScoreRow = z.infer<typeof profileScoreRowSchema>;

const confirmedSampleProfileRowSchema = z.object({
  id: z.string(),
  status: z.literal("confirmed"),
  provisional_result: z.unknown(),
});

const confirmedSampleScoreSchema = z.object({
  referenceText: z.string(),
  wordScores: z.array(z.unknown()),
});

export type StudentProfileEvidenceSource =
  | "Mission"
  | "Teacher-added pronunciation sample";

export type StudentProfileWeakness = StudentSoundWeakness & {
  /** Evidence classes contributing to this gated sound observation. */
  evidenceSources: StudentProfileEvidenceSource[];
  /** Confirmed teacher-added samples that contributed observations for this sound. */
  teacherSampleIds?: string[];
};

function clipsFromMissionRows(rows: ProfileScoreRow[]): StudentClipScore[] {
  return rows.map((row) => ({
    wordScores: parseWordScores(row.word_scores),
    transcript: row.reference_text ?? "",
  }));
}

type PronunciationProfileRow = {
  try_number: number;
  transcript: string | null;
  audio_clips: {
    pronunciation_scores:
      | { word_scores: unknown }
      | { word_scores: unknown }[]
      | null;
  } | { pronunciation_scores: { word_scores: unknown } | { word_scores: unknown }[] | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

type ConfirmedSampleProfileRow = {
  id?: string;
  provisional_result?: unknown;
};

function clipsFromConfirmedSamples(
  rows: ConfirmedSampleProfileRow[],
): Array<{ sampleId?: string; clip: StudentClipScore }> {
  return rows.flatMap((row) => {
    const parsed = confirmedSampleScoreSchema.safeParse(row.provisional_result);
    return parsed.success
      ? [{
          sampleId: row.id,
          clip: {
            wordScores: parseWordScores(parsed.data.wordScores),
            transcript: parsed.data.referenceText,
          },
        }]
      : [];
  });
}

function observedSoundKeys(clips: StudentClipScore[]) {
  // Source labels describe every observation that contributes to the profile
  // denominator, not only the weak observations that survive the final gate.
  const keys = new Set<string>();
  for (const clip of clips) {
    const spokenWords = tokenizeWords(clip.transcript);
    for (const word of clip.wordScores) {
      if (!spokenWords.has(normalizeWord(word.word))) continue;
      for (const phoneme of word.phonemes ?? []) {
        const { label, ipa } = phonemeLabel(phoneme.phoneme);
        keys.add(`${label}\u0000${ipa}`);
      }
    }
  }
  return keys;
}

/**
 * Pure mapping from stored score rows to the accumulated sound profile.
 * Mission rows are `original_answer` clips (scoped by the query), so their
 * `reference_text` is the student's own transcript. Confirmed sample rows
 * carry the same transcript/word-score shape inside `provisional_result`.
 * A null transcript scopes nothing in — safer than counting against a target
 * sentence.
 */
export function buildStudentSoundProfile(
  rows: ProfileScoreRow[],
  confirmedSamples: ConfirmedSampleProfileRow[] = [],
): StudentProfileWeakness[] {
  const missionClips = clipsFromMissionRows(rows);
  const sampleClips = clipsFromConfirmedSamples(confirmedSamples);
  const missionSoundKeys = observedSoundKeys(missionClips);
  const sampleSoundKeys = observedSoundKeys(sampleClips.map(({ clip }) => clip));
  const sampleIdsBySound = new Map<string, Set<string>>();
  for (const { sampleId, clip } of sampleClips) {
    if (!sampleId) continue;
    for (const key of observedSoundKeys([clip])) {
      const sampleIds = sampleIdsBySound.get(key) ?? new Set<string>();
      sampleIds.add(sampleId);
      sampleIdsBySound.set(key, sampleIds);
    }
  }

  return studentSoundProfile([
    ...missionClips,
    ...sampleClips.map(({ clip }) => clip),
  ]).map((sound) => {
    const key = `${sound.label}\u0000${sound.ipa}`;
    const evidenceSources: StudentProfileEvidenceSource[] = [];
    if (missionSoundKeys.has(key)) evidenceSources.push("Mission");
    if (sampleSoundKeys.has(key)) {
      evidenceSources.push("Teacher-added pronunciation sample");
    }
    const teacherSampleIds = [...(sampleIdsBySound.get(key) ?? [])];
    return {
      ...sound,
      evidenceSources,
      ...(teacherSampleIds.length > 0 ? { teacherSampleIds } : {}),
    };
  });
}

/**
 * Load a student's accumulated weak-sound profile. Runs under RLS via the
 * authenticated server client; the reverse-join + teacher_id filters enforce
 * ownership defensively. Mission evidence is scoped to `original_answer`
 * clips, whose `reference_text` is the student's transcript (repeat_attempt
 * clips' reference_text is the target sentence — wrong scope for "what they
 * said"). Confirmed teacher-added rows use their stored scored reference.
 */
export async function getStudentSoundProfile(
  studentId: string,
  teacherId: string,
): Promise<StudentProfileWeakness[]> {
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
                assignment_kind,
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
    )
    .eq(
      "audio_clips.attempt_turns.attempts.assignment_students.assignments.assignment_kind",
      "mission",
    );

  if (scores.error) {
    throw new Error(
      `Unable to load student pronunciation scores: ${scores.error.message}`,
    );
  }

  const rows = z.array(profileScoreRowSchema).safeParse(scores.data ?? []);
  if (!rows.success) {
    throw new Error(
      "Unable to load student pronunciation scores: unexpected row shape",
    );
  }

  const samples = await supabase
    .from("pronunciation_samples")
    .select(
      `id, status, provisional_result,
       students!inner(classes!inner(teacher_id))`,
    )
    .eq("student_id", studentId)
    .eq("students.classes.teacher_id", teacherId)
    .is("deletion_started_at", null)
    .eq("status", "confirmed");

  if (samples.error) {
    throw new Error(
      `Unable to load teacher pronunciation samples: ${samples.error.message}`,
    );
  }

  const sampleRows = z
    .array(confirmedSampleProfileRowSchema)
    .safeParse(samples.data ?? []);
  if (!sampleRows.success) {
    throw new Error(
      "Unable to load teacher pronunciation samples: unexpected row shape",
    );
  }

  const pronunciationTries = await supabase
    .from("pronunciation_word_tries")
    .select(
      `
      transcript,
      try_number,
      audio_clips!inner(
        pronunciation_scores!inner(word_scores)
      ),
      attempt_turns!inner(
        attempts!inner(
          assignment_students!inner(
            student_id,
            assignments!inner(
              classes!inner(teacher_id)
            )
          )
        )
      )
    `,
    )
    .eq("try_number", 1)
    .eq("attempt_turns.attempts.assignment_students.student_id", studentId)
    .eq(
      "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      teacherId,
    );

  if (pronunciationTries.error) {
    throw new Error(
      `Unable to load pronunciation practice scores: ${pronunciationTries.error.message}`,
    );
  }

  const practiceRows: ProfileScoreRow[] = [];
  for (const row of (pronunciationTries.data ?? []) as unknown as PronunciationProfileRow[]) {
    if (row.try_number !== 1) continue;
    const clip = firstRelation(row.audio_clips);
    const score = firstRelation(clip?.pronunciation_scores);
    if (score) {
      practiceRows.push({
        reference_text: row.transcript,
        word_scores: score.word_scores,
      });
    }
  }

  return buildStudentSoundProfile([...rows.data, ...practiceRows], sampleRows.data);
}

export type StudentProfileHeader = {
  studentId: string;
  classId: string;
  displayName: string;
  className: string;
};

/**
 * Load the student's identity + class for the page header, RLS-scoped to the
 * requesting teacher. Returns null if the student is not visible to them
 * (drives notFound on the page).
 */
export async function getStudentProfileHeader(
  studentId: string,
): Promise<StudentProfileHeader | null> {
  const supabase = await createSupabaseServerClient();

  const student = await supabase
    .from("students")
    .select("id, class_id, display_name, classes!inner(name)")
    .eq("id", studentId)
    .maybeSingle();

  if (student.error) {
    throw new Error(`Unable to load student: ${student.error.message}`);
  }
  if (!student.data) return null;

  const parsed = z
    .object({
      id: z.string(),
      class_id: z.string(),
      display_name: z.string(),
      classes: oneOrMany(z.object({ name: z.string() })).nullable(),
    })
    .safeParse(student.data);
  if (!parsed.success) {
    throw new Error("Unable to load student: unexpected row shape");
  }
  const row = parsed.data;
  const className = row.classes?.name ?? "";

  return {
    studentId: row.id,
    classId: row.class_id,
    displayName: row.display_name,
    className,
  };
}
