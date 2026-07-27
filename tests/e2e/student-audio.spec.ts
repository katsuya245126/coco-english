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
  expect(recorderSource).toContain(
    '{state === "ready" || isError ? <MicIcon /> : null}',
  );
  expect(recorderSource).toContain('return "Record";');
  expect(recorderSource).toContain('state === "recording"');
  expect(recorderSource).not.toContain('state === "recording" || isError');
  expect(shellSource).toContain("I didn't hear you. Try again.");
  expect(shellSource).not.toContain("audio_upload_failed");
  expect(shellSource).toContain("Try again.");
  expect(repeatSource).not.toContain("We heard:");
  expect(repeatSource).not.toContain("originalTranscript");
  expect(shellSource).not.toContain("Your repeat:");
});

test("student recorder waveform uses real Web Audio samples without fake pulse animation", async () => {
  const recorderSource = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );
  const waveformSource = readFileSync(
    "src/components/student/LiveRecorderWaveform.tsx",
    "utf8",
  );

  expect(recorderSource).toContain("<LiveRecorderWaveform");
  expect(recorderSource).toContain(
    'stream={state === "recording" ? streamRef.current : null}',
  );
  expect(recorderSource).toContain(
    'aria-label={state === "recording" ? "Stop recording" : undefined}',
  );
  expect(recorderSource).toContain("<span style={recordingStopLabelStyle}>");
  expect(recorderSource).toContain("Stop</span>");
  expect(recorderSource).not.toContain("recorderRecordingStyle");
  expect(recorderSource).not.toContain("Your answer</p>");
  expect(recorderSource).not.toContain("Your repeat</p>");
  expect(waveformSource).toContain("createAnalyser()");
  expect(waveformSource).toContain("createMediaStreamSource(stream)");
  expect(waveformSource).toContain("getByteTimeDomainData");
  expect(waveformSource).toContain("analyser.fftSize = 256");
  expect(waveformSource).toContain("analyser.smoothingTimeConstant = 0.65");
  expect(waveformSource).toContain("sensitivity: SENSITIVITY");
  expect(waveformSource).toContain("buildWaveformBars");
  expect(waveformSource).toContain("const BAR_COUNT = 13");
  expect(waveformSource).toContain("const BAR_WIDTH = 6");
  expect(waveformSource).toContain("const BAR_GAP = 4");
  expect(waveformSource).toContain("const BAR_RADIUS = BAR_WIDTH / 2");
  expect(waveformSource).toContain('aria-hidden="true"');
  expect(waveformSource).toContain("<rect");
  expect(waveformSource).toContain("rx={BAR_RADIUS}");
  expect(waveformSource).not.toContain("<path");
  expect(waveformSource).not.toContain("@keyframes");
  expect(waveformSource).not.toContain("animation:");
  expect(waveformSource).not.toContain("setInterval");
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
