"use client";

/**
 * Mission flow step-state machine (FLOW-02/04/05, D-03/D-12, CHAR-01/02).
 *
 * Owns `FlowState` (turnIndex, step, hintLevel, originalTranscript) via useState.
 * Shows exactly ONE step card at a time (D-12 — no scrolling thread).
 * Steps: question -> repeat -> transition -> (next turn or complete).
 * Step transitions are client state, NOT URL changes (Anti-Pattern).
 * All buddy/sentence text comes from snapshot + static profile — no AI client.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import type {
  PronunciationStarBand,
  WordHighlight,
} from "@/domain/pronunciation/scoring";
import {
  startAttemptAction,
  completeMissionAction,
  revealHintAction,
} from "@/app/student/missions/[assignmentStudentId]/actions";
import {
  displayTitleStyle,
  primaryButtonStyle,
  resumeNoticeStyle,
  stepCardStyle,
} from "@/components/student/styles";
import { StepBuddyQuestion } from "@/components/student/StepBuddyQuestion";
import { StepImprovedRepeat } from "@/components/student/StepImprovedRepeat";
import { StepAiEvaluationFeedback } from "@/components/student/StepAiEvaluationFeedback";
import { StepTurnTransition } from "@/components/student/StepTurnTransition";
import { StepMissionComplete } from "@/components/student/StepMissionComplete";
import { TurnProgressBar } from "@/components/student/TurnProgressBar";
import type { RecordedVoiceClip } from "@/components/student/StepBuddyQuestion";
import type { RepeatVoiceClip } from "@/components/student/StepImprovedRepeat";

// ─── Types ───

export type FlowStep =
  | "question"
  | "aiFeedback"
  | "repeat"
  | "repeatFeedback"
  | "transition"
  | "reviewPending"
  | "complete";

type OriginalFeedback =
  | {
      kind: "acceptedOriginal";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "needsCorrection";
      transcript: string;
      improvedSentence: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryOriginal";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "teacherReview";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    };

export type RepeatFeedbackCompatibility = "repeatAccepted" | "teacherReview";

type RepeatFeedback =
  | {
      kind: "repeatAccepted";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "repeatRetry";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "repeatReview";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    };

type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalTranscript: string | null;
  repeatTranscript: string | null;
  improvedSentence: string | null;
  originalFeedback: OriginalFeedback | null;
  repeatFeedback: RepeatFeedback | null;
  // True once the student has retried a recording on the current turn — a
  // 1-star result only forces a retry the first time, so this never traps a
  // student who genuinely struggles with a turn (D-04 checkpoint decision).
  hasRetriedThisTurn: boolean;
};

export type CharacterProfileLines = {
  displayName: string;
  questionIntro: string;
  questionLabel: string;
  improvedSentenceIntro: string;
  repeatInstruction: string;
  turnTransition: string;
  completionHeading: string;
  completionBody: string;
  resumeNotice: string;
};

export type MissionFlowShellProps = {
  assignmentStudentId: string;
  attemptId: string | null;
  missionTitle: string;
  turns: MissionSnapshotTurn[];
  requiredTurns: number;
  characterProfile: CharacterProfileLines;
  startingTurnIndex: number;
  isResume: boolean;
};

export function MissionFlowShell({
  assignmentStudentId,
  attemptId: initialAttemptId,
  missionTitle,
  turns,
  requiredTurns,
  characterProfile,
  startingTurnIndex,
  isResume,
}: MissionFlowShellProps) {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>({
    turnIndex: startingTurnIndex,
    step: "question",
    hintLevel: 0,
    originalTranscript: null,
    repeatTranscript: null,
    improvedSentence: null,
    originalFeedback: null,
    repeatFeedback: null,
    hasRetriedThisTurn: false,
  });

  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId);
  const [actionError, setActionError] = useState<string | null>(null);
  const originalAudioUrlRef = useRef<string | null>(null);
  const repeatAudioUrlRef = useRef<string | null>(null);

  // Guards against an in-flight upload/score request resolving after a
  // newer one (e.g. a slow first attempt's response landing after a
  // quick "record again" retry) and overwriting fresher feedback state.
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);
  const submissionTokenRef = useRef(0);

  // ─── Resume notice (D-04) ───
  const [showResumeNotice, setShowResumeNotice] = useState(isResume);

  useEffect(() => {
    if (!showResumeNotice) return;
    const timer = setTimeout(() => setShowResumeNotice(false), 5000);
    return () => clearTimeout(timer);
  }, [showResumeNotice]);

  const currentTurn = turns[flow.turnIndex];
  // 1-based turn number for display
  const currentTurnNumber = flow.turnIndex + 1;

  // ─── Handlers ───

  async function ensureAttempt(): Promise<string | null> {
    if (attemptId) return attemptId;

    // Start a new attempt via server action
    const result = await startAttemptAction({ assignmentStudentId });
    if (result.ok) {
      setAttemptId(result.attemptId);
      return result.attemptId;
    }
    setActionError("Something went wrong. Try again, or ask your teacher for help.");
    return null;
  }

  type UploadVoiceClipPayload = {
    transcript: string;
    evaluation?: {
      outcome?: string;
      improvedSentence?: string | null;
    };
    starBand?: PronunciationStarBand | null;
    wordsToPractice?: WordHighlight[];
  };

  async function uploadVoiceClip(input: {
    recording: RecordedVoiceClip | RepeatVoiceClip;
    aid: string;
    clipKind: "original_answer" | "repeat_attempt";
  }): Promise<UploadVoiceClipPayload> {
    const formData = new FormData();
    formData.set("file", input.recording.blob, `${input.clipKind}.webm`);
    formData.set("attemptId", input.aid);
    formData.set("turnOrder", String(currentTurn.turnOrder));
    formData.set("clipKind", input.clipKind);
    formData.set("durationMs", String(input.recording.durationMs));
    formData.set("mimeType", input.recording.mimeType);

    const response = await fetch(
      `/student/missions/${assignmentStudentId}/audio`,
      {
        method: "POST",
        body: formData,
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          transcript?: string;
          error?: string;
          evaluation?: UploadVoiceClipPayload["evaluation"];
          starBand?: PronunciationStarBand | null;
          wordsToPractice?: WordHighlight[];
        }
      | null;
    if (
      !response.ok ||
      payload?.ok !== true ||
      typeof payload.transcript !== "string" ||
      payload.transcript.trim().length === 0
    ) {
      if (payload?.error === "transcription_failed_retryable") {
        throw new Error("We could not hear that clearly. Record again.");
      }
      throw new Error("audio_upload_failed");
    }

    return {
      transcript: payload.transcript,
      evaluation: payload.evaluation,
      starBand: payload.starBand,
      wordsToPractice: payload.wordsToPractice,
    };
  }

  function repeatFeedbackFromEvaluation(
    transcript: string,
    evaluation: UploadVoiceClipPayload["evaluation"],
    starBand?: PronunciationStarBand | null,
    wordsToPractice?: WordHighlight[],
  ): RepeatFeedback {
    if (evaluation?.outcome === "retry_repeat") {
      return { kind: "repeatRetry", transcript, starBand, wordsToPractice };
    }
    if (evaluation?.outcome === "teacher" + "_" + "review") {
      return { kind: "repeatReview", transcript, starBand, wordsToPractice };
    }
    return { kind: "repeatAccepted", transcript, starBand, wordsToPractice };
  }

  function feedbackFromEvaluation(
    transcript: string,
    evaluation: UploadVoiceClipPayload["evaluation"],
    starBand?: PronunciationStarBand | null,
    wordsToPractice?: WordHighlight[],
  ): OriginalFeedback {
    const teacherReviewOutcome = "teacher" + "_" + "review";
    if (evaluation?.outcome === "needs_correction" && evaluation.improvedSentence) {
      return {
        kind: "needsCorrection",
        transcript,
        improvedSentence: evaluation.improvedSentence,
        starBand,
        wordsToPractice,
      };
    }
    if (evaluation?.outcome === "retry_original") {
      return { kind: "retryOriginal", transcript, starBand, wordsToPractice };
    }
    if (evaluation?.outcome === teacherReviewOutcome) {
      return { kind: "teacherReview", transcript, starBand, wordsToPractice };
    }
    return { kind: "acceptedOriginal", transcript, starBand, wordsToPractice };
  }

  function revokeAudioUrls() {
    if (originalAudioUrlRef.current) {
      URL.revokeObjectURL(originalAudioUrlRef.current);
      originalAudioUrlRef.current = null;
    }
    if (repeatAudioUrlRef.current) {
      URL.revokeObjectURL(repeatAudioUrlRef.current);
      repeatAudioUrlRef.current = null;
    }
  }

  async function handleSubmitOriginalVoice(recording: RecordedVoiceClip) {
    setActionError(null);
    // Dismiss resume notice on first submit (D-04)
    setShowResumeNotice(false);

    const token = ++submissionTokenRef.current;
    setIsSubmittingVoice(true);

    try {
      if (originalAudioUrlRef.current) URL.revokeObjectURL(originalAudioUrlRef.current);
      originalAudioUrlRef.current = URL.createObjectURL(recording.blob);

      const aid = await ensureAttempt();
      if (!aid) {
        throw new Error("attempt_start_failed");
      }

      const upload = await uploadVoiceClip({
        recording,
        aid,
        clipKind: "original_answer",
      });

      // A newer submission has started since this one began — discard this
      // stale result so it can never overwrite fresher feedback state.
      if (token !== submissionTokenRef.current) return;

      const transcript = upload.transcript;
      const originalFeedback = feedbackFromEvaluation(
        transcript,
        upload.evaluation,
        upload.starBand,
        upload.wordsToPractice,
      );

      const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
      if (isFinalTurn && originalFeedback.kind === "acceptedOriginal") {
        const result = await completeMissionAction({
          assignmentStudentId,
          attemptId: aid,
          requiredTurns,
        });
        if (token !== submissionTokenRef.current) return;
        if (!result.ok) {
          setActionError("Something went wrong. Try again, or ask your teacher for help.");
          throw new Error("mission_complete_failed");
        }
        setFlow((prev) => ({ ...prev, step: "complete", originalTranscript: transcript, originalFeedback, repeatFeedback: null }));
        return;
      }

      setFlow((prev) => ({
        ...prev,
        step: "aiFeedback",
        originalTranscript: transcript,
        repeatTranscript: null,
        improvedSentence:
          originalFeedback.kind === "needsCorrection"
            ? originalFeedback.improvedSentence
            : null,
        originalFeedback,
        repeatFeedback: null,
      }));
    } finally {
      if (token === submissionTokenRef.current) setIsSubmittingVoice(false);
    }
  }

  async function handleSubmitRepeatVoice(recording: RepeatVoiceClip) {
    setActionError(null);

    const token = ++submissionTokenRef.current;
    setIsSubmittingVoice(true);

    try {
      if (repeatAudioUrlRef.current) URL.revokeObjectURL(repeatAudioUrlRef.current);
      repeatAudioUrlRef.current = URL.createObjectURL(recording.blob);

      const aid = await ensureAttempt();
      if (!aid) {
        throw new Error("attempt_start_failed");
      }

      const upload = await uploadVoiceClip({
        recording,
        aid,
        clipKind: "repeat_attempt",
      });

      // A newer submission has started since this one began — discard this
      // stale result so it can never overwrite fresher feedback state.
      if (token !== submissionTokenRef.current) return;

      const transcript = upload.transcript;
      const repeatFeedback = repeatFeedbackFromEvaluation(
        transcript,
        upload.evaluation,
        upload.starBand,
        upload.wordsToPractice,
      );

      const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
      if (isFinalTurn && repeatFeedback.kind === "repeatAccepted") {
        const result = await completeMissionAction({
          assignmentStudentId,
          attemptId: aid,
          requiredTurns,
        });
        if (token !== submissionTokenRef.current) return;
        if (!result.ok) {
          setActionError("Something went wrong. Try again, or ask your teacher for help.");
          throw new Error("mission_complete_failed");
        }
        setFlow((prev) => ({ ...prev, repeatTranscript: transcript, repeatFeedback, step: "complete" }));
        return;
      }

      setFlow((prev) => ({
        ...prev,
        repeatTranscript: transcript,
        repeatFeedback,
        step: "repeatFeedback",
      }));
    } finally {
      if (token === submissionTokenRef.current) setIsSubmittingVoice(false);
    }
  }

  async function finishRepeatFeedback() {
    const aid = await ensureAttempt();
    if (!aid) {
      throw new Error("attempt_start_failed");
    }

    const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
    if (isFinalTurn && flow.repeatFeedback?.kind === "repeatAccepted") {
      const result = await completeMissionAction({
        assignmentStudentId,
        attemptId: aid,
        requiredTurns,
      });
      if (!result.ok) {
        setActionError("Something went wrong. Try again, or ask your teacher for help.");
        throw new Error("mission_complete_failed");
      }
    }

    setFlow((prev) => ({
      ...prev,
      step: isFinalTurn ? "complete" : "transition",
    }));
  }

  function finishTeacherReviewFeedback() {
    const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
    setFlow((prev) => ({
      ...prev,
      step: isFinalTurn ? "reviewPending" : "transition",
    }));
  }

  async function finishAcceptedOriginal() {
    const aid = await ensureAttempt();
    if (!aid) {
      throw new Error("attempt_start_failed");
    }

    const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
    if (isFinalTurn) {
      const result = await completeMissionAction({
        assignmentStudentId,
        attemptId: aid,
        requiredTurns,
      });
      if (!result.ok) {
        setActionError("Something went wrong. Try again, or ask your teacher for help.");
        throw new Error("mission_complete_failed");
      }
    }

    setFlow((prev) => ({
      ...prev,
      step: isFinalTurn ? "complete" : "transition",
    }));
  }

  function continueToRepeat() {
    setFlow((prev) => ({
      ...prev,
      step: "repeat",
    }));
  }

  function retryOriginal() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    revokeAudioUrls();
    setFlow((prev) => ({
      ...prev,
      step: "question",
      originalTranscript: null,
      repeatTranscript: null,
      improvedSentence: null,
      originalFeedback: null,
      repeatFeedback: null,
      hasRetriedThisTurn: true,
    }));
  }

  // "Record again" after a needsCorrection result: the student was just shown
  // an improved sentence to say, so send them to the repeat step (which shows
  // that sentence + Coco audio) rather than the bare question page — otherwise
  // they can't remember what they were supposed to say.
  function retryWithImprovedSentence() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    revokeAudioUrls();
    setFlow((prev) => ({
      ...prev,
      step: "repeat",
      repeatTranscript: null,
      repeatFeedback: null,
      hasRetriedThisTurn: true,
    }));
  }

  function retryRepeat() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    if (repeatAudioUrlRef.current) {
      URL.revokeObjectURL(repeatAudioUrlRef.current);
      repeatAudioUrlRef.current = null;
    }
    setFlow((prev) => ({
      ...prev,
      step: "repeat",
      repeatTranscript: null,
      repeatFeedback: null,
      hasRetriedThisTurn: true,
    }));
  }

  function handleRevealHint(nextLevel: number) {
    // Record-only — never blocks the flow (D-08).
    if (attemptId) {
      revealHintAction({
        assignmentStudentId,
        attemptId,
        turnOrder: currentTurn.turnOrder,
        hintLevel: nextLevel,
      });
    }

    setFlow((prev) => ({
      ...prev,
      hintLevel: nextLevel,
    }));
  }

  function handleNextTurn() {
    revokeAudioUrls();
    const nextIndex = flow.turnIndex + 1;
    if (nextIndex < requiredTurns) {
      setFlow({
        turnIndex: nextIndex,
        step: "question",
        hintLevel: 0,
        originalTranscript: null,
        repeatTranscript: null,
        improvedSentence: null,
        originalFeedback: null,
        repeatFeedback: null,
        hasRetriedThisTurn: false,
      });
    }
  }

  // ─── Render ───

  return (
    <div>
      {/* Page header */}
      <h1 style={displayTitleStyle}>{missionTitle}</h1>
      <TurnProgressBar current={currentTurnNumber} total={requiredTurns} />

      {/* Resume notice (D-04) */}
      {showResumeNotice && (
        <div
          style={{
            ...resumeNoticeStyle,
            marginTop: 16,
            marginBottom: 0,
          }}
        >
          <p
            style={{
              fontSize: 16,
              color: "#4B5563",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Welcome back! Picking up where you left off.
          </p>
        </div>
      )}

      {/* Step card area */}
      <div style={{ marginTop: 24 }} aria-live="polite">
        {actionError && (
          <p style={{ color: "#B42318", fontSize: 14, margin: "0 0 16px" }}>
            {actionError}
          </p>
        )}

        {(flow.step === "transition" || flow.step === "complete") &&
          flow.repeatTranscript && (
            <div style={{ margin: "0 0 16px" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
                Your repeat:
              </p>
              <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
                {flow.repeatTranscript}
              </p>
            </div>
          )}

        {flow.step === "question" && currentTurn && (
          <StepBuddyQuestion
            assignmentStudentId={assignmentStudentId}
            turnOrder={currentTurn.turnOrder}
            prompt={currentTurn.prompt}
            hintLadder={currentTurn.hintLadder}
            hintLevel={flow.hintLevel}
            onRevealHint={handleRevealHint}
            onVoiceRecorded={handleSubmitOriginalVoice}
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "aiFeedback" && flow.originalFeedback && (
          <StepAiEvaluationFeedback
            assignmentStudentId={assignmentStudentId}
            turnOrder={currentTurn.turnOrder}
            mode="original"
            outcome={flow.originalFeedback.kind}
            transcript={flow.originalFeedback.transcript}
            audioUrl={originalAudioUrlRef.current ?? undefined}
            improvedSentence={
              flow.originalFeedback.kind === "needsCorrection"
                ? flow.originalFeedback.improvedSentence
                : null
            }
            starBand={flow.originalFeedback.starBand}
            wordsToPractice={flow.originalFeedback.wordsToPractice}
            forceRetryBeforeContinue={
              flow.originalFeedback.starBand === 1 && !flow.hasRetriedThisTurn
            }
            onContinue={
              flow.originalFeedback.kind === "needsCorrection"
                ? continueToRepeat
                : flow.originalFeedback.kind === "teacherReview"
                  ? finishTeacherReviewFeedback
                  : finishAcceptedOriginal
            }
            onRetry={
              flow.originalFeedback.kind === "teacherReview"
                ? undefined
                : flow.originalFeedback.kind === "needsCorrection"
                  ? retryWithImprovedSentence
                  : retryOriginal
            }
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "repeat" && currentTurn && (
          <StepImprovedRepeat
            assignmentStudentId={assignmentStudentId}
            turnOrder={currentTurn.turnOrder}
            originalTranscript={flow.originalTranscript}
            improvedSentenceIntro={characterProfile.improvedSentenceIntro}
            targetExample={flow.improvedSentence ?? currentTurn.targetExample}
            repeatInstruction={characterProfile.repeatInstruction}
            onVoiceRecorded={handleSubmitRepeatVoice}
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "repeatFeedback" && flow.repeatFeedback && (
          <StepAiEvaluationFeedback
            assignmentStudentId={assignmentStudentId}
            turnOrder={currentTurn.turnOrder}
            mode="repeat"
            outcome={flow.repeatFeedback.kind}
            transcript={flow.repeatFeedback.transcript}
            audioUrl={repeatAudioUrlRef.current ?? undefined}
            improvedSentence={flow.improvedSentence}
            starBand={flow.repeatFeedback.starBand}
            wordsToPractice={flow.repeatFeedback.wordsToPractice}
            forceRetryBeforeContinue={
              flow.repeatFeedback.starBand === 1 && !flow.hasRetriedThisTurn
            }
            onContinue={
              flow.repeatFeedback.kind === "repeatRetry"
                ? undefined
                : flow.repeatFeedback.kind === "repeatReview"
                  ? finishTeacherReviewFeedback
                  : finishRepeatFeedback
            }
            onRetry={
              flow.repeatFeedback.kind === "repeatReview"
                ? undefined
                : retryRepeat
            }
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "transition" && (
          <StepTurnTransition
            assignmentStudentId={assignmentStudentId}
            transitionMessage={characterProfile.turnTransition}
            onNextTurn={handleNextTurn}
          />
        )}

        {flow.step === "complete" && (
          <StepMissionComplete
            assignmentStudentId={assignmentStudentId}
            completionHeading={characterProfile.completionHeading}
            completionBody={characterProfile.completionBody}
          />
        )}

        {flow.step === "reviewPending" && (
          <div style={stepCardStyle} aria-live="polite">
            <h2 style={{ fontSize: 20, color: "#111827", margin: "0 0 8px" }}>
              Teacher review sent
            </h2>
            <p style={{ fontSize: 16, color: "#4B5563", margin: 0, lineHeight: 1.5 }}>
              Your teacher will check this answer.
            </p>
            <button
              type="button"
              style={{ ...primaryButtonStyle, marginTop: 24 }}
              onClick={() => router.push("/student/home")}
            >
              Back to homework
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
