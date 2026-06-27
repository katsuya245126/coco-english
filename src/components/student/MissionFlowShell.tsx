"use client";

/**
 * Mission flow step-state machine (FLOW-02/04/05, D-03/D-12, CHAR-01/02).
 *
 * Owns `FlowState` (turnIndex, step, hintLevel, originalAnswer) via useState.
 * Shows exactly ONE step card at a time (D-12 — no scrolling thread).
 * Steps: question -> repeat -> transition -> (next turn or complete).
 * Step transitions are client state, NOT URL changes (Anti-Pattern).
 * All buddy/sentence text comes from snapshot + static profile — no AI client.
 */

import { useState, useTransition } from "react";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import {
  startAttemptAction,
  submitAnswerAction,
  submitRepeatAction,
  revealHintAction,
} from "@/app/student/missions/[assignmentStudentId]/actions";
import { displayTitleStyle } from "@/components/student/styles";
import { StepBuddyQuestion } from "@/components/student/StepBuddyQuestion";
import { StepImprovedRepeat } from "@/components/student/StepImprovedRepeat";
import { TurnProgressBar } from "@/components/student/TurnProgressBar";

// ─── Types ───

export type FlowStep = "question" | "repeat" | "transition" | "complete";

type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalAnswer: string;
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
    originalAnswer: "",
  });

  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

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

  function handleSubmitAnswer(answer: string) {
    setActionError(null);
    startTransition(async () => {
      const aid = await ensureAttempt();
      if (!aid) return;

      const result = await submitAnswerAction({
        assignmentStudentId,
        attemptId: aid,
        turnOrder: currentTurn.turnOrder,
        originalTranscript: answer,
      });

      if (result.ok) {
        setFlow((prev) => ({
          ...prev,
          step: "repeat",
          originalAnswer: answer,
        }));
      } else {
        setActionError("Something went wrong. Try again, or ask your teacher for help.");
      }
    });
  }

  function handleSubmitRepeat(repeat: string) {
    setActionError(null);
    startTransition(async () => {
      const aid = attemptId;
      if (!aid) {
        setActionError("Something went wrong. Try again, or ask your teacher for help.");
        return;
      }

      const result = await submitRepeatAction({
        assignmentStudentId,
        attemptId: aid,
        turnOrder: currentTurn.turnOrder,
        repeatTranscript: repeat,
      });

      if (result.ok) {
        setFlow((prev) => ({
          ...prev,
          step: "transition",
        }));
      } else {
        setActionError("Something went wrong. Try again, or ask your teacher for help.");
      }
    });
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
        originalAnswer: "",
      });
    } else {
      // All turns done -- show completion placeholder (wired in plan 05).
      setFlow((prev) => ({
        ...prev,
        step: "complete",
      }));
    }
  }

  // ─── Render ───

  return (
    <div>
      {/* Page header */}
      <h1 style={displayTitleStyle}>{missionTitle}</h1>
      <TurnProgressBar current={currentTurnNumber} total={requiredTurns} />

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
            onSubmitAnswer={handleSubmitAnswer}
            isSubmitting={isPending}
          />
        )}

        {flow.step === "repeat" && currentTurn && (
          <StepImprovedRepeat
            originalAnswer={flow.originalAnswer}
            improvedSentenceIntro={characterProfile.improvedSentenceIntro}
            targetExample={currentTurn.targetExample}
            repeatInstruction={characterProfile.repeatInstruction}
            onSubmitRepeat={handleSubmitRepeat}
            isSubmitting={isPending}
          />
        )}

        {flow.step === "transition" && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <p style={{ fontSize: 16, color: "#177245", margin: "0 0 16px" }}>
              {characterProfile.turnTransition}
            </p>
            <button
              type="button"
              style={{
                width: "100%",
                minHeight: 44,
                padding: "12px 16px",
                background: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleNextTurn}
            >
              Next turn
            </button>
          </div>
        )}

        {flow.step === "complete" && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, color: "#111827", margin: 0 }}>
              {characterProfile.completionHeading}
            </h2>
            <p style={{ fontSize: 16, color: "#4B5563", margin: "8px 0 0" }}>
              {characterProfile.completionBody}
            </p>
            {/* Back-to-homework button wired in plan 05 */}
          </div>
        )}
      </div>
    </div>
  );
}
