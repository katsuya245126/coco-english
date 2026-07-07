import { NextResponse } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { missionSnapshotSchema } from "@/domain/mission/schemas";
import { getCharacterProfile } from "@/domain/character/profile";
import {
  DEFAULT_COCO_TTS_VOICE,
  ttsRequestSchema,
  type VoiceEligibleLineKind,
} from "@/domain/audio/tts";
import { getOrCreateTtsAudio } from "@/server/audio/tts-cache";

/**
 * Student-gated, cache-first Coco TTS route (VOICE-01, VOICE-03, D-05..D-16).
 *
 * The browser sends only a *line descriptor* (which visible Coco line to
 * speak) — never spoken text and never a content hash. The server resolves the
 * actual line text from owned assignment/attempt/profile state, so a student
 * transcript can never be synthesized (D-10) and a forged hash can never enter
 * the lookup (T-08-03). Provider/storage failures map to a retryable 502 the UI
 * can render without blocking homework (D-15). No replay telemetry is recorded
 * (D-16).
 */

type RouteContext = {
  params: Promise<{ assignmentStudentId: string }>;
};

type ResolvedSnapshotTurn = {
  prompt: string;
  improvedSentence: string | null;
};

/**
 * Resolve the exact Coco line text from server-owned state. Returns null when
 * the requested descriptor cannot be resolved (unknown turn, missing snapshot).
 * Never returns student transcript / speech-recognition text.
 */
function resolveLineText(
  lineKind: VoiceEligibleLineKind,
  characterId: string,
  turn: ResolvedSnapshotTurn | null,
  turnCount: number,
  feedbackVariant?: string,
): string | null {
  const profile = getCharacterProfile(characterId);

  switch (lineKind) {
    case "mission_prompt":
      return turn?.prompt ?? null;
    case "improved_sentence":
      // Only ever the AI-produced improved sentence — never a raw transcript.
      return turn?.improvedSentence ?? null;
    case "coco_transition":
      return profile.turnTransition;
    case "coco_feedback":
      return resolveFeedbackLineText(feedbackVariant) ?? profile.improvedSentenceIntro;
    case "completion_celebration":
      return `${profile.completionHeading} ${profile.completionBody(turnCount)}`;
    default:
      return null;
  }
}

function resolveFeedbackLineText(feedbackVariant?: string): string | null {
  switch (feedbackVariant) {
    case "accepted_original":
      return "Nice answer!";
    case "retry_original":
      return "Try again.";
    case "teacher_check":
    case "repeat_check":
      return "Your teacher will check this answer.";
    case "repeat_accepted":
      return "Good repeat.";
    default:
      return null;
  }
}

export async function POST(request: Request, context: RouteContext) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    return NextResponse.json(
      { ok: false, error: "session_expired" },
      { status: 401 },
    );
  }

  const { assignmentStudentId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const parsed = ttsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();

  // Load owned assignment + snapshot for line resolution and ownership.
  const { data: assignmentStudent, error: ownershipError } = await supabase
    .from("assignment_students")
    .select("id, student_id, assignments(mission_snapshot, canceled_at)")
    .eq("id", assignmentStudentId)
    .eq("student_id", unlock.studentId)
    .maybeSingle();

  if (ownershipError || !assignmentStudent) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  const rawSnapshot = (
    assignmentStudent as {
      assignments?: {
        mission_snapshot?: unknown;
        canceled_at?: string | null;
      } | null;
    }
  ).assignments;
  if (rawSnapshot?.canceled_at) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const snapshotResult = missionSnapshotSchema.safeParse(rawSnapshot?.mission_snapshot);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;

  const characterId = parsed.data.characterId ?? snapshot?.characterId ?? "default-buddy";
  const turnCount = snapshot?.turns.length ?? snapshot?.requiredTurns ?? 0;

  let resolvedTurn: ResolvedSnapshotTurn | null = null;
  if (parsed.data.turnOrder && snapshot) {
    const snapshotTurn = snapshot.turns.find(
      (missionTurn) => missionTurn.turnOrder === parsed.data.turnOrder,
    );
    if (snapshotTurn) {
      let improvedSentence: string | null = null;
      if (parsed.data.lineKind === "improved_sentence") {
        const { data: turnRow } = await supabase
          .from("attempt_turns")
          .select("improved_sentence, attempts!inner(assignment_student_id)")
          .eq("attempts.assignment_student_id", assignmentStudentId)
          .eq("turn_order", parsed.data.turnOrder)
          .maybeSingle();
        improvedSentence =
          (turnRow as { improved_sentence?: string | null } | null)
            ?.improved_sentence ?? null;
      }
      resolvedTurn = { prompt: snapshotTurn.prompt, improvedSentence };
    }
  }

  const text = resolveLineText(
    parsed.data.lineKind,
    characterId,
    resolvedTurn,
    turnCount,
    parsed.data.feedbackVariant,
  );

  if (!text || text.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  const result = await getOrCreateTtsAudio({
    studentId: unlock.studentId,
    assignmentStudentId,
    characterId,
    voice: DEFAULT_COCO_TTS_VOICE,
    text,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      cacheStatus: result.cacheStatus,
      audioUrl: result.audioUrl,
      mimeType: result.mimeType,
    });
  }

  if (result.error === "not_found") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // Provider/storage failures are non-blocking and retryable (D-15).
  return NextResponse.json(
    { ok: false, error: "tts_unavailable_retryable" },
    { status: 502 },
  );
}
