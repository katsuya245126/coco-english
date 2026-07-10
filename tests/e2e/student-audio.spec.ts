import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("student audio upload posts FormData before original answer progression", async () => {
  const source = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(source).toContain("new FormData()");
  expect(source).toContain(
    "`/student/missions/${assignmentStudentId}/audio`",
  );
  expect(source).toContain('clipKind: "original_answer"');
  expect(source).toContain('clipKind: "repeat_attempt"');
  expect(source).toContain("await uploadVoiceClip");
  expect(source).toContain("typeof payload.transcript");
  expect(source).toContain("originalTranscript: transcript");
  expect(source).not.toContain("Your repeat:");
});

test("student audio transcription states use classroom-safe copy", async () => {
  const recorderSource = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );
  const repeatSource = readFileSync(
    "src/components/student/StepImprovedRepeat.tsx",
    "utf8",
  );

  expect(recorderSource).toContain("Saving…");
  expect(recorderSource.match(/Saving…/g) ?? []).toHaveLength(1);
  expect(recorderSource).toContain("function MicIcon()");
  expect(recorderSource).toContain("{isError ? <MicIcon /> : null}");
  expect(recorderSource).toContain('state === "recording"');
  expect(recorderSource).not.toContain('state === "recording" || isError');
  expect(shellSource).toContain("I didn't hear you. Try again.");
  expect(shellSource).not.toContain("audio_upload_failed");
  expect(shellSource).toContain("Try again.");
  expect(repeatSource).not.toContain("We heard:");
  expect(repeatSource).not.toContain("originalTranscript");
  expect(shellSource).not.toContain("Your repeat:");
});

test("student mission completion is gated after repeat transcript success", async () => {
  const source = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  const repeatUploadIndex = source.indexOf('clipKind: "repeat_attempt"');
  const repeatFeedbackIndex = source.indexOf(
    'step: "repeatFeedback"',
    repeatUploadIndex,
  );
  const finishFeedbackIndex = source.indexOf(
    "async function finishRepeatFeedback",
    repeatFeedbackIndex,
  );
  const completeIndex = source.indexOf(
    "const result = await completeMissionAction",
    finishFeedbackIndex,
  );

  expect(repeatUploadIndex).toBeGreaterThan(-1);
  expect(repeatFeedbackIndex).toBeGreaterThan(repeatUploadIndex);
  expect(finishFeedbackIndex).toBeGreaterThan(repeatFeedbackIndex);
  expect(completeIndex).toBeGreaterThan(finishFeedbackIndex);
});

test("audio route returns transcripts and retryable transcription failures", async () => {
  const source = readFileSync(
    "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
    "utf8",
  );

  expect(source).toContain("transcript: result.transcript");
  expect(source).toContain("transcription_failed_retryable");
});
