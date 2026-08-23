import { redirect } from "next/navigation";
import { after } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import { getCharacterProfile } from "@/domain/character/profile";
import {
  getPendingTurnReview,
  nextUnfinishedTurnOrder,
  type PendingTurnReview,
} from "@/domain/flow/completion";
import {
  missionContentStyle,
  missionPageStyle,
} from "@/components/student/styles";
import { MissionFlowShell } from "@/components/student/MissionFlowShell";
import { warmEvaluators } from "@/server/ai/evaluator-warmup";
import {
  deriveResumedDynamicPrompt,
  isPendingConversationRecovery,
} from "@/domain/mission/student-question-state";

// Student mission-flow route (FLOW-01, D-12, PILOT-01).
//
// Server-rendered. Replicates the home-page unlock gate: if no fresh
// unlock cookie, redirect to /join. Verifies ownership (assignmentStudentId
// belongs to the unlocked student). Loads the assignment's mission_snapshot,
// interprets it through the shared mission snapshot contract (Pitfall 5: any
// result other than complete -> redirect home).
// Resolves the Coco character profile. Determines the resume position
// by loading any existing in_progress attempt turns. Redirects home for
// missing, completed, or closed assignments (D-14).

type MissionPageProps = {
  params: Promise<{ assignmentStudentId: string }>;
};

type InitialReview = PendingTurnReview & { audioUrl?: string };

const RESUMED_AUDIO_URL_TTL_SECONDS = 60 * 10;

export default async function MissionPage({ params }: MissionPageProps) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    redirect("/join");
  }

  const { assignmentStudentId } = await params;

  const supabase = createSupabaseServiceClient();

  // 1. Prove ownership through the one auditable seam (V4 ownership,
  // T-04-12): row + canceled guard + parsed snapshot in a single call.
  const owned = await requireOwnedAssignmentStudent({
    studentId: unlock.studentId,
    assignmentStudentId,
  });
  if (!owned.ok) {
    redirect("/student/home");
  }
  const asRow = owned.owned;

  // 2. Guard: only recordable statuses may enter the mission flow. A student
  // who already submitted (teacher_review) or finished (completed) should never
  // land on the recorder. Any non-recordable status redirects home, where the
  // assignment list shows the real status (D-14).
  const RECORDABLE_STATUSES = new Set([
    "assigned",
    "started",
    "missed",
    "needs_retry",
  ]);
  if (!RECORDABLE_STATUSES.has(asRow.status)) {
    redirect("/student/home");
  }

  // Pitfall 5: any snapshot other than complete -> redirect home.
  const snapshot = asRow.snapshot;
  if (!snapshot) {
    redirect("/student/home");
  }

  // 5. Resolve the character profile (Coco default buddy).
  const characterProfile = getCharacterProfile(snapshot.characterId);

  // 6. Determine resume position from existing in_progress attempt turns.
  let startingTurnIndex = 0; // 0-based index for the shell
  let attemptId: string | null = null;
  let initialReview: InitialReview | null = null;
  let attemptTurns: Array<{ turnOrder: number; cocoLine: string | null }> = [];
  let pendingConversationRecovery = false;

  if (asRow.latestAttemptId) {
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, status")
      .eq("id", asRow.latestAttemptId)
      .eq("status", "in_progress")
      .maybeSingle();

    if (attempt) {
      attemptId = attempt.id;

      const { data: turns } = await supabase
        .from("attempt_turns")
        .select("id, turn_order, original_transcript, improved_sentence, repeat_transcript, repeat_accepted, evaluation, coco_line")
        .eq("attempt_id", attempt.id);

      const resumeOrder = nextUnfinishedTurnOrder(
        snapshot.requiredTurns,
        (turns ?? []).map((t) => ({
          turn_order: t.turn_order,
          original_transcript: t.original_transcript,
          improved_sentence: t.improved_sentence,
          repeat_transcript: t.repeat_transcript,
          repeat_accepted: t.repeat_accepted,
          evaluation: t.evaluation,
          coco_line: t.coco_line,
        })),
      );

      attemptTurns = (turns ?? []).map((turn) => ({
        turnOrder: turn.turn_order,
        cocoLine: turn.coco_line,
      }));

      // Convert 1-based turn_order to 0-based index for the shell.
      // If resumeOrder > requiredTurns (all done sentinel), stay at last turn.
      startingTurnIndex = Math.min(resumeOrder - 1, snapshot.requiredTurns - 1);

      const reviewTurnOrder = Math.min(resumeOrder, snapshot.requiredTurns);
      const reviewTurn = (turns ?? []).find(
        (turn) => turn.turn_order === reviewTurnOrder,
      );
      const persistedReview = reviewTurn
        ? getPendingTurnReview(reviewTurn)
        : null;

      pendingConversationRecovery = isPendingConversationRecovery({
        conversationMode: snapshot.conversationMode,
        evaluation: reviewTurn?.evaluation,
        cocoLine: reviewTurn?.coco_line ?? null,
      });

      if (persistedReview && reviewTurn) {
        initialReview = persistedReview;

        const { data: audioClip } = await supabase
          .from("audio_clips")
          .select("object_key")
          .eq("attempt_turn_id", reviewTurn.id)
          .eq("clip_kind", persistedReview.clipKind)
          .eq("processing_status", "transcribed")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (audioClip?.object_key) {
          const { data: signedAudio } = await supabase.storage
            .from("student-audio")
            .createSignedUrl(
              audioClip.object_key,
              RESUMED_AUDIO_URL_TTL_SECONDS,
            );
          if (signedAudio?.signedUrl) {
            initialReview = {
              ...persistedReview,
              audioUrl: signedAudio.signedUrl,
            };
          }
        }
      }
    }
  }

  // Sort snapshot turns by turnOrder for consistent rendering.
  const sortedTurns = [...snapshot.turns].sort(
    (a, b) => a.turnOrder - b.turnOrder,
  );
  const initialDynamicPrompt = deriveResumedDynamicPrompt({
    conversationMode: snapshot.conversationMode,
    startingTurnIndex,
    pendingUnclearRetry: pendingConversationRecovery,
    attemptTurns,
  });

  // Warms the OpenAI structured-output schema cache in the background so the
  // student's first recording doesn't pay the compile cost. Runs via
  // after() so the platform keeps the function alive to finish the request
  // even though the page response returns immediately (see
  // evaluator-warmup.ts for why this can't just be a bare fire-and-forget
  // promise on serverless).
  after(() => warmEvaluators(snapshot.level));

  return (
    <main style={missionPageStyle}>
      <div style={missionContentStyle}>
        <MissionFlowShell
          assignmentStudentId={assignmentStudentId}
          attemptId={attemptId}
          missionTitle={snapshot.title}
          turns={sortedTurns}
          requiredTurns={snapshot.requiredTurns}
          conversationMode={snapshot.conversationMode}
          characterProfile={{
            displayName: characterProfile.displayName,
            questionIntro: characterProfile.questionIntro,
            questionLabel: characterProfile.questionLabel,
            turnTransition: characterProfile.turnTransition,
            completionHeading: characterProfile.completionHeading,
            completionBody: characterProfile.completionBody(snapshot.requiredTurns),
            resumeNotice: characterProfile.resumeNotice,
          }}
          startingTurnIndex={startingTurnIndex}
          initialDynamicPrompt={initialDynamicPrompt}
          isResume={attemptId !== null}
          initialReview={initialReview}
        />
      </div>
    </main>
  );
}
