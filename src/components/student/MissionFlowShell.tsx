"use client";

/**
 * Mission flow step-state machine (FLOW-02/04/05, D-03/D-12, CHAR-01/02).
 *
 * Applies the pure `FlowState` transitions via useState.
 * Shows exactly ONE step card at a time (D-12 — no scrolling thread).
 * Steps: question -> repeat -> transition -> (next turn or complete).
 * Step transitions are client state, NOT URL changes (Anti-Pattern).
 * All buddy/sentence text comes from snapshot + static profile — no AI client.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import { describeConversationSubmissionFailure } from "@/domain/mission/conversation-submission-recovery";
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
import { StepConversationClosing } from "@/components/student/StepConversationClosing";
import { StepMissionComplete } from "@/components/student/StepMissionComplete";
import { MascotStage } from "@/components/student/MascotStage";
import {
  CocoSpeechAudio,
  type CocoSpeechLine,
} from "@/components/student/CocoSpeechAudio";
import { TurnProgressBar } from "@/components/student/TurnProgressBar";
import type { RecordedVoiceClip } from "@/components/student/StepBuddyQuestion";
import type { RepeatVoiceClip } from "@/components/student/StepImprovedRepeat";
import type { RecorderState } from "@/components/student/VoiceRecorderControl";
import type { PendingTurnReview } from "@/domain/flow/completion";
import {
  reconstructMissionFlow,
  transitionMissionFlow,
  type FlowState,
  type MissionFlowTransition,
  type UploadVoiceClipPayload,
} from "@/domain/flow/mission-transitions";
import {
  deriveActiveStudentQuestion,
  type ActiveStudentQuestion,
  type DynamicConversationPrompt,
} from "@/domain/mission/student-question-state";
import type { TranslatableCocoLine } from "@/domain/ai/translation-hint";
export type {
  FlowStep,
  FlowState,
} from "@/domain/flow/mission-transitions";

export type CharacterProfileLines = {
  displayName: string;
  questionIntro: string;
  questionLabel: string;
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
  conversationMode: boolean;
  characterProfile: CharacterProfileLines;
  startingTurnIndex: number;
  initialDynamicPrompt: DynamicConversationPrompt | null;
  isResume: boolean;
  initialReview: (PendingTurnReview & { audioUrl?: string }) | null;
};

function clearAudioUrl(ref: { current: string | null }) {
  if (ref.current?.startsWith("blob:")) {
    URL.revokeObjectURL(ref.current);
  }
  ref.current = null;
}

export function MissionFlowShell({
  assignmentStudentId,
  attemptId: initialAttemptId,
  missionTitle,
  turns,
  requiredTurns,
  conversationMode,
  characterProfile,
  startingTurnIndex,
  initialDynamicPrompt,
  isResume,
  initialReview,
}: MissionFlowShellProps) {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>(() =>
    reconstructMissionFlow({
      startingTurnIndex,
      initialDynamicPrompt,
      initialReview,
    }),
  );

  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId);
  const [actionError, setActionError] = useState<string | null>(null);
  const originalAudioUrlRef = useRef<string | null>(
    initialReview?.clipKind === "original_answer"
      ? (initialReview.audioUrl ?? null)
      : null,
  );
  const repeatAudioUrlRef = useRef<string | null>(
    initialReview?.clipKind === "repeat_attempt"
      ? (initialReview.audioUrl ?? null)
      : null,
  );
  const mascotAmplitudeRef = useRef(0);
  const [mascotPlaying, setMascotPlaying] = useState(false);
  const [originalRecorderState, setOriginalRecorderState] =
    useState<RecorderState>("ready");

  const handleMascotAmplitudeFrame = useCallback((level: number) => {
    mascotAmplitudeRef.current = level;
  }, []);

  const handleMascotPlayingChange = useCallback((playing: boolean) => {
    setMascotPlaying(playing);
    if (!playing) {
      mascotAmplitudeRef.current = 0;
    }
  }, []);

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

  const activeQuestion = deriveActiveStudentQuestion({
    conversationMode,
    turnIndex: flow.turnIndex,
    turns,
    dynamicPrompt: flow.dynamicPrompt,
  });
  // 1-based turn number for display
  const currentTurnNumber = flow.turnIndex + 1;

  const mascotDialogue = getMascotDialogue({
    flow,
    activeQuestion,
    actionError,
    turnTransition: characterProfile.turnTransition,
    completionHeading: characterProfile.completionHeading,
  });

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

  async function uploadVoiceClip(input: {
    recording: RecordedVoiceClip | RepeatVoiceClip;
    aid: string;
    clipKind: "original_answer" | "repeat_attempt";
  }): Promise<UploadVoiceClipPayload> {
    if (!activeQuestion.recordingEnabled) {
      throw new Error("dynamic_prompt_unavailable");
    }

    const formData = new FormData();
    formData.set("file", input.recording.blob, `${input.clipKind}.webm`);
    formData.set("attemptId", input.aid);
    formData.set("turnOrder", String(activeQuestion.activeTurnOrder));
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
          displayTranscript?: string | null;
          error?: string;
          evaluation?: UploadVoiceClipPayload["evaluation"];
          starBand?: PronunciationStarBand | null;
          wordsToPractice?: WordHighlight[];
          cocoLine?: string | null;
        }
      | null;
    if (
      !response.ok ||
      payload?.ok !== true ||
      payload.displayTranscript === undefined ||
      (payload.displayTranscript !== null &&
        (typeof payload.displayTranscript !== "string" ||
          payload.displayTranscript.trim().length === 0))
    ) {
      if (payload?.error === "rate_limited") {
        throw new Error(
          "You’ve practiced a lot in a short time. Wait a few minutes, then try again.",
        );
      }
      if (payload?.error === "transcription_failed_retryable") {
        throw new Error("I didn't hear you. Try again.");
      }
      throw new Error("Try again.");
    }

    return {
      displayTranscript: payload.displayTranscript,
      evaluation: payload.evaluation,
      starBand: payload.starBand,
      wordsToPractice: payload.wordsToPractice,
      cocoLine: payload.cocoLine ?? null,
    };
  }

  function revokeAudioUrls() {
    clearAudioUrl(originalAudioUrlRef);
    clearAudioUrl(repeatAudioUrlRef);
  }

  async function applyTransition(
    decision: MissionFlowTransition,
    attemptId?: string,
    revokeBeforeApply = false,
  ) {
    if (decision.kind === "unavailable") {
      setActionError(
        "Coco’s next question isn’t available yet. Please return to your missions and try again.",
      );
      setFlow(decision.state);
      return;
    }

    if (
      decision.kind === "complete" ||
      decision.kind === "reviewPending" ||
      decision.kind === "closing"
    ) {
      if (!attemptId) throw new Error("attempt_start_failed");
      const result = await completeMissionAction({
        assignmentStudentId,
        attemptId,
      });
      if (!result.ok) {
        setActionError(
          "Something went wrong. Try again, or ask your teacher for help.",
        );
        throw new Error("mission_complete_failed");
      }
      revokeAudioUrls();
    } else if (revokeBeforeApply) {
      revokeAudioUrls();
    }

    setFlow(decision.state);
  }

  function finishConversationClosing() {
    router.push(`/student/history/${assignmentStudentId}`);
  }

  async function handleSubmitOriginalVoice(recording: RecordedVoiceClip) {
    if (!activeQuestion.recordingEnabled) {
      setActionError("Coco’s next question isn’t available yet. Please return to your missions and try again.");
      return;
    }

    setActionError(null);
    // Dismiss resume notice on first submit (D-04)
    setShowResumeNotice(false);

    const token = ++submissionTokenRef.current;
    setIsSubmittingVoice(true);

    try {
      clearAudioUrl(originalAudioUrlRef);
      originalAudioUrlRef.current = URL.createObjectURL(recording.blob);

      const aid = await ensureAttempt();
      if (!aid) {
        throw new Error("attempt_start_failed");
      }

      // Conversation-mode missions run a server round-trip (moderation ->
      // generation -> moderation -> TTS warmup) on the original-answer
      // upload — show the "Coco is thinking…" step while it's in flight
      // (CHAT-02, UI-SPEC interaction contract).
      if (conversationMode) {
        setFlow((prev) => ({ ...prev, step: "cocoThinking" }));
      }

      const upload = await uploadVoiceClip({
        recording,
        aid,
        clipKind: "original_answer",
      });

      // A newer submission has started since this one began — discard this
      // stale result so it can never overwrite fresher feedback state.
      if (token !== submissionTokenRef.current) return;

      const decision = transitionMissionFlow(flow, {
        type: "originalUploaded",
        conversationMode,
        requiredTurns,
        upload,
      });
      await applyTransition(decision, aid, decision.kind === "apply" && decision.state.step === "question");
    } catch (error) {
      // In conversation mode the step is already on cocoThinking, so the
      // recorder that would normally display this failure has unmounted —
      // recover here or the student is stuck on the thinking screen.
      if (!conversationMode) throw error;
      if (token !== submissionTokenRef.current) return;
      setActionError(describeConversationSubmissionFailure(error));
      setFlow((prev) =>
        prev.step === "cocoThinking" ? { ...prev, step: "question" } : prev,
      );
    } finally {
      if (token === submissionTokenRef.current) setIsSubmittingVoice(false);
    }
  }

  async function handleSubmitRepeatVoice(recording: RepeatVoiceClip) {
    if (!activeQuestion.recordingEnabled) {
      setActionError("Coco’s next question isn’t available yet. Please return to your missions and try again.");
      return;
    }

    setActionError(null);

    const token = ++submissionTokenRef.current;
    setIsSubmittingVoice(true);

    try {
      clearAudioUrl(repeatAudioUrlRef);
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

      const decision = transitionMissionFlow(flow, {
        type: "repeatUploaded",
        conversationMode,
        requiredTurns,
        upload,
      });
      await applyTransition(decision, aid, decision.kind === "apply" && decision.state.step === "question");
    } finally {
      if (token === submissionTokenRef.current) setIsSubmittingVoice(false);
    }
  }

  async function applyFeedbackTransition(decision: MissionFlowTransition) {
    if (
      decision.kind === "complete" ||
      decision.kind === "reviewPending" ||
      decision.kind === "closing"
    ) {
      const aid = await ensureAttempt();
      if (!aid) throw new Error("attempt_start_failed");
      await applyTransition(decision, aid);
      return;
    }
    await applyTransition(decision);
  }

  async function finishOriginalFeedback() {
    await applyFeedbackTransition(
      transitionMissionFlow(flow, {
        type: "continueOriginal",
        conversationMode,
        requiredTurns,
      }),
    );
  }

  async function finishRepeatFeedback() {
    await applyFeedbackTransition(
      transitionMissionFlow(flow, {
        type: "continueRepeat",
        conversationMode,
        requiredTurns,
      }),
    );
  }

  function retryOriginal() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    revokeAudioUrls();
    setFlow((prev) => transitionMissionFlow(prev, { type: "retryOriginal" }).state);
  }

  // "Record again" after a needsCorrection result: the student was just shown
  // an improved sentence to say, so send them to the repeat step (which shows
  // that sentence + Coco audio) rather than the bare question page — otherwise
  // they can't remember what they were supposed to say.
  function retryWithImprovedSentence() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    revokeAudioUrls();
    setFlow((prev) =>
      transitionMissionFlow(prev, { type: "retryWithImprovedSentence" }).state,
    );
  }

  function retryRepeat() {
    submissionTokenRef.current += 1;
    setIsSubmittingVoice(false);
    clearAudioUrl(repeatAudioUrlRef);
    setFlow((prev) => transitionMissionFlow(prev, { type: "retryRepeat" }).state);
  }

  function handleRevealHint(nextLevel: number) {
    // Record-only — never blocks the flow (D-08).
    if (attemptId && activeQuestion.recordingEnabled) {
      revealHintAction({
        assignmentStudentId,
        attemptId,
        turnOrder: activeQuestion.activeTurnOrder,
        hintLevel: nextLevel,
      });
    }

    setFlow((prev) =>
      transitionMissionFlow(prev, { type: "revealHint", hintLevel: nextLevel }).state,
    );
  }

  // Preset missions only — chat missions advance directly through the pure
  // transition module and never reach the transition step.
  function handleNextTurn() {
    revokeAudioUrls();
    setFlow((previous) =>
      transitionMissionFlow(previous, { type: "nextTurn", requiredTurns }).state,
    );
  }

  // ─── Render ───

  return (
    <div>
      {/* Page header */}
      <h1 style={displayTitleStyle}>{missionTitle}</h1>
      <TurnProgressBar current={currentTurnNumber} total={requiredTurns} />

      {/* Scene premise (SCENE-01): preset missions may render it once above turn 1.
          Conversation missions keep the premise as AI grounding but do not repeat it
          as a separate student-facing card. */}
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

      <MascotStage
        assignmentStudentId={assignmentStudentId}
        displayName={characterProfile.displayName}
        dialogueText={mascotDialogue.text}
        isThinking={flow.step === "cocoThinking"}
        translationLine={getTranslationLine({ flow, activeQuestion, actionError })}
        voiceControl={
          mascotDialogue.line ? (
            <CocoSpeechAudio
              assignmentStudentId={assignmentStudentId}
              line={mascotDialogue.line}
              presentation="dialogue-tab"
              onAmplitudeFrame={handleMascotAmplitudeFrame}
              onPlayingChange={handleMascotPlayingChange}
            />
          ) : null
        }
        step={flow.step}
        originalFeedbackKind={flow.originalFeedback?.kind}
        repeatFeedbackKind={
          flow.repeatFeedback?.kind === "repeatLimitReached"
            ? undefined
            : flow.repeatFeedback?.kind
        }
        playing={mascotPlaying}
        amplitudeRef={mascotAmplitudeRef}
        expression={
          actionError ||
          (flow.step === "question" && originalRecorderState === "failure")
            ? "thinking"
            : flow.originalFeedback?.kind === "acceptedOriginal" ||
                flow.repeatFeedback?.kind === "repeatAccepted"
              ? "celebrate"
              : flow.repeatFeedback?.kind === "repeatLimitReached"
                ? "encouraging"
              : undefined
        }
      />

      {/* Step card area */}
      <div style={{ marginTop: 24 }} aria-live="polite">
        {actionError && (
          <p style={{ color: "#B42318", fontSize: 14, margin: "0 0 16px" }}>
            {actionError}
          </p>
        )}

        {flow.step === "question" && activeQuestion.kind === "preset" && (
          <StepBuddyQuestion
            assignmentStudentId={assignmentStudentId}
            turnOrder={activeQuestion.activeTurnOrder}
            prompt={activeQuestion.prompt}
            hintLadder={activeQuestion.hintLadder}
            hintLevel={flow.hintLevel}
            onAmplitudeFrame={handleMascotAmplitudeFrame}
            onPlayingChange={handleMascotPlayingChange}
            showCocoLine={false}
            onRecorderStateChange={setOriginalRecorderState}
            onRevealHint={handleRevealHint}
            onVoiceRecorded={handleSubmitOriginalVoice}
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "question" && activeQuestion.kind === "conversation" && (
          <StepBuddyQuestion
            assignmentStudentId={assignmentStudentId}
            turnOrder={activeQuestion.activeTurnOrder}
            prompt={activeQuestion.prompt}
            replyHintFrame={activeQuestion.replyHintFrame}
            onAmplitudeFrame={handleMascotAmplitudeFrame}
            onPlayingChange={handleMascotPlayingChange}
            showCocoLine={false}
            onRecorderStateChange={setOriginalRecorderState}
            onVoiceRecorded={handleSubmitOriginalVoice}
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "question" && activeQuestion.kind === "unavailable" && (
          <div style={stepCardStyle} role="alert">
            <p style={{ fontSize: 16, color: "#4B5563", margin: 0, lineHeight: 1.5 }}>
              Coco’s next question isn’t available yet. Please return to your missions and try again.
            </p>
            <button
              className="student-primary-button"
              type="button"
              style={{ ...primaryButtonStyle, marginTop: 24 }}
              onClick={() => router.push("/student/home")}
            >
              Back to missions
            </button>
          </div>
        )}

        {flow.step === "aiFeedback" && flow.originalFeedback && (
          <StepAiEvaluationFeedback
            mode="original"
            outcome={flow.originalFeedback.kind}
            transcript={flow.originalFeedback.transcript}
            audioUrl={originalAudioUrlRef.current ?? undefined}
            improvedSentence={
              flow.originalFeedback.kind === "needsCorrection"
                ? flow.originalFeedback.improvedSentence
                : null
            }
            minimalEffortKind={flow.originalFeedback.minimalEffortKind}
            retryExample={flow.originalFeedback.retryExample}
            starBand={flow.originalFeedback.starBand}
            wordsToPractice={flow.originalFeedback.wordsToPractice}
            showCocoLine={false}
            showSentenceCard={true}
            forceRetryBeforeContinue={
              flow.originalFeedback.starBand === 1 && !flow.hasRetriedThisTurn
            }
            onContinue={
              flow.originalFeedback.kind === "retryUnclearMeaning"
                ? undefined
                : finishOriginalFeedback
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

        {flow.step === "repeat" &&
          activeQuestion.kind !== "unavailable" &&
          (flow.improvedSentence ||
            (activeQuestion.kind === "preset" ? activeQuestion.targetExample : null)) && (
          <StepImprovedRepeat
            assignmentStudentId={assignmentStudentId}
            turnOrder={activeQuestion.activeTurnOrder}
            // Terse card label on purpose — the fuller spoken phrasing
            // (characterProfile.improvedSentenceIntro) stays TTS-only.
            improvedSentenceLabel="Say"
            targetExample={
              flow.improvedSentence ??
              (activeQuestion.kind === "preset" ? activeQuestion.targetExample : "")
            }
            onAmplitudeFrame={handleMascotAmplitudeFrame}
            onPlayingChange={handleMascotPlayingChange}
            showCocoLine={true}
            onVoiceRecorded={handleSubmitRepeatVoice}
            isSubmitting={isSubmittingVoice}
          />
        )}

        {flow.step === "repeatFeedback" && flow.repeatFeedback && (
          <StepAiEvaluationFeedback
            mode="repeat"
            outcome={flow.repeatFeedback.kind}
            transcript={flow.repeatFeedback.transcript}
            audioUrl={repeatAudioUrlRef.current ?? undefined}
            improvedSentence={flow.improvedSentence}
            starBand={flow.repeatFeedback.starBand}
            wordsToPractice={flow.repeatFeedback.wordsToPractice}
            showCocoLine={false}
            showSentenceCard={true}
            forceRetryBeforeContinue={
              flow.repeatFeedback.kind !== "repeatLimitReached" &&
              flow.repeatFeedback.starBand === 1 &&
              !flow.hasRetriedThisTurn
            }
            onContinue={
              flow.repeatFeedback.kind === "repeatRetry"
                ? undefined
                : finishRepeatFeedback
            }
            onRetry={
              flow.repeatFeedback.kind === "repeatReview" ||
              flow.repeatFeedback.kind === "repeatLimitReached"
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
            onAmplitudeFrame={handleMascotAmplitudeFrame}
            onPlayingChange={handleMascotPlayingChange}
            showCocoLine={false}
            onNextTurn={handleNextTurn}
          />
        )}

        {flow.step === "closing" && (
          <StepConversationClosing onFinish={finishConversationClosing} />
        )}

        {flow.step === "complete" && !conversationMode && (
          <StepMissionComplete
            assignmentStudentId={assignmentStudentId}
            completionHeading={characterProfile.completionHeading}
            completionBody={characterProfile.completionBody}
            onAmplitudeFrame={handleMascotAmplitudeFrame}
            onPlayingChange={handleMascotPlayingChange}
            showCocoLine={false}
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
              className="student-primary-button"
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

function getTranslationLine({
  flow,
  activeQuestion,
  actionError,
}: {
  flow: FlowState;
  activeQuestion: ActiveStudentQuestion;
  actionError?: string | null;
}): TranslatableCocoLine | null {
  if (actionError) return null;
  if (flow.step === "question" && activeQuestion.kind !== "unavailable") {
    return activeQuestion.line;
  }
  if (flow.step === "closing" && flow.cocoLine) {
    return {
      lineKind: "coco_dynamic_line",
      turnOrder: flow.turnIndex + 1,
    };
  }
  return null;
}

function getMascotDialogue({
  flow,
  activeQuestion,
  actionError,
  turnTransition,
  completionHeading,
}: {
  flow: FlowState;
  activeQuestion: ActiveStudentQuestion;
  actionError?: string | null;
  turnTransition: string;
  completionHeading: string;
}): { text: string | null; line: CocoSpeechLine | null } {
  if (actionError) {
    return { text: actionError, line: null };
  }

  if (flow.step === "cocoThinking") {
    // Keep the wait state inside Coco's persistent dialogue box. It is
    // intentionally unvoiced and has no translation hint.
    return { text: "Coco is thinking…", line: null };
  }

  if (flow.step === "question" && activeQuestion.kind !== "unavailable") {
    // activeQuestion.line carries lineKind "mission_prompt" or
    // "coco_dynamic_line" (see student-question-state.ts) so dynamic Coco
    // follow-ups speak through the same CocoSpeechAudio contract as authored prompts.
    return {
      text: activeQuestion.prompt,
      line: activeQuestion.line,
    };
  }

  if (flow.step === "repeat" && activeQuestion.kind !== "unavailable") {
    // The target sentence + its own replay button now live in the
    // StepImprovedRepeat "Say" card (showCocoLine={true}). Keep Coco's
    // bubble to a generic prompt so the sentence isn't spoken/shown twice.
    return {
      text: "Try this!",
      line: null,
    };
  }

  if (flow.step === "aiFeedback" && flow.originalFeedback?.kind === "needsCorrection") {
    // Coco speaks only this short encouragement here. The improved sentence
    // renders (unvoiced) in the feedback card's "Try this:" block — it is
    // first READ on the next page (the repeat step's card), not on this one.
    return {
      text: "Hmm... let's try again",
      line: { lineKind: "coco_feedback", feedbackVariant: "needs_correction" },
    };
  }

  if (flow.step === "aiFeedback" && flow.originalFeedback?.kind === "acceptedOriginal") {
    return {
      text: "Nice answer!",
      line: { lineKind: "coco_feedback", feedbackVariant: "accepted_original" },
    };
  }

  if (flow.step === "aiFeedback" && flow.originalFeedback?.kind === "retryOriginal") {
    return {
      text: "Try again.",
      line: { lineKind: "coco_feedback", feedbackVariant: "retry_original" },
    };
  }

  if (
    flow.step === "aiFeedback" &&
    flow.originalFeedback?.kind === "retryUnclearMeaning"
  ) {
    return {
      text: "Hmm... try one more time.",
      line: {
        lineKind: "coco_feedback",
        feedbackVariant: "retry_unclear_meaning",
      },
    };
  }

  if (
    flow.step === "aiFeedback" &&
    flow.originalFeedback?.kind === "retryIncompleteRecording"
  ) {
    return {
      text:
        "It sounds like the recording stopped early. Try recording your answer again.",
      line: null,
    };
  }

  if (
    flow.step === "aiFeedback" &&
    flow.originalFeedback?.kind === "retryMinimalEffort"
  ) {
    if (flow.originalFeedback.minimalEffortKind === "dont_know") {
      return {
        text: "It's okay to guess. Try one answer!",
        line: {
          lineKind: "coco_feedback",
          feedbackVariant: "retry_minimal_unsure",
        },
      };
    }
    if (flow.originalFeedback.retryExample) {
      return {
        text: "Try the example below!",
        line: {
          lineKind: "coco_feedback",
          feedbackVariant: "retry_minimal_example",
        },
      };
    }
    return {
      text: "Answer Coco's question and add one detail.",
      line: {
        lineKind: "coco_feedback",
        feedbackVariant: "retry_minimal_detail",
      },
    };
  }

  if (flow.step === "aiFeedback" && flow.originalFeedback?.kind === "teacherReview") {
    return {
      text: "Your teacher will check this answer.",
      line: { lineKind: "coco_feedback", feedbackVariant: "teacher_check" },
    };
  }

  if (flow.step === "repeatFeedback" && flow.repeatFeedback?.kind === "repeatRetry") {
    // The sentence to repeat renders in the feedback card (showCocoLine={true});
    // keep Coco's bubble generic so it isn't duplicated in the dialogue text.
    return {
      text: "Try again!",
      line: { lineKind: "coco_feedback", feedbackVariant: "retry_repeat" },
    };
  }

  if (flow.step === "repeatFeedback" && flow.repeatFeedback?.kind === "repeatAccepted") {
    return {
      text: "Good repeat.",
      line: { lineKind: "coco_feedback", feedbackVariant: "repeat_accepted" },
    };
  }

  if (
    flow.step === "repeatFeedback" &&
    flow.repeatFeedback?.kind === "repeatLimitReached"
  ) {
    return { text: "Let's continue.", line: null };
  }

  if (flow.step === "repeatFeedback" && flow.repeatFeedback?.kind === "repeatReview") {
    return {
      text: "Your teacher will check this answer.",
      line: { lineKind: "coco_feedback", feedbackVariant: "repeat_check" },
    };
  }

  if (flow.step === "transition") {
    return {
      text: turnTransition,
      line: { lineKind: "coco_transition" },
    };
  }

  if (flow.step === "closing" && flow.cocoLine) {
    return {
      text: flow.cocoLine,
      line: {
        lineKind: "coco_dynamic_line",
        turnOrder: flow.turnIndex + 1,
      },
    };
  }

  if (flow.step === "complete") {
    return {
      text: completionHeading,
      line: { lineKind: "completion_celebration" },
    };
  }

  return { text: null, line: null };
}
