import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const transitionSource = readFileSync(
  join(process.cwd(), "src/domain/flow/mission-transitions.ts"),
  "utf8",
);

describe("student mission flow AI routing stays app-owned (D-06, D-07)", () => {
  it("keeps answer evaluation free of app-owned persistence imports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/server/ai/answer-evaluation.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/@\/lib\/supabase|@\/server\/student-access/);
  });

  it("correct original AI evaluation can complete a turn without a repeat while accepted repeat still works", async () => {
    const { isAttemptComplete } = await import("@/domain/flow/completion");

    const correctOriginalOnlyTurn = {
      turn_order: 1,
      original_transcript: "I like playing soccer after school.",
      repeat_transcript: null,
      repeat_accepted: null,
      evaluation: {
        kind: "original",
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
        kind: "original",
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
            kind: "original",
            version: "ai-eval-v1",
            outcome: "retry_original",
            reason: "non_english",
          },
        },
      ]),
    ).toBe(false);
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

  it("keeps incomplete-recording recovery neutral and on the same question", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );

    expect(feedbackSource).toContain(
      "It sounds like the recording stopped early. Try recording your answer again.",
    );
    expect(transitionSource).toContain('retryReason === "incomplete_recording"');
    expect(transitionSource).toContain('kind: "retryIncompleteRecording"');
    expect(shellSource).toContain(
      'flow.originalFeedback?.kind === "retryIncompleteRecording"',
    );
    expect(shellSource).toContain("line: null");
  });

  it("shows the transcript and requires a retry when Coco is unsure", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );
    const ttsSource = readFileSync(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
      "utf8",
    );
    const branch = feedbackSource.slice(
      feedbackSource.indexOf('if (outcome === "retryUnclearMeaning")'),
      feedbackSource.indexOf('if (outcome === "retryIncompleteRecording")'),
    );

    expect(transitionSource).toContain('retryReason === "unclear_meaning"');
    expect(transitionSource).toContain('kind: "retryUnclearMeaning"');
    expect(shellSource).toContain('text: "Hmm... try one more time."');
    expect(shellSource).toContain(
      'feedbackVariant: "retry_unclear_meaning"',
    );
    expect(branch).toContain(
      "<Transcript transcript={transcript} audioUrl={audioUrl} />",
    );
    expect(branch).toContain("<RecordingReview onRetry={onRetry} />");
    expect(branch).not.toContain("onContinue");
    expect(ttsSource).toContain('case "retry_unclear_meaning":');
    expect(ttsSource).toContain('return "Hmm... try one more time.";');
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

  it("repeat-limit feedback continues neutrally without acceptance or retry", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );

    expect(shellSource).toContain('"repeatLimitReached"');
    expect(shellSource).toContain(
      'repeatFeedback.kind === "repeatLimitReached"',
    );
    expect(feedbackSource).toContain('outcome === "repeatLimitReached"');
    const limitBranch = feedbackSource.slice(
      feedbackSource.indexOf('if (outcome === "repeatLimitReached")'),
      feedbackSource.indexOf('if (outcome === "repeatAccepted")'),
    );
    expect(limitBranch).toContain("Continue mission");
    expect(limitBranch).toContain("Let’s continue.");
    expect(limitBranch).not.toContain("Good repeat.");
    expect(limitBranch).not.toContain("RecordAgainRequiredNotice");
  });

  it("keeps obsolete writers out of mission-flow and live writes owned", () => {
    const missionFlowSource = readFileSync(
      "src/server/student-access/mission-flow.ts",
      "utf8",
    );
    const speakingTrySource = readFileSync(
      "src/server/student-access/speaking-try-persistence.ts",
      "utf8",
    );
    const audioUploadSource = readFileSync(
      "src/server/student-access/audio-upload.ts",
      "utf8",
    );

    expect(missionFlowSource).not.toMatch(
      /export (?:async )?function (?:recordAnswer|recordRepeat|recordCocoLine|flagAttemptForTeacherReview)\b/,
    );
    expect(missionFlowSource).not.toMatch(
      /export type (?:RecordAnswerResult|RecordRepeatResult|RecordCocoLineResult|RouteTeacherReviewResult|TeacherReviewReason)\b/,
    );

    expect(speakingTrySource).toContain('"owned_speaking_try_operation"');
    for (const operation of [
      '"write_original_turn"',
      '"write_repeat_turn"',
      '"record_coco_line"',
      '"route_teacher_review"',
    ]) {
      expect(speakingTrySource).toContain(operation);
    }
    for (const persistencePhase of [
      "persistence.persistTurn",
      "persistence.persistCocoLine",
    ]) {
      expect(audioUploadSource).toContain(persistencePhase);
    }
    expect(audioUploadSource).not.toContain("routeTeacherReview");
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

  it("keeps authored hint ladders while removing stale dynamic pattern hints", () => {
    const hintSource = readFileSync(
      "src/components/student/HintRevealer.tsx",
      "utf8",
    );
    const questionSource = readFileSync(
      "src/components/student/StepBuddyQuestion.tsx",
      "utf8",
    );

    expect(hintSource).toContain("hintLadder: HintLadder");
    expect(hintSource).not.toContain("singleHint");
    expect(questionSource).toContain("hintLadder?: never");
    expect(hintSource).toContain('label: "Hint: Pattern"');
    expect(hintSource).toContain("const maxLevel =");
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
    expect(shellSource).toContain("getTranslationLine");
    expect(shellSource).toContain('flow.step === "question"');
    expect(shellSource).toContain('flow.step === "closing"');
    expect(pageSource).toContain("coco_line");
    expect(pageSource).toContain("deriveResumedDynamicPrompt");
    expect(pageSource).toContain("initialDynamicPrompt");
  });

  it("advances accepted chat originals and repeats without preset success or transition steps", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(transitionSource).toContain("resolveAcceptedConversationTurn");
    expect(shellSource).toContain("transitionMissionFlow");
    expect(transitionSource).toContain('resolution.kind === "unavailable"');
    expect(shellSource).toContain("Coco’s next question isn’t available yet");
    expect(shellSource).toContain("finishRepeatFeedback");
  });

  it("silently advances reviewed conversation originals and repeats", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(transitionSource).toMatch(
      /event\.conversationMode[\s\S]*feedback\.kind === "acceptedOriginal"[\s\S]*feedback\.kind === "teacherReview"[\s\S]*conversationTurnTransition/,
    );
    expect(transitionSource).toMatch(
      /event\.conversationMode[\s\S]*repeatFeedback\.kind === "repeatAccepted"[\s\S]*repeatFeedback\.kind === "repeatReview"[\s\S]*conversationTurnTransition/,
    );
    expect(shellSource).toContain("finishOriginalFeedback");
  });

  it("completes once, shows the final Coco closing, then waits for Finish mission", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const closingSource = readFileSync(
      "src/components/student/StepConversationClosing.tsx",
      "utf8",
    );

    expect(transitionSource).toContain('| { kind: "closing"; state: FlowState }');
    expect(transitionSource).toContain('resolution.kind === "closing"');
    expect(shellSource).toContain("completeMissionAction");
    expect(transitionSource).toContain('step: "closing"');
    expect(shellSource).toContain("<StepConversationClosing");
    expect(shellSource).toContain('lineKind: "coco_dynamic_line"');
    expect(shellSource).toContain("applyTransition(decision, aid");
    expect(shellSource).toMatch(
      /function finishConversationClosing\(\) \{\s*router\.push\(`\/student\/history\/\$\{assignmentStudentId\}`\);\s*\}/,
    );
    expect(shellSource).toContain(
      'flow.step === "complete" && !conversationMode',
    );
    expect(closingSource).toContain("Finish mission");
    expect(closingSource).toContain("onFinish");
    expect(closingSource).not.toContain("completeMissionAction");
    expect(closingSource).not.toContain("disabled=");
    expect(closingSource).not.toContain("CocoSpeechAudio");
  });
});

