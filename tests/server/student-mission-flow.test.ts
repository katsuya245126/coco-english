import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("student mission flow AI routing stays app-owned (D-06, D-07)", () => {
  it("audio upload exports an app-owned evaluation write helper instead of letting AI own workflow state", async () => {
    const mod = await import("@/server/student-access/audio-upload");

    expect(mod.applyOriginalTurnEvaluation).toBeDefined();
    expect(mod.applyRepeatTurnEvaluation).toBeDefined();
  });

  it("correct original AI evaluation can complete a turn without a repeat while accepted repeat still works", async () => {
    const { isAttemptComplete } = await import("@/domain/flow/completion");

    const correctOriginalOnlyTurn = {
      turn_order: 1,
      original_transcript: "I like playing soccer after school.",
      repeat_transcript: null,
      repeat_accepted: null,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "accepted_original",
        requireRepeat: false,
      },
    };

    const acceptedRepeatTurn = {
      turn_order: 2,
      original_transcript: "I like soccer.",
      repeat_transcript: "I like playing soccer.",
      repeat_accepted: true,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "needs_correction",
        requireRepeat: true,
      },
    };

    expect(
      isAttemptComplete(2, [correctOriginalOnlyTurn, acceptedRepeatTurn]),
    ).toBe(true);
  });

  it("non-English original evaluation cannot pass through as successful English practice", async () => {
    const { isAttemptComplete } = await import("@/domain/flow/completion");

    expect(
      isAttemptComplete(1, [
        {
          turn_order: 1,
          original_transcript: "サッカーが好きです。",
          repeat_transcript: null,
          repeat_accepted: null,
          evaluation: {
            version: "ai-eval-v1",
            outcome: "retry_original",
            reason: "non_english",
          },
        },
      ]),
    ).toBe(false);
  });

  it("low-confidence, ambiguous, and malformed outputs route to teacher review without client-owned status writes", () => {
    const uploadSource = readFileSync(
      "src/server/student-access/audio-upload.ts",
      "utf8",
    );
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(uploadSource).toContain("evaluateOriginalTurn");
    expect(uploadSource).toContain("evaluateRepeatTurn");
    expect(uploadSource).toContain("teacher_review");
    expect(uploadSource).toContain("failed_schema");
    expect(uploadSource).toContain("low_confidence");
    expect(shellSource).not.toContain("teacher_review");
  });

  it("teacher-review feedback does not offer record-again actions after server status leaves the recorder flow", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(shellSource).toMatch(
      /onRetry=\{[\s\S]*flow\.originalFeedback\.kind === "teacherReview"[\s\S]*\?[\s\S]*undefined/,
    );
    expect(shellSource).toMatch(
      /onRetry=\{[\s\S]*flow\.repeatFeedback\.kind === "repeatReview"[\s\S]*\?[\s\S]*undefined/,
    );
  });

  it("needs-correction feedback exposes only one forward action unless retry is required", () => {
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );
    const needsCorrectionBranch = feedbackSource.slice(
      feedbackSource.indexOf('if (outcome === "needsCorrection")'),
      feedbackSource.indexOf('if (outcome === "retryOriginal")'),
    );

    expect(needsCorrectionBranch).toContain("forceRetryBeforeContinue ? (");
    expect(needsCorrectionBranch).toContain("<RecordAgainRequiredNotice />");
    expect(needsCorrectionBranch).toContain("<RecordingReview onRetry={onRetry} />");
    expect(needsCorrectionBranch).toContain("Try again");
    expect(needsCorrectionBranch).toContain("recordAgainButtonStyle");
    expect(needsCorrectionBranch).toContain("<MicIcon />");
    expect(feedbackSource).toContain(
      "Right sentence. Say it one more time clearly before you continue.",
    );
    expect(needsCorrectionBranch).not.toContain("PronunciationStars");
    expect(needsCorrectionBranch).not.toContain("WordsToPractice");
    expect(needsCorrectionBranch).not.toContain("Now say it out loud.");
    expect(needsCorrectionBranch.indexOf("<RecordingReview onRetry={onRetry} />")).toBeGreaterThan(
      needsCorrectionBranch.indexOf("<RecordAgainRequiredNotice />"),
    );
  });

  it("repeat-accepted feedback lets the student review or record again before continuing", () => {
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );
    const repeatAcceptedBranch = feedbackSource.slice(
      feedbackSource.indexOf('if (outcome === "repeatAccepted")'),
      feedbackSource.indexOf(
        'return (\n    <div style={stepCardStyle} aria-live="polite" role="alert">',
      ),
    );

    expect(repeatAcceptedBranch).toContain("Good repeat.");
    expect(repeatAcceptedBranch).toContain("Continue mission");
    expect(repeatAcceptedBranch).toContain("RecordingReview");
  });

  it("review routing is service-owned, audited, and AI-attributed", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    expect(missionFlowSource).toContain("routeAssignmentStudentToTeacherReview");
    expect(missionFlowSource).toContain("assertTransitionRequest");
    expect(missionFlowSource).toContain('status: "teacher_review"');
    expect(missionFlowSource).toContain("needs_review_reason");
    expect(missionFlowSource).toContain('actor_type: "ai_evaluator"');
    expect(missionFlowSource).toContain("reason_code:");
    expect(missionFlowSource).toContain('"low_confidence"');
    expect(missionFlowSource).toContain('"ambiguous"');
    expect(missionFlowSource).toContain('"failed_schema"');
  });

  it("service-role mission-flow writes verify attempt ownership before mutation", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    expect(missionFlowSource).toContain("loadOwnedAttempt");
    expect(missionFlowSource).toContain(".eq(\"assignment_student_id\", assignmentStudentId)");
    expect(missionFlowSource).toContain("attempt.attempt.status !== \"in_progress\"");
  });

  it("start attempts conditionally claim the assignment before returning the new attempt", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    expect(missionFlowSource).toContain("const { data: claimed");
    // Claim guard now uses dynamic asRow.status (not hardcoded "assigned") to support needs_retry
    expect(missionFlowSource).toContain(".eq(\"status\", asRow.status)");
    expect(missionFlowSource).toContain("status: \"abandoned\" as const");
    expect(missionFlowSource).toContain("resumed.latest_attempt_id");
  });

  it("needs_retry gate is accepted and uses reopened_by_teacher reason code (D-10)", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    // Gate accepts needs_retry
    expect(missionFlowSource).toContain('asRow.status !== "needs_retry"');
    // Reason code for needs_retry path
    expect(missionFlowSource).toContain('"reopened_by_teacher"');
    // Audit event uses dynamic previousStatus (not hardcoded "assigned")
    expect(missionFlowSource).toContain("previous_status: asRow.status");
    // Reason code in audit event uses dynamic variable
    expect(missionFlowSource).toContain("reason_code: reasonCode");
  });

  it("missed-but-open homework starts through the owned audited transition (D-22)", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    expect(missionFlowSource).toContain('asRow.status !== "missed"');
    expect(missionFlowSource).toContain('asRow.status === "missed"');
    expect(missionFlowSource).toContain('"late_mission_started"');
    expect(missionFlowSource).toContain('.eq("student_id", studentId)');
    expect(missionFlowSource).toContain("assignments(canceled_at)");
    expect(missionFlowSource).toContain("if (assignment?.canceled_at) return null");
    expect(missionFlowSource).toContain('.eq("status", asRow.status)');
    expect(missionFlowSource).toContain("attempt_count: asRow.attempt_count + 1");
    expect(missionFlowSource).toContain("latest_attempt_id: newAttempt.id");
    expect(missionFlowSource).toContain('actor_type: "student_session"');
    expect(missionFlowSource).toContain("reason_code: reasonCode");
    expect(missionFlowSource).toContain('status: "abandoned" as const');
  });

  it("completion is delegated to the atomic database RPC", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );

    expect(missionFlowSource).toContain('.rpc("complete_student_attempt"');
  });

  it("student client modules do not import OpenAI or server AI adapters (T-06-01)", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );

    const clientSource = `${shellSource}\n${feedbackSource}`;
    expect(clientSource).not.toMatch(/from ["']openai["']/);
    expect(clientSource).not.toMatch(/@\/server\/ai/);
  });

  it("keeps authored hint ladders while allowing exactly one dynamic pattern hint", () => {
    const hintSource = readFileSync(
      "src/components/student/HintRevealer.tsx",
      "utf8",
    );
    const questionSource = readFileSync(
      "src/components/student/StepBuddyQuestion.tsx",
      "utf8",
    );

    expect(hintSource).toContain("export type HintContent");
    expect(hintSource).toContain("singleHint: string");
    expect(hintSource).toContain("hintLadder?: never");
    expect(hintSource).toContain('label: "Hint: Pattern"');
    expect(hintSource).toContain("const maxLevel =");
    expect(questionSource).toContain("HintContent");
    expect(questionSource).toContain("<HintRevealer");
  });

  it("routes dynamic student questions through owned prompt state and safe UI branches", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const pageSource = readFileSync(
      "src/app/student/missions/[assignmentStudentId]/page.tsx",
      "utf8",
    );

    expect(shellSource).toContain("deriveActiveStudentQuestion");
    expect(shellSource).toContain("dynamicPrompt");
    expect(shellSource).toContain('kind === "unavailable"');
    expect(shellSource).toContain("recordingEnabled");
    expect(shellSource).toContain("coco_dynamic_line");
    expect(pageSource).toContain("coco_line");
    expect(pageSource).toContain("deriveResumedDynamicPrompt");
    expect(pageSource).toContain("initialDynamicPrompt");
  });

  it("advances accepted chat originals and repeats without preset success or transition steps", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(shellSource).toContain("resolveAcceptedConversationTurn");
    expect(shellSource).toContain("continueAcceptedConversationTurn");
    expect(shellSource).toMatch(
      /conversationMode[\s\S]*originalFeedback\.kind === "acceptedOriginal"[\s\S]*continueAcceptedConversationTurn/,
    );
    expect(shellSource).toMatch(
      /conversationMode[\s\S]*repeatFeedback\.kind === "repeatAccepted"[\s\S]*continueAcceptedConversationTurn/,
    );
    expect(shellSource).toContain('resolution.kind === "unavailable"');
    expect(shellSource).toContain("Coco’s next question isn’t available yet");
    expect(shellSource).toContain("StepTurnTransition");
    expect(shellSource).toContain("finishAcceptedOriginal");
    expect(shellSource).toContain("finishRepeatFeedback");
  });
});
