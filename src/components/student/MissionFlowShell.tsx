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

import { useState, useEffect, useTransition } from "react";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import {
  startAttemptAction,
  submitAnswerAction,
  submitRepeatAction,
  revealHintAction,
  completeMissionAction,
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

  function handleSubmitAnswer(answer: string) {
    setActionError(null);
    // Dismiss resume notice on first submit (D-04)
    setShowResumeNotice(false);
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
        // Determine next step: final turn triggers completion, otherwise transition
        const isFinalTurn = flow.turnIndex + 1 >= requiredTurns;

        if (isFinalTurn) {
          // Call server-owned completion (FLOW-06, D-06)
          const completeResult = await completeMissionAction({
            assignmentStudentId,
            attemptId: aid,
            requiredTurns,
          });

          if (completeResult.ok) {
            setFlow((prev) => ({
              ...prev,
              step: "complete",
            }));
          } else {
            setActionError("Something went wrong. Try again, or ask your teacher for help.");
          }
        } else {
          setFlow((prev) => ({
            ...prev,
            step: "transition",
          }));
        }
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
