"use client";

// Stub: replaced in Task 2. Exists only so Task 1's page.tsx compiles.

import type { MissionSnapshotTurn } from "@/domain/mission/schemas";

export type MissionFlowShellProps = {
  assignmentStudentId: string;
  attemptId: string | null;
  missionTitle: string;
  turns: MissionSnapshotTurn[];
  requiredTurns: number;
  characterProfile: {
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
  startingTurnIndex: number;
  isResume: boolean;
};

export function MissionFlowShell(props: MissionFlowShellProps) {
  return <div>Loading mission...</div>;
}
