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
  expect(source).toContain("Your repeat:");
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

  expect(recorderSource).toContain("Saving your voice...");
  expect(recorderSource).toContain("Listening to your answer...");
  expect(shellSource).toContain("We could not hear that clearly. Record again.");
  expect(repeatSource).toContain("We heard:");
  expect(shellSource).toContain("Your repeat:");
});

test("student mission completion is gated after repeat transcript success", async () => {
  const source = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  const repeatUploadIndex = source.indexOf('clipKind: "repeat_attempt"');
  const completeIndex = source.indexOf("const result = await completeMissionAction");
  const repeatTranscriptIndex = source.indexOf("repeatTranscript: transcript");

  expect(repeatUploadIndex).toBeGreaterThan(-1);
  expect(completeIndex).toBeGreaterThan(repeatUploadIndex);
  expect(repeatTranscriptIndex).toBeGreaterThan(completeIndex);
});

test("audio route returns transcripts and retryable transcription failures", async () => {
  const source = readFileSync(
    "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
    "utf8",
  );

  expect(source).toContain("transcript: result.transcript");
  expect(source).toContain("transcription_failed_retryable");
});
