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
    expect(missionFlowSource).toContain('reason_code: "low_confidence"');
    expect(missionFlowSource).toContain('reason_code: "ambiguous"');
    expect(missionFlowSource).toContain('reason_code: "failed_schema"');
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
});
