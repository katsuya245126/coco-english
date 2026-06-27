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

import { useState, useEffect } from "react";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import {
  startAttemptAction,
  revealHintAction,
} from "@/app/student/missions/[assignmentStudentId]/actions";
import {
  displayTitleStyle,
  resumeNoticeStyle,
} from "@/components/student/styles";
import { StepBuddyQuestion } from "@/components/student/StepBuddyQuestion";
import { StepImprovedRepeat } from "@/components/student/StepImprovedRepeat";
import { StepTurnTransition } from "@/components/student/StepTurnTransition";
import { StepMissionComplete } from "@/components/student/StepMissionComplete";
import { TurnProgressBar } from "@/components/student/TurnProgressBar";
import type { RecordedVoiceClip } from "@/components/student/StepBuddyQuestion";
import type { RepeatVoiceClip } from "@/components/student/StepImprovedRepeat";

// ─── Types ───

export type FlowStep = "question" | "repeat" | "transition" | "complete";

type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalTranscript: string | null;
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
  const [flow, setFlow] = useState<FlowState>({
    turnIndex: startingTurnIndex,
    step: "question",
    hintLevel: 0,
    originalTranscript: null,
  });

  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function uploadVoiceClip(input: {
    recording: RecordedVoiceClip | RepeatVoiceClip;
    aid: string;
    clipKind: "original_answer" | "repeat_attempt";
  }) {
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
      | { ok?: boolean }
      | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error("audio_upload_failed");
    }
  }

  async function handleSubmitOriginalVoice(recording: RecordedVoiceClip) {
    setActionError(null);
    // Dismiss resume notice on first submit (D-04)
    setShowResumeNotice(false);

    const aid = await ensureAttempt();
    if (!aid) {
      throw new Error("attempt_start_failed");
    }

    await uploadVoiceClip({
      recording,
      aid,
      clipKind: "original_answer",
    });

    setFlow((prev) => ({
      ...prev,
      step: "repeat",
      originalTranscript: null,
    }));
  }

  async function handleSubmitRepeatVoice(recording: RepeatVoiceClip) {
    setActionError(null);

    const aid = await ensureAttempt();
    if (!aid) {
      throw new Error("attempt_start_failed");
    }

    await uploadVoiceClip({
      recording,
      aid,
      clipKind: "repeat_attempt",
    });

    const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;
    setFlow((prev) => ({
      ...prev,
      step: isFinalTurn ? "complete" : "transition",
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
    const nextIndex = flow.turnIndex + 1;
    if (nextIndex < requiredTurns) {
      setFlow({
        turnIndex: nextIndex,
        step: "question",
        hintLevel: 0,
        originalTranscript: null,
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

        {flow.step === "question" && currentTurn && (
          <StepBuddyQuestion
            questionLabel={characterProfile.questionLabel}
            prompt={currentTurn.prompt}
            hintLadder={currentTurn.hintLadder}
            hintLevel={flow.hintLevel}
            onRevealHint={handleRevealHint}
            onVoiceRecorded={handleSubmitOriginalVoice}
            isSubmitting={false}
          />
        )}

        {flow.step === "repeat" && currentTurn && (
          <StepImprovedRepeat
            originalTranscript={flow.originalTranscript}
            improvedSentenceIntro={characterProfile.improvedSentenceIntro}
            targetExample={currentTurn.targetExample}
            repeatInstruction={characterProfile.repeatInstruction}
            onVoiceRecorded={handleSubmitRepeatVoice}
            isSubmitting={false}
          />
        )}

        {flow.step === "transition" && (
          <StepTurnTransition
            transitionMessage={characterProfile.turnTransition}
            onNextTurn={handleNextTurn}
          />
        )}

        {flow.step === "complete" && (
          <StepMissionComplete
            completionHeading={characterProfile.completionHeading}
            completionBody={characterProfile.completionBody}
          />
        )}
      </div>
    </div>
  );
}
