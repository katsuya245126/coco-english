import {
  nextPracticeWordOrder,
  pronunciationPracticeSnapshotSchema,
  selectResultTry,
  type PracticeTryOutcome,
  type PronunciationPracticeSnapshot,
} from "@/domain/pronunciation/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceClient>;

const OPEN_STATUSES = new Set(["assigned", "started", "needs_retry"]);
const TERMINAL_STATUSES = new Set(["completed", "teacher_review"]);
const VALID_OUTCOMES = new Set<PracticeTryOutcome>([
  "passed",
  "target_weak",
  "word_weak",
  "different_word",
]);

export type PronunciationFlowError = "not_found" | "db_error";

export type PronunciationWordTryState = {
  id: string;
  tryNumber: number;
  transcript: string;
  outcome: PracticeTryOutcome;
  wordAccuracy: number | null;
  starBand: number | null;
  fullWordPassed: boolean | null;
  targetSoundAccuracy: number | null;
  targetSoundPassed: boolean | null;
  createdAt: string;
};

export type PronunciationPracticeWordState = PronunciationPracticeSnapshot["words"][number] & {
  validTryCount: number;
  remainingTryCount: number;
  passed: boolean;
  finished: boolean;
  firstTry: PronunciationWordTryState | null;
  resultTry: PronunciationWordTryState | null;
};

export type PronunciationPracticePageState = {
  assignmentStudentId: string;
  title: string;
  dueAt: string | null;
  status: string;
  attemptId: string;
  soundId: PronunciationPracticeSnapshot["soundId"];
  difficulty: PronunciationPracticeSnapshot["difficulty"];
  soundClipVersion: "v1";
  words: PronunciationPracticeWordState[];
  currentWordOrder: number | null;
  passedWordCount: number;
  finishedWordCount: number;
  completed: boolean;
  readOnly: boolean;
  isResume: boolean;
};

export type PronunciationPracticePageResult =
  | { ok: true; page: PronunciationPracticePageState }
  | { ok: false; error: PronunciationFlowError };

export type StartPronunciationAttemptResult =
  | { ok: true; attemptId: string; isResume: boolean }
  | { ok: false; error: PronunciationFlowError };

export type CompletePronunciationAttemptResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_complete" | "db_error" };

type AssignmentRecord = {
  id: string;
  student_id: string;
  status: string;
  latest_attempt_id: string | null;
  assignments: {
    title: string;
    assignment_kind: string;
    mission_snapshot: unknown;
    due_at: string | null;
    canceled_at: string | null;
  };
  snapshot: PronunciationPracticeSnapshot;
};

type TryRow = {
  id: string;
  attempt_turn_id: string;
  try_number: number;
  transcript: string;
  outcome: string;
  word_accuracy: number | null;
  star_band: number | null;
  full_word_passed: boolean | null;
  target_sound_accuracy: number | null;
  target_sound_passed: boolean | null;
  created_at: string;
};

