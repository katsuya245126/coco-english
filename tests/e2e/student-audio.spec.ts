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
});

test("student audio upload failure keeps retry copy in the recorder", async () => {
  const source = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );

  expect(source).toContain("Saving your voice...");
  expect(source).toContain("We could not save that recording. Try again.");
});
