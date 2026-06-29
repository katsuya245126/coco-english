import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("student AI evaluation UI source contract covers original-answer outcomes and noun-bearing CTAs", async () => {
  const feedbackSource = readFileSync(
    "src/components/student/StepAiEvaluationFeedback.tsx",
    "utf8",
  );
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(feedbackSource).toContain("Checking your answer...");
  expect(feedbackSource).toContain("Nice answer!");
  expect(feedbackSource).toContain("Nice try! Here is a clearer way to say it:");
  expect(feedbackSource).toContain("Try that in English.");
  expect(feedbackSource).toContain("Your teacher will check this answer.");
  expect(feedbackSource).toContain("Teacher review");
  expect(feedbackSource).toContain("Record again");
  expect(feedbackSource).toMatch(/Continue (mission|practice)/);
  expect(shellSource).toContain("StepAiEvaluationFeedback");
});

test("student AI evaluation source contract covers repeat accepted, retry, and review-routed outcomes", async () => {
  const feedbackSource = readFileSync(
    "src/components/student/StepAiEvaluationFeedback.tsx",
    "utf8",
  );
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(feedbackSource).toContain("Checking your repeat...");
  expect(feedbackSource).toContain("Good repeat.");
  expect(feedbackSource).toContain("Try the repeat again.");
  expect(feedbackSource).toContain(
    "Listen to the sentence and record it one more time.",
  );
  expect(shellSource).toContain("repeatAccepted");
  expect(shellSource).toContain("teacherReview");
});

test("student client source has no direct OpenAI import or server AI adapter import", async () => {
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