function one(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? {};
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function overdue(dueAt: string | null): boolean {
  return Boolean(dueAt && Date.parse(dueAt) < Date.now());
}

async function loadOwnedAssignment(
  supabase: Client,
  input: { studentId: string; assignmentStudentId: string },
): Promise<AssignmentRecord | null> {
  const result = await supabase
    .from("assignment_students")
    .select(
      `id, student_id, status, latest_attempt_id,
       assignments!inner(title, assignment_kind, mission_snapshot, due_at, canceled_at)`,
    )
    .eq("id", input.assignmentStudentId)
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (result.error || !result.data) return null;

  const raw = result.data as unknown as Record<string, unknown>;
  const assignment = one(raw.assignments);
  if (
    assignment.assignment_kind !== "pronunciation" ||
    assignment.canceled_at
  ) {
    return null;
  }

  const parsed = pronunciationPracticeSnapshotSchema.safeParse(
    assignment.mission_snapshot,
  );
  if (!parsed.success) return null;

  return {
    id: String(raw.id),
    student_id: String(raw.student_id),
    status: String(raw.status),
    latest_attempt_id:
      typeof raw.latest_attempt_id === "string" ? raw.latest_attempt_id : null,
    assignments: {
      title: String(assignment.title ?? "Pronunciation Practice"),
      assignment_kind: String(assignment.assignment_kind),
      mission_snapshot: assignment.mission_snapshot,
      due_at: typeof assignment.due_at === "string" ? assignment.due_at : null,
      canceled_at:
        typeof assignment.canceled_at === "string"
          ? assignment.canceled_at
          : null,
    },
    snapshot: parsed.data,
  };
}

function canStart(row: AssignmentRecord): boolean {
  if (!OPEN_STATUSES.has(row.status)) return false;
  return row.status === "needs_retry" || !overdue(row.assignments.due_at);
}

async function loadOwnedAttempt(
  supabase: Client,
  input: { studentId: string; assignmentStudentId: string; attemptId: string },
) {
  const result = await supabase
    .from("attempts")
    .select(
      "id, assignment_student_id, status, assignment_students!inner(student_id)",
    )
    .eq("id", input.attemptId)
    .eq("assignment_student_id", input.assignmentStudentId)
    .eq("assignment_students.student_id", input.studentId)
    .maybeSingle();

  if (result.error || !result.data) return null;
  return result.data as unknown as { id: string; status: string };
}

function isOutcome(value: string): value is PracticeTryOutcome {
  return VALID_OUTCOMES.has(value as PracticeTryOutcome);
}

function mapTry(row: TryRow): PronunciationWordTryState | null {
  if (!isOutcome(row.outcome) || ![1, 2, 3].includes(row.try_number)) {
    return null;
  }
  return {
    id: row.id,
    tryNumber: row.try_number,
    transcript: row.transcript,
    outcome: row.outcome,
    wordAccuracy: row.word_accuracy,
    starBand: row.star_band,
    fullWordPassed: row.full_word_passed,
    targetSoundAccuracy: row.target_sound_accuracy,
    targetSoundPassed: row.target_sound_passed,
    createdAt: row.created_at,
  };
}

async function loadWords(
  supabase: Client,
  input: { studentId: string; assignmentStudentId: string; attemptId: string },
  snapshot: PronunciationPracticeSnapshot,
) {
  const turnsResult = await supabase
    .from("attempt_turns")
    .select(
      "id, turn_order, attempts!inner(assignment_students!inner(student_id))",
    )
    .eq("attempt_id", input.attemptId)
    .eq("attempts.assignment_students.student_id", input.studentId)
    .order("turn_order", { ascending: true });
  if (turnsResult.error) return null;

  const triesResult = await supabase
    .from("pronunciation_word_tries")
    .select(
      `id, attempt_turn_id, try_number, transcript, outcome,
       word_accuracy, star_band, full_word_passed,
       target_sound_accuracy, target_sound_passed, created_at,
       attempt_turns!inner(attempt_id, attempts!inner(assignment_students!inner(student_id)))`,
    )
    .eq("attempt_turns.attempt_id", input.attemptId)
    .eq("attempt_turns.attempts.assignment_students.student_id", input.studentId)
    .order("try_number", { ascending: true });
  if (triesResult.error) return null;

  const turns = (turnsResult.data ?? []) as unknown as Array<{
    id: string;
    turn_order: number;
  }>;
  const triesByTurn = new Map<string, PronunciationWordTryState[]>();
  for (const raw of (triesResult.data ?? []) as unknown as TryRow[]) {
    const mapped = mapTry(raw);
    if (!mapped) continue;
    const values = triesByTurn.get(raw.attempt_turn_id) ?? [];
    values.push(mapped);
    triesByTurn.set(raw.attempt_turn_id, values);
  }

  return snapshot.words.map((word) => {
    const turn = turns.find((candidate) => candidate.turn_order === word.order);
    const tries = turn ? triesByTurn.get(turn.id) ?? [] : [];
    const passed = tries.some((tryRow) => tryRow.outcome === "passed");
    const finished = passed || tries.some((tryRow) => tryRow.tryNumber === 3);
    return {
      ...word,
      validTryCount: tries.length,
      remainingTryCount: Math.max(0, 3 - tries.length),
      passed,
      finished,
      firstTry: tries.find((tryRow) => tryRow.tryNumber === 1) ?? null,
      resultTry: selectResultTry(tries),
    };
  });
}

export async function startOrResumePronunciationAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
}): Promise<StartPronunciationAttemptResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const assignment = await loadOwnedAssignment(supabase, input);
    if (!assignment || !canStart(assignment)) {
      return { ok: false, error: "not_found" };
    }

    const result = await supabase.rpc("start_pronunciation_attempt", {
      p_student_id: input.studentId,
      p_assignment_student_id: input.assignmentStudentId,
    });
    if (result.error) return { ok: false, error: "db_error" };

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    const attemptId =
      row && typeof row === "object" && "out_attempt_id" in row
        ? String((row as { out_attempt_id: unknown }).out_attempt_id)
        : "";
    if (!attemptId) return { ok: false, error: "not_found" };

    return {
      ok: true,
      attemptId,
      isResume:
        !(
          row &&
          typeof row === "object" &&
          (row as { out_created?: unknown }).out_created === true
        ),
    };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

