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
  expect(feedbackSource).toContain("Try this:");
  expect(feedbackSource).toContain("Try again.");
  expect(feedbackSource).toContain("Your teacher will check this answer.");
  expect(feedbackSource).toContain("Teacher review");
  expect(feedbackSource).toContain("Record again");
  expect(feedbackSource).toContain("Try again");
  expect(feedbackSource).toMatch(/Continue mission/);
  expect(feedbackSource).toContain("You said:");
  expect(shellSource).toContain("StepAiEvaluationFeedback");
  expect(shellSource).toContain("reviewPending");
  expect(shellSource).toContain("Teacher review sent");
  expect(shellSource).toContain("Back to homework");
  expect(shellSource).toContain('router.push("/student/home")');
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
  expect(feedbackSource).toContain("Try again.");
  expect(shellSource).toContain("repeatAccepted");
  expect(shellSource).toContain("teacherReview");
});

test("feedback review is shown before transition or final completion", async () => {
  const feedbackSource = readFileSync(
    "src/components/student/StepAiEvaluationFeedback.tsx",
    "utf8",
  );
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  const repeatAcceptedStart = feedbackSource.indexOf(
    'if (outcome === "repeatAccepted")',
  );
  const repeatAcceptedEnd = feedbackSource.indexOf(
    "\n  return (",
    repeatAcceptedStart,
  );
  const repeatAcceptedBranch = feedbackSource.slice(
    repeatAcceptedStart,
    repeatAcceptedEnd,
  );

  const originalSubmitStart = shellSource.indexOf(
    "async function handleSubmitOriginalVoice",
  );
  const repeatSubmitStart = shellSource.indexOf(
    "async function handleSubmitRepeatVoice",
  );
  const finishRepeatStart = shellSource.indexOf(
    "async function finishRepeatFeedback",
  );
  const originalSubmit = shellSource.slice(originalSubmitStart, repeatSubmitStart);
  const repeatSubmit = shellSource.slice(repeatSubmitStart, finishRepeatStart);

  expect(repeatAcceptedBranch).toContain("<RecordingReview");
  expect(originalSubmit).not.toContain("completeMissionAction");
  expect(originalSubmit).toContain('step: "aiFeedback"');
  expect(repeatSubmit).not.toContain("completeMissionAction");
  expect(repeatSubmit).toContain('step: "repeatFeedback"');
  expect(shellSource).not.toContain("Your repeat:");
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

test("student hint reveal button is a soft compact help control", async () => {
  const hintSource = readFileSync(
    "src/components/student/HintRevealer.tsx",
    "utf8",
  );

  expect(hintSource).toContain('width: "100%"');
  expect(hintSource).toContain('💡 Hint');
  expect(hintSource).toContain('"#EFF6FF"');
  expect(hintSource).toContain('border: "none"');
  expect(hintSource).toContain('minHeight: 40');
});

test("student recorder does not show redundant ready-state instructions", async () => {
  const recorderSource = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );

  expect(recorderSource).not.toContain("Tap record and answer Coco.");
});
