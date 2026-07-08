import { redirect } from "next/navigation";
import { after } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { missionSnapshotSchema } from "@/domain/mission/schemas";
import { getCharacterProfile } from "@/domain/character/profile";
import { nextUnfinishedTurnOrder } from "@/domain/flow/completion";
import { pageStyle, panelStyle } from "@/components/student/styles";
import { MissionFlowShell } from "@/components/student/MissionFlowShell";
import { warmEvaluators } from "@/server/ai/evaluator-warmup";

// Student mission-flow route (FLOW-01, D-12, PILOT-01).
//
// Server-rendered. Replicates the home-page unlock gate: if no fresh
// unlock cookie, redirect to /join. Verifies ownership (assignmentStudentId
// belongs to the unlocked student). Loads the assignment's mission_snapshot,
// parses it with missionSnapshotSchema (Pitfall 5: parse failure -> redirect
// home). Resolves the Coco character profile. Determines the resume position
// by loading any existing in_progress attempt turns. Redirects home for
// missing, completed, or expired/closed assignments (D-14).

type MissionPageProps = {
  params: Promise<{ assignmentStudentId: string }>;
};

export default async function MissionPage({ params }: MissionPageProps) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    redirect("/join");
  }

  const { assignmentStudentId } = await params;

  const supabase = createSupabaseServiceClient();

  // 1. Load the assignment_students row scoped to both id AND student_id (V4 ownership, T-04-12).
  const { data: asRow, error: asError } = await supabase
    .from("assignment_students")
    .select("id, assignment_id, student_id, status, latest_attempt_id")
    .eq("id", assignmentStudentId)
    .eq("student_id", unlock.studentId)
    .maybeSingle();

  if (asError || !asRow) {
    redirect("/student/home");
  }

  // 2. Guard: only recordable statuses may enter the mission flow. A student
  // who already submitted (teacher_review), finished (completed), or missed the
  // due date should never land on the recorder — the audio route rejects those
  // uploads with not_found, which previously surfaced as a dead-end
  // "audio_upload_failed". Any non-recordable status redirects home, where the
  // assignment list shows the real status (D-14).
  const RECORDABLE_STATUSES = new Set(["assigned", "started", "needs_retry"]);
  if (!RECORDABLE_STATUSES.has(asRow.status)) {
    redirect("/student/home");
  }

  // 3. Load the assignment row + mission_snapshot.
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, mission_snapshot, due_at, canceled_at")
    .eq("id", asRow.assignment_id)
    .single();

  if (assignmentError || !assignment) {
    redirect("/student/home");
  }

  if (assignment.canceled_at) {
    redirect("/student/home");
  }

  // Guard: expired (due_at in the past).
  if (assignment.due_at && new Date(assignment.due_at) < new Date()) {
    redirect("/student/home");
  }

  // 4. Parse the snapshot (Pitfall 5: on parse failure redirect home).
  let snapshot;
  try {
    snapshot = missionSnapshotSchema.parse(assignment.mission_snapshot);
  } catch {
    redirect("/student/home");
  }

  // 5. Resolve the character profile (Coco default buddy).
  const characterProfile = getCharacterProfile(snapshot.characterId);

  // 6. Determine resume position from existing in_progress attempt turns.
  let startingTurnIndex = 0; // 0-based index for the shell
  let attemptId: string | null = null;

  if (asRow.latest_attempt_id) {
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, status")
      .eq("id", asRow.latest_attempt_id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (attempt) {
      attemptId = attempt.id;

      const { data: turns } = await supabase
        .from("attempt_turns")
        .select("turn_order, original_transcript, repeat_transcript, repeat_accepted")
        .eq("attempt_id", attempt.id);

      const resumeOrder = nextUnfinishedTurnOrder(
        snapshot.requiredTurns,
        (turns ?? []).map((t) => ({
          turn_order: t.turn_order,
          original_transcript: t.original_transcript,
          repeat_transcript: t.repeat_transcript,
          repeat_accepted: t.repeat_accepted,
        })),
      );

      // Convert 1-based turn_order to 0-based index for the shell.
      // If resumeOrder > requiredTurns (all done sentinel), stay at last turn.
      startingTurnIndex = Math.min(resumeOrder - 1, snapshot.requiredTurns - 1);
    }
  }

  // Sort snapshot turns by turnOrder for consistent rendering.
  const sortedTurns = [...snapshot.turns].sort(
    (a, b) => a.turnOrder - b.turnOrder,
  );

  // Warms the OpenAI structured-output schema cache in the background so the
  // student's first recording doesn't pay the compile cost. Runs via
  // after() so the platform keeps the function alive to finish the request
  // even though the page response returns immediately (see
  // evaluator-warmup.ts for why this can't just be a bare fire-and-forget
  // promise on serverless).
  after(() => warmEvaluators(snapshot.level));

  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <MissionFlowShell
          assignmentStudentId={assignmentStudentId}
          attemptId={attemptId}
          missionTitle={snapshot.title}
          turns={sortedTurns}
          requiredTurns={snapshot.requiredTurns}
          characterProfile={{
            displayName: characterProfile.displayName,
            questionIntro: characterProfile.questionIntro,
            questionLabel: characterProfile.questionLabel,
            improvedSentenceIntro: characterProfile.improvedSentenceIntro,
            repeatInstruction: characterProfile.repeatInstruction,
            turnTransition: characterProfile.turnTransition,
            completionHeading: characterProfile.completionHeading,
            completionBody: characterProfile.completionBody(snapshot.requiredTurns),
            resumeNotice: characterProfile.resumeNotice,
          }}
          startingTurnIndex={startingTurnIndex}
          isResume={startingTurnIndex > 0}
        />
      </div>
    </main>
  );
}
