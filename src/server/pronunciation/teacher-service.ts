import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import type { Json } from "@/lib/db/types";
import { oneOrMany } from "@/lib/supabase/one-or-many";
import {
  PRACTICE_SOUNDS,
  PRACTICE_SOUND_IDS,
  pronunciationPracticeSnapshotSchema,
  type PracticeDifficulty,
  type PracticeSoundId,
} from "@/domain/pronunciation/practice";
import {
  PRONUNCIATION_WORD_BANK,
  type PronunciationWordBankEntry,
} from "@/domain/pronunciation/word-bank.generated";
import { findCustomPronunciations, type CustomPronunciation } from "@/server/pronunciation/cmudict";
import { consumeRequestBudget } from "@/server/security/request-budget";
import {
  getOrCreatePronunciationWordAudio,
  signPronunciationWordAudio,
  type PronunciationWordAudioInput,
  type GetOrCreatePronunciationWordAudioResult,
} from "@/server/audio/pronunciation-word-audio";
import {
  getStudentSoundProfile,
  type StudentProfileHeader,
} from "@/server/teacher/student-profile";
import type { StudentSoundWeakness } from "@/domain/pronunciation/scoring";

type TeacherClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type PronunciationSoundOption = {
  soundId: string;
  label: string;
  ipa: string;
  available: boolean;
  weak: boolean;
  weakness?: StudentSoundWeakness;
};

export type PronunciationWordHistory = {
  word: string;
  outcome: "passed" | "target_weak" | "word_weak" | "different_word";
  practicedAt: string;
};

export type PronunciationTeacherDeps = {
  supabase?: TeacherClient;
  getStudentSoundProfile?: typeof getStudentSoundProfile;
  findCustomPronunciations?: typeof findCustomPronunciations;
  getOrCreatePronunciationWordAudio?: typeof getOrCreatePronunciationWordAudio;
  signPronunciationWordAudio?: typeof signPronunciationWordAudio;
  consumeRequestBudget?: typeof consumeRequestBudget;
  loadWordHistory?: (
    input: { teacherId: string; studentId: string },
    client: TeacherClient,
  ) => Promise<PronunciationWordHistory[]>;
};

export type PronunciationAssignmentWordInput = {
  text: string;
  source: "verified" | "custom";
  cmuVariant: number;
  highlightStart: number;
  highlightLength: number;
};

export type AssignPronunciationPracticeInput = {
  teacherId: string;
  studentId: string;
  soundId: PracticeSoundId;
  difficulty: PracticeDifficulty;
  dueAt: string | null;
  words: PronunciationAssignmentWordInput[];
};

export type PronunciationSetup = StudentProfileHeader & {
  soundOptions: PronunciationSoundOption[];
  initialSoundId: PracticeSoundId;
  initialDifficulty: PracticeDifficulty;
  suggestions: PronunciationWordBankEntry[];
};

type ServiceFailure =
  | "not_found"
  | "invalid_word"
  | "audio_failed"
  | "rate_limited"
  | "db_error";

type ServiceFailureResult = {
  ok: false;
  error: ServiceFailure;
  retryAfterSeconds?: number;
};

const ownedStudentRowSchema = z.object({
  id: z.string(),
  class_id: z.string(),
  display_name: z.string(),
  classes: oneOrMany(
    z.object({ id: z.string(), name: z.string() }),
  ).nullable(),
});

const historyRowSchema = z.object({
  try_number: z.number(),
  outcome: z.string(),
  created_at: z.string(),
  attempt_turns: oneOrMany(
    z.object({
      turn_order: z.number(),
      attempts: oneOrMany(
        z.object({
          assignment_students: oneOrMany(
            z.object({
              assignments: oneOrMany(
                z.object({
                  assignment_kind: z.string(),
                  mission_snapshot: z.unknown(),
                }),
              ).nullable(),
            }),
          ).nullable(),
        }),
      ).nullable(),
    }),
  ).nullable(),
});

const HISTORY_OUTCOMES = new Set<string>([
  "passed",
  "target_weak",
  "word_weak",
  "different_word",
]);

