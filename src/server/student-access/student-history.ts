import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { wordsToPractice, type WordScore } from "@/domain/pronunciation/scoring";

const AUDIO_TTL_SECONDS = 300;
const AUDIO_BUCKET = "student-audio";

export type StudentRecapPronunciation = {
  starBand: 1 | 2 | 3;
  words: { word: string; label: string }[];
};

export type StudentRecapAudioClip = {
  id: string;
  playback: "available" | "expired" | "unavailable";
};

export type StudentRecapTurn = {
  id: string;
  turnOrder: number;
  cocoPrompt: string;
  transcript: string;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
};

export type StudentMissionRecap = {
  assignmentStudentId: string;
  title: string;
  targetPattern: string;
  completedAt: string | null;
  turns: StudentRecapTurn[];
};

type Snapshot = { targetPattern: string; turns: Array<{ turnOrder?: number; order?: number; prompt: string }> };

function parseSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { targetPattern?: unknown; turns?: unknown };
  if (typeof raw.targetPattern !== "string" || !raw.targetPattern.trim() || !Array.isArray(raw.turns)) return null;
  const turns = raw.turns.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const turn = item as { turnOrder?: unknown; order?: unknown; prompt?: unknown };
    const turnOrder = typeof turn.turnOrder === "number" ? turn.turnOrder : typeof turn.order === "number" ? turn.order : null;
    return turnOrder !== null && typeof turn.prompt === "string" && turn.prompt.trim() ? [{ turnOrder, prompt: turn.prompt.trim() }] : [];
  });
  return turns.length ? { targetPattern: raw.targetPattern.trim(), turns } : null;
}

function playbackFor(clip: { object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null }) {
  if (clip.deleted_at || (clip.audio_expires_at && Date.parse(clip.audio_expires_at) <= Date.now())) return "expired" as const;
  if (!clip.object_key || clip.processing_status === "failed" || clip.processing_status === "deleted") return "unavailable" as const;
  return "available" as const;
}

export async function getCompletedMissionRecap(studentId: string, assignmentStudentId: string): Promise<StudentMissionRecap | null> {
  const supabase = createSupabaseServiceClient();
  const owned = await supabase.from("assignment_students").select("id, status, latest_attempt_id, submitted_at, assignments!inner(title, mission_snapshot, canceled_at)")
    .eq("id", assignmentStudentId).eq("student_id", studentId).in("status", ["completed", "teacher_review"]).maybeSingle();
  if (owned.error || !owned.data) return null;
  const row = owned.data as { id: string; latest_attempt_id: string | null; submitted_at: string | null; assignments: { title: string; mission_snapshot: unknown; canceled_at: string | null } | Array<{ title: string; mission_snapshot: unknown; canceled_at: string | null }> };
  const assignment = Array.isArray(row.assignments) ? row.assignments[0] : row.assignments;
  const snapshot = parseSnapshot(assignment?.mission_snapshot);
  if (!row.latest_attempt_id || !assignment || assignment.canceled_at || !snapshot) return null;

  const attempt = await supabase.from("attempts").select("id, status, completed_at").eq("id", row.latest_attempt_id).eq("assignment_student_id", row.id).in("status", ["completed", "teacher_review"]).maybeSingle();
  if (attempt.error || !attempt.data) return null;
  const turnsResult = await supabase.from("attempt_turns").select("id, turn_order, original_transcript, repeat_transcript, repeat_accepted").eq("attempt_id", row.latest_attempt_id).order("turn_order", { ascending: true });
  if (turnsResult.error) throw new Error(`Unable to load recap turns: ${turnsResult.error.message}`);
  const turnRows = (turnsResult.data ?? []) as Array<{ id: string; turn_order: number; original_transcript: string | null; repeat_transcript: string | null; repeat_accepted: boolean | null }>;
  const ids = turnRows.map((turn) => turn.id);
  let clips: Array<{ id: string; attempt_turn_id: string; clip_kind: string; object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null }> = [];
  if (ids.length) {
    const result = await supabase.from("audio_clips").select("id, attempt_turn_id, clip_kind, object_key, processing_status, audio_expires_at, deleted_at").in("attempt_turn_id", ids).order("created_at", { ascending: true });
    if (result.error) throw new Error(`Unable to load recap audio: ${result.error.message}`);
    clips = result.data ?? [];
  }
  const clipIds = clips.map((clip) => clip.id);
  let scores: Array<{ audio_clip_id: string; star_band: number; word_scores: unknown }> = [];
  if (clipIds.length) {
    const result = await supabase.from("pronunciation_scores").select("audio_clip_id, star_band, word_scores").in("audio_clip_id", clipIds);
    if (result.error) throw new Error(`Unable to load recap pronunciation: ${result.error.message}`);
    scores = result.data ?? [];
  }
  const prompts = new Map(snapshot.turns.map((turn) => [turn.turnOrder, turn.prompt]));
  return {
    assignmentStudentId: row.id, title: assignment.title, targetPattern: snapshot.targetPattern,
    completedAt: (attempt.data as { completed_at: string | null }).completed_at ?? row.submitted_at,
    turns: turnRows.map((turn) => {
      const acceptedRepeat = turn.repeat_accepted === true && Boolean(turn.repeat_transcript);
      const transcript = acceptedRepeat ? turn.repeat_transcript! : turn.original_transcript ?? "";
      const clip = clips.find((item) => item.attempt_turn_id === turn.id && item.clip_kind === (acceptedRepeat ? "repeat_attempt" : "original_answer")) ?? null;
      const score = clip ? scores.find((item) => item.audio_clip_id === clip.id) : undefined;
      return { id: turn.id, turnOrder: turn.turn_order, cocoPrompt: prompts.get(turn.turn_order) ?? "Coco's question", transcript, audio: clip ? { id: clip.id, playback: playbackFor(clip) } : null, pronunciation: score && [1,2,3].includes(score.star_band) ? { starBand: score.star_band as 1|2|3, words: Array.isArray(score.word_scores) ? wordsToPractice(score.word_scores as WordScore[], transcript) : [] } : null };
    }),
  };
}