export async function getPronunciationPracticePage(input: {
  studentId: string;
  assignmentStudentId: string;
}): Promise<PronunciationPracticePageResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const assignment = await loadOwnedAssignment(supabase, input);
    if (!assignment) return { ok: false, error: "not_found" };

    let attemptId: string | null = null;
    let isResume = true;
    const assignmentReadOnly = TERMINAL_STATUSES.has(assignment.status);

    if (assignmentReadOnly) {
      attemptId = assignment.latest_attempt_id;
    } else {
      const started = await startOrResumePronunciationAttempt(input);
      if (!started.ok) return started;
      attemptId = started.attemptId;
      isResume = started.isResume;
    }

    if (!attemptId) return { ok: false, error: "not_found" };
    const attempt = await loadOwnedAttempt(supabase, {
      ...input,
      attemptId,
    });
    if (!attempt) return { ok: false, error: "not_found" };

    const words = await loadWords(supabase, { ...input, attemptId }, assignment.snapshot);
    if (!words) return { ok: false, error: "db_error" };

    const nextWordOrder = nextPracticeWordOrder({
      words: words.map((word) => ({
        order: word.order,
        passed: word.passed,
        validTryCount: word.validTryCount,
      })),
    });
    const terminal = assignmentReadOnly || TERMINAL_STATUSES.has(attempt.status);
    const currentWordOrder = terminal
      ? null
      : nextWordOrder ?? words.at(-1)?.order ?? null;

    return {
      ok: true,
      page: {
        assignmentStudentId: input.assignmentStudentId,
        title: assignment.assignments.title,
        dueAt: assignment.assignments.due_at,
        status: assignment.status,
        attemptId,
        soundId: assignment.snapshot.soundId,
        difficulty: assignment.snapshot.difficulty,
        soundClipVersion: assignment.snapshot.soundClipVersion,
        words,
        currentWordOrder,
        passedWordCount: words.filter((word) => word.passed).length,
        finishedWordCount: words.filter((word) => word.finished).length,
        completed: terminal,
        readOnly: terminal,
        isResume,
      },
    };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

export async function completePronunciationAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
}): Promise<CompletePronunciationAttemptResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const assignment = await loadOwnedAssignment(supabase, input);
    if (!assignment || !OPEN_STATUSES.has(assignment.status)) {
      return { ok: false, error: "not_found" };
    }
    const attempt = await loadOwnedAttempt(supabase, input);
    if (!attempt || attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

    const result = await supabase.rpc("complete_pronunciation_attempt", {
      p_student_id: input.studentId,
      p_assignment_student_id: input.assignmentStudentId,
      p_attempt_id: input.attemptId,
    });
    if (result.error) return { ok: false, error: "db_error" };
    if (result.data === "ok") return { ok: true };
    if (result.data === "not_complete") {
      return { ok: false, error: "not_complete" };
    }
    return { ok: false, error: "not_found" };
  } catch {
    return { ok: false, error: "db_error" };
  }
}