function isHistoryOutcome(
  value: string,
): value is PronunciationWordHistory["outcome"] {
  return HISTORY_OUTCOMES.has(value);
}

function weaknessForSound(
  weaknesses: StudentSoundWeakness[],
  soundId: PracticeSoundId,
): StudentSoundWeakness | undefined {
  const sound = PRACTICE_SOUNDS[soundId];
  return weaknesses.find(
    (weakness) => weakness.ipa.toLocaleLowerCase("en-US") === sound.ipa,
  );
}

export function rankPronunciationSoundOptions(
  weaknesses: StudentSoundWeakness[],
): PronunciationSoundOption[] {
  const supported = PRACTICE_SOUND_IDS.map((soundId) => {
    const weakness = weaknessForSound(weaknesses, soundId);
    return {
      soundId,
      label: PRACTICE_SOUNDS[soundId].label,
      ipa: PRACTICE_SOUNDS[soundId].ipa,
      available: true,
      weak: Boolean(weakness),
      ...(weakness ? { weakness } : {}),
    };
  }).sort((a, b) => {
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    return (
      PRACTICE_SOUND_IDS.indexOf(a.soundId as PracticeSoundId) -
      PRACTICE_SOUND_IDS.indexOf(b.soundId as PracticeSoundId)
    );
  });

  const supportedIpa = new Set<string>(
    PRACTICE_SOUND_IDS.map((soundId) => PRACTICE_SOUNDS[soundId].ipa),
  );
  const unavailable = weaknesses
    .filter((weakness) => !supportedIpa.has(weakness.ipa))
    .map((weakness) => ({
      soundId: `unsupported:${weakness.ipa}`,
      label: weakness.label,
      ipa: weakness.ipa,
      available: false,
      weak: true,
      weakness,
    }));

  return [...supported, ...unavailable];
}

