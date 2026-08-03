import { NextResponse } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import {
  pronunciationPracticeSnapshotSchema,
  resolvePronunciationFeedbackLineText,
} from "@/domain/pronunciation/practice";
import { getCharacterProfile } from "@/domain/character/profile";
import {
  DEFAULT_COCO_TTS_VOICE,
  ttsRequestSchema,
  type VoiceEligibleLineKind,
} from "@/domain/audio/tts";
import { getOrCreateTtsAudio } from "@/server/audio/tts-cache";
import { consumeRequestBudget } from "@/server/security/request-budget";

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
  cocoLine: string | null;
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
      return profile.completionHeading;
    case "coco_dynamic_line":
      // Phase 11 CHAT-02 — Coco's dynamically-generated reply. Already
      // moderated + persisted server-side (11-03); resolved here from
      // attempt_turns.coco_line only, never from client-supplied text.
      return turn?.cocoLine ?? null;
    default:
      return null;
  }
}

function resolveFeedbackLineText(feedbackVariant?: string): string | null {
  switch (feedbackVariant) {
    case "accepted_original":
      return "Nice answer!";
    case "needs_correction":
      return "Hmm... let's try again";
    case "retry_original":
      return "Try again.";
    case "retry_unclear_meaning":
      return "Hmm... try one more time.";
    case "retry_minimal_example":
      return "Try the example below!";
    case "retry_minimal_detail":
      return "Answer Coco's question and add one detail.";
    case "retry_minimal_unsure":
      return "It's okay to guess. Try one answer!";
    case "retry_repeat":
      return "Try again!";
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

  // Prove ownership + load the frozen snapshot through the one auditable seam.
  const owned = await requireOwnedAssignmentStudent({
    studentId: unlock.studentId,
    assignmentStudentId,
  });
  if (!owned.ok) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const snapshot = owned.owned.snapshot;
  const isPronunciationAssignment = owned.owned.assignmentKind === "pronunciation";
  if (!isPronunciationAssignment && !snapshot) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const pronunciationSnapshotResult = isPronunciationAssignment
    ? pronunciationPracticeSnapshotSchema.safeParse(owned.owned.rawSnapshot)
    : null;
  const pronunciationSnapshot = pronunciationSnapshotResult?.success
    ? pronunciationSnapshotResult.data
    : null;
  const pronunciationWord = pronunciationSnapshot?.words.find(
    (word) => word.order === parsed.data.turnOrder,
  );
  const pronunciationFeedbackText = resolvePronunciationFeedbackLineText(
    parsed.data.feedbackVariant,
    {
      soundId: pronunciationSnapshot?.soundId,
      word: pronunciationWord?.text,
    },
  );
  if (
    isPronunciationAssignment &&
    (parsed.data.lineKind !== "coco_feedback" ||
      !pronunciationFeedbackText)
  ) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const characterId = isPronunciationAssignment
    ? "pronunciation-practice"
    : snapshot!.characterId;
  // A restarted/retried mission produces additional attempts whose
  // attempt_turns reuse the same turn_order values, so the per-turn lookups
  // below must pin to the current attempt — an assignment-wide join returns
  // duplicate rows and .maybeSingle() errors, surfacing as "Voice unavailable".
  const latestAttemptId = owned.owned.latestAttemptId;

  let resolvedTurn: ResolvedSnapshotTurn | null = null;
  if (parsed.data.turnOrder && snapshot) {
    // Conversation-mode missions generate turns dynamically and may have zero
    // or few pre-authored snapshot turns — the dynamic-line lookup does not
    // depend on a matching snapshotTurn existing.
    const snapshotTurn = snapshot.turns.find(
      (missionTurn) => missionTurn.turnOrder === parsed.data.turnOrder,
    );

    let improvedSentence: string | null = null;
    let cocoLine: string | null = null;

    if (parsed.data.lineKind === "improved_sentence" && latestAttemptId) {
      const { data: turnRow } = await supabase
        .from("attempt_turns")
        .select("improved_sentence")
        .eq("attempt_id", latestAttemptId)
        .eq("turn_order", parsed.data.turnOrder)
        .maybeSingle();
      improvedSentence =
        (turnRow as { improved_sentence?: string | null } | null)
          ?.improved_sentence ?? null;
    }

    if (parsed.data.lineKind === "coco_dynamic_line" && latestAttemptId) {
      const { data: turnRow } = await supabase
        .from("attempt_turns")
        .select("coco_line")
        .eq("attempt_id", latestAttemptId)
        .eq("turn_order", parsed.data.turnOrder)
        .maybeSingle();
      cocoLine =
        (turnRow as { coco_line?: string | null } | null)?.coco_line ?? null;
    }

    if (snapshotTurn || parsed.data.lineKind === "coco_dynamic_line") {
      resolvedTurn = {
        prompt: snapshotTurn?.prompt ?? "",
        improvedSentence,
        cocoLine,
      };
    }
  }

  const text = isPronunciationAssignment
    ? pronunciationFeedbackText
    : resolveLineText(
        parsed.data.lineKind,
        characterId,
        resolvedTurn,
        parsed.data.feedbackVariant,
      );

  if (!text || text.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // The requested line is owned and resolved by this point, so a forged or
  // unresolvable descriptor cannot spend the student's allowance. Consuming
  // here keeps the cache lookup, signing, and provider call behind admission.
  const budget = await consumeRequestBudget({
    actorId: unlock.studentId,
    operation: "student_helper",
  });
  if (!budget.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      },
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