export async function createSignedHistoryAudioUrl(studentId: string, audioClipId: string): Promise<{ signedUrl: string } | null> {
  const supabase = createSupabaseServiceClient();
  const clip = await supabase.from("audio_clips").select("id, object_key, processing_status, audio_expires_at, deleted_at, attempt_turns!inner(attempts!inner(id, status, assignment_students!attempts_assignment_student_id_fkey!inner(student_id, status, latest_attempt_id, assignments!inner(canceled_at))))")
    .eq("id", audioClipId).eq("attempt_turns.attempts.assignment_students.student_id", studentId).in("attempt_turns.attempts.assignment_students.status", ["completed", "teacher_review"]).in("attempt_turns.attempts.status", ["completed", "teacher_review"]).maybeSingle();
  if (clip.error || !clip.data) return null;
  const row = clip.data as unknown as { object_key: string | null; processing_status: string; audio_expires_at: string | null; deleted_at: string | null; attempt_turns: { attempts: { id: string; assignment_students: { latest_attempt_id: string | null; assignments: { canceled_at: string | null } } } } };
  const turn = Array.isArray(row.attempt_turns) ? row.attempt_turns[0] : row.attempt_turns;
  const attempt = Array.isArray(turn?.attempts) ? turn.attempts[0] : turn?.attempts;
  const assignmentStudent = Array.isArray(attempt?.assignment_students) ? attempt.assignment_students[0] : attempt?.assignment_students;
  const assignment = Array.isArray(assignmentStudent?.assignments) ? assignmentStudent.assignments[0] : assignmentStudent?.assignments;
  if (!attempt || !assignmentStudent || attempt.id !== assignmentStudent.latest_attempt_id || assignment?.canceled_at || playbackFor(row) !== "available") return null;
  const signed = await supabase.storage.from(process.env.STUDENT_AUDIO_BUCKET || AUDIO_BUCKET).createSignedUrl(row.object_key!, AUDIO_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return null;
  return { signedUrl: signed.data.signedUrl };
}