function historyDate(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rankPronunciationWords(
  entries: readonly PronunciationWordBankEntry[],
  history: readonly PronunciationWordHistory[],
): PronunciationWordBankEntry[] {
  const latest = new Map<string, PronunciationWordHistory>();
  for (const row of history) {
    const key = row.word.toLocaleLowerCase("en-US");
    const existing = latest.get(key);
    if (!existing || historyDate(row.practicedAt) >= historyDate(existing.practicedAt)) {
      latest.set(key, row);
    }
  }

  return [...entries].sort((a, b) => {
    const aHistory = latest.get(a.text.toLocaleLowerCase("en-US"));
    const bHistory = latest.get(b.text.toLocaleLowerCase("en-US"));
    const aWeak = aHistory ? aHistory.outcome !== "passed" : false;
    const bWeak = bHistory ? bHistory.outcome !== "passed" : false;

    if (aWeak !== bWeak) return aWeak ? -1 : 1;
    if (aWeak && bWeak) {
      const recent = historyDate(bHistory?.practicedAt) - historyDate(aHistory?.practicedAt);
      if (recent !== 0) return recent;
    } else {
      const leastRecent = historyDate(aHistory?.practicedAt) - historyDate(bHistory?.practicedAt);
      if (leastRecent !== 0) return leastRecent;
    }
    return a.text.localeCompare(b.text, "en-US");
  });
}

async function loadOwnedStudent(
  studentId: string,
  teacherId: string,
  client: TeacherClient,
): Promise<StudentProfileHeader | null> {
  const result = await client
    .from("students")
    .select("id, class_id, display_name, classes!inner(id, name, teacher_id)")
    .eq("id", studentId)
    .eq("classes.teacher_id", teacherId)
    .is("archived_at", null)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Unable to load pronunciation student: ${result.error.message}`);
  }
  if (!result.data) return null;

  const parsed = ownedStudentRowSchema.safeParse(result.data);
  if (!parsed.success) return null;

  const row = parsed.data;
  const klass = row.classes;
  return {
    studentId: row.id,
    classId: row.class_id,
    displayName: row.display_name,
    className: klass?.name ?? "",
  };
}

async function loadWordHistory(
  input: { teacherId: string; studentId: string },
  client: TeacherClient,
): Promise<PronunciationWordHistory[]> {
  const result = await client
    .from("pronunciation_word_tries")
    .select(
      `try_number, outcome, created_at,
       attempt_turns!inner(
         turn_order,
         attempts!inner(
           assignment_students!attempts_assignment_student_id_fkey!inner(
             student_id,
             assignments!inner(
               assignment_kind,
               mission_snapshot,
               classes!inner(teacher_id)
             )
           )
         )
       )`,
    )
    .eq("try_number", 1)
    .eq("attempt_turns.attempts.assignment_students.student_id", input.studentId)
    .eq(
      "attempt_turns.attempts.assignment_students.assignments.assignment_kind",
      "pronunciation",
    )
    .eq(
      "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
      input.teacherId,
    );

  if (result.error) {
    throw new Error(`Unable to load pronunciation history: ${result.error.message}`);
  }

  const parsedRows = z.array(historyRowSchema).safeParse(result.data ?? []);
  if (!parsedRows.success) {
    throw new Error("Unable to load pronunciation history: unexpected row shape");
  }

  const rows: PronunciationWordHistory[] = [];
  for (const raw of parsedRows.data) {
    const turn = raw.attempt_turns;
    const assignment = turn?.attempts?.assignment_students?.assignments;
    if (
      !turn ||
      !assignment ||
      assignment.assignment_kind !== "pronunciation" ||
      !isHistoryOutcome(raw.outcome)
    ) {
      continue;
    }
    const snapshot = pronunciationPracticeSnapshotSchema.safeParse(
      assignment.mission_snapshot,
    );
    if (!snapshot.success) continue;
    const word = snapshot.data.words.find(
      (candidate) => candidate.order === turn.turn_order,
    );
    if (!word) continue;
    rows.push({
      word: word.text,
      outcome: raw.outcome,
      practicedAt: raw.created_at,
    });
  }
  return rows;
}

async function setupParts(
  input: { teacherId: string; studentId: string; soundId: PracticeSoundId; difficulty: PracticeDifficulty },
  client: TeacherClient,
  deps: PronunciationTeacherDeps,
) {
  const getProfile = deps.getStudentSoundProfile ?? getStudentSoundProfile;
  const loadHistory = deps.loadWordHistory ?? loadWordHistory;
  const [weaknesses, history] = await Promise.all([
    getProfile(input.studentId, input.teacherId),
    loadHistory(
      { teacherId: input.teacherId, studentId: input.studentId },
      client,
    ),
  ]);
  const suggestions = rankPronunciationWords(
    PRONUNCIATION_WORD_BANK.filter(
      (entry) =>
        entry.soundId === input.soundId && entry.difficulty === input.difficulty,
    ),
    history,
  );
  return { weaknesses, suggestions };
}

export async function getPronunciationSetup(
  input: { teacherId: string; studentId: string },
  deps: PronunciationTeacherDeps = {},
): Promise<PronunciationSetup | null> {
  const client = deps.supabase ?? (await createSupabaseServerClient());
  const student = await loadOwnedStudent(input.studentId, input.teacherId, client);
  if (!student) return null;

  const getProfile = deps.getStudentSoundProfile ?? getStudentSoundProfile;
  const loadHistory = deps.loadWordHistory ?? loadWordHistory;
  const [weaknesses, history] = await Promise.all([
    getProfile(input.studentId, input.teacherId),
    loadHistory(input, client),
  ]);
  const soundOptions = rankPronunciationSoundOptions(weaknesses);
  const initialSoundId =
    (soundOptions.find((option) => option.available && option.weak)?.soundId as PracticeSoundId | undefined) ??
    "light_l";
  const suggestions = rankPronunciationWords(
    PRONUNCIATION_WORD_BANK.filter(
      (entry) => entry.soundId === initialSoundId && entry.difficulty === "easy",
    ),
    history,
  );

  return {
    ...student,
    soundOptions,
    initialSoundId,
    initialDifficulty: "easy",
    suggestions,
  };
}

export async function suggestPronunciationWords(
  input: {
    teacherId: string;
    studentId: string;
    soundId: PracticeSoundId;
    difficulty: PracticeDifficulty;
  },
  deps: PronunciationTeacherDeps = {},
): Promise<
  | { ok: true; words: PronunciationWordBankEntry[] }
  | { ok: false; error: "not_found" }
> {
  const client = deps.supabase ?? (await createSupabaseServerClient());
  const student = await loadOwnedStudent(input.studentId, input.teacherId, client);
  if (!student) return { ok: false, error: "not_found" };
  const { suggestions } = await setupParts(input, client, deps);
  return { ok: true, words: suggestions };
}

async function resolveWord(
  input: {
    soundId: PracticeSoundId;
    difficulty: PracticeDifficulty;
    word: PronunciationAssignmentWordInput;
  },
  deps: PronunciationTeacherDeps,
): Promise<
  | (PronunciationWordAudioInput & {
      source: "verified" | "custom";
      cmuVariant: number;
      highlightStart: number;
      highlightLength: number;
      targetPhoneIndex: number;
    })
  | null
> {
  const text = input.word.text.trim();
  if (!text || !Number.isInteger(input.word.cmuVariant)) return null;

  if (input.word.source === "verified") {
    const entry = PRONUNCIATION_WORD_BANK.find(
      (candidate) =>
        candidate.soundId === input.soundId &&
        candidate.difficulty === input.difficulty &&
        candidate.text === text &&
        candidate.cmuVariant === input.word.cmuVariant,
    );
    if (!entry) return null;
    return {
      word: entry.text,
      phones: [...entry.phones],
      source: "verified",
      cmuVariant: entry.cmuVariant,
      highlightStart: entry.highlightStart,
      highlightLength: entry.highlightLength,
      targetPhoneIndex: entry.targetPhoneIndex,
    };
  }

  if (
    !Number.isInteger(input.word.highlightStart) ||
    input.word.highlightStart < 0 ||
    !Number.isInteger(input.word.highlightLength) ||
    input.word.highlightLength < 1 ||
    input.word.highlightStart + input.word.highlightLength > text.length
  ) {
    return null;
  }
  const lookup = deps.findCustomPronunciations ?? findCustomPronunciations;
  const choices = await lookup({ word: text, soundId: input.soundId });
  const choice = choices.find((candidate) => candidate.cmuVariant === input.word.cmuVariant);
  if (!choice) return null;
  return {
    word: choice.word,
    phones: [...choice.phones],
    source: "custom",
    cmuVariant: choice.cmuVariant,
    highlightStart: input.word.highlightStart,
    highlightLength: input.word.highlightLength,
    targetPhoneIndex: choice.targetPhoneIndex,
  };
}

async function renderResolvedWord(
  resolved: Awaited<ReturnType<typeof resolveWord>>,
  deps: PronunciationTeacherDeps,
): Promise<
  | {
      word: NonNullable<typeof resolved>;
      audio: Extract<GetOrCreatePronunciationWordAudioResult, { ok: true }>;
    }
  | null
> {
  if (!resolved) return null;
  const render = deps.getOrCreatePronunciationWordAudio ?? getOrCreatePronunciationWordAudio;
  const audio = await render({ word: resolved.word, phones: resolved.phones });
  if (!audio.ok) return null;
  return { word: resolved, audio };
}

async function admitTeacherProvider(
  teacherId: string,
  deps: PronunciationTeacherDeps,
): Promise<{ ok: true } | ServiceFailureResult> {
  try {
    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: teacherId,
      operation: "teacher_provider",
    });
    if (!budget.allowed) {
      return {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: budget.retryAfterSeconds,
      };
    }
  } catch {
    return { ok: false, error: "db_error" };
  }
  return { ok: true };
}

export async function lookupCustomWord(
  input: { teacherId: string; studentId: string; word: string; soundId: PracticeSoundId },
  deps: PronunciationTeacherDeps = {},
): Promise<
  | { ok: true; choices: CustomPronunciation[] }
  | { ok: false; error: "not_found" }
> {
  const client = deps.supabase ?? (await createSupabaseServerClient());
  if (!(await loadOwnedStudent(input.studentId, input.teacherId, client))) {
    return { ok: false, error: "not_found" };
  }
  const lookup = deps.findCustomPronunciations ?? findCustomPronunciations;
  return {
    ok: true,
    choices: await lookup({ word: input.word, soundId: input.soundId }),
  };
}

export async function previewPronunciationWord(
  input: {
    teacherId: string;
    studentId: string;
    soundId: PracticeSoundId;
    difficulty: PracticeDifficulty;
    word: PronunciationAssignmentWordInput;
  },
  deps: PronunciationTeacherDeps = {},
): Promise<
  | { ok: true; audioUrl: string; word: NonNullable<Awaited<ReturnType<typeof resolveWord>>> }
  | ServiceFailureResult
> {
  const client = deps.supabase ?? (await createSupabaseServerClient());
  if (!(await loadOwnedStudent(input.studentId, input.teacherId, client))) {
    return { ok: false, error: "not_found" };
  }
  const resolved = await resolveWord(input, deps);
  if (!resolved) return { ok: false, error: "invalid_word" };
  const admitted = await admitTeacherProvider(input.teacherId, deps);
  if (!admitted.ok) return admitted;
  const rendered = await renderResolvedWord(resolved, deps);
  if (!rendered) return { ok: false, error: "invalid_word" };
  const sign = deps.signPronunciationWordAudio ?? signPronunciationWordAudio;
  const signed = await sign({ word: rendered.word.word, phones: rendered.word.phones });
  if (!signed.ok) return { ok: false, error: "audio_failed" };
  return { ok: true, audioUrl: signed.audioUrl, word: rendered.word };
}

export async function assignPronunciationPractice(
  input: AssignPronunciationPracticeInput,
  deps: PronunciationTeacherDeps = {},
): Promise<
  | { ok: true; assignmentId: string; assignmentStudentId: string }
  | ServiceFailureResult
> {
  if (input.words.length !== 5) return { ok: false, error: "invalid_word" };
  const client = deps.supabase ?? (await createSupabaseServerClient());
  if (!(await loadOwnedStudent(input.studentId, input.teacherId, client))) {
    return { ok: false, error: "not_found" };
  }

  const resolved: Array<NonNullable<Awaited<ReturnType<typeof resolveWord>>>> = [];
  for (const word of input.words) {
    const item = await resolveWord({ soundId: input.soundId, difficulty: input.difficulty, word }, deps);
    if (!item) return { ok: false, error: "invalid_word" };
    resolved.push(item);
  }

  const admitted = await admitTeacherProvider(input.teacherId, deps);
  if (!admitted.ok) return admitted;

  const words: Array<Record<string, unknown>> = [];
  for (let index = 0; index < resolved.length; index += 1) {
    const rendered = await renderResolvedWord(resolved[index], deps);
    if (!rendered) return { ok: false, error: "audio_failed" };
    words.push({
      order: index + 1,
      text: rendered.word.word,
      highlightStart: rendered.word.highlightStart,
      highlightLength: rendered.word.highlightLength,
      source: rendered.word.source,
      pronunciation: {
        phones: rendered.word.phones,
        targetPhoneIndex: rendered.word.targetPhoneIndex,
        cmuVariant: rendered.word.cmuVariant,
      },
      wordAudio: {
        schemaVersion: 1,
        contentHash: rendered.audio.contentHash,
        voice: "en-US-AvaNeural",
        format: "audio-24khz-48kbitrate-mono-mp3",
      },
    });
  }

  const snapshot = pronunciationPracticeSnapshotSchema.parse({
    kind: "pronunciation",
    version: 1,
    soundId: input.soundId,
    difficulty: input.difficulty,
    requiredWords: 5,
    soundClipVersion: "v1",
    words,
  });
  const assigned = await client.rpc("assign_pronunciation_practice", {
    p_student_id: input.studentId,
    p_pronunciation_snapshot: snapshot satisfies Json,
    p_due_at: input.dueAt,
  });
  if (assigned.error) return { ok: false, error: "db_error" };
  const row = Array.isArray(assigned.data) ? assigned.data[0] : assigned.data;
  if (!row?.out_assignment_id || !row.out_assignment_student_id) {
    return { ok: false, error: "db_error" };
  }
  return {
    ok: true,
    assignmentId: row.out_assignment_id,
    assignmentStudentId: row.out_assignment_student_id,
  };
}