describe("live feedback consumes only the learner-safe transcript", () => {
  it("reads displayTranscript from the upload response and never the raw transcript", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    expect(shellSource).toContain("displayTranscript");
    // The route no longer sends a raw transcript; reading one would silently
    // resurrect Hangul the evaluator never vouched for.
    expect(shellSource).not.toMatch(/payload\.transcript\b/);
    expect(shellSource).not.toMatch(/transcript\?:\s*string;/);
  });

  it("accepts a null display transcript as a successful upload", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );

    // Only a non-null value has to be a non-empty string; null is valid and
    // must not be treated as a failed upload.
    expect(shellSource).toMatch(
      /payload\.displayTranscript !== null &&[\s\S]*?typeof payload\.displayTranscript !== "string"/,
    );
  });

  it("types feedback transcripts as nullable so the You said block can hide", () => {
    const shellSource = readFileSync(
      "src/components/student/MissionFlowShell.tsx",
      "utf8",
    );
    const feedbackSource = readFileSync(
      "src/components/student/StepAiEvaluationFeedback.tsx",
      "utf8",
    );

    expect(shellSource).not.toMatch(/^\s+transcript: string;$/m);
    // The card already hides "You said" for a null transcript while keeping
    // the correction, retry guidance, and audio player.
    expect(feedbackSource).toContain("if (!transcript) return null;");
  });
});
