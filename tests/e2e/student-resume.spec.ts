/**
 * Resume e2e: a student who reloads mid-mission continues the same homework
 * attempt at the next unanswered question instead of starting over.
 */

import { expect, test } from "@playwright/test";
import {
  cleanupClassroom,
  createAdmin,
  installFakeRecorder,
  mockAudioResponses,
  seedAssignment,
  seedClassroom,
  submitVoiceRecording,
  unlockStudent,
} from "./mission-fixtures";

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});
test.describe.configure({ timeout: 90_000 });

test("reload mid-mission resumes the same attempt at the next question", async ({
  page,
}, testInfo) => {
  const admin = createAdmin();
  const classroom = await seedClassroom(admin, {
    label: "ResumeE2E",
    studentNames: ["Resume Student"],
  });
  try {
    const [assignmentStudentId] = await seedAssignment(admin, classroom, {
      title: `Resume ${classroom.joinCode}`,
      studentIds: [classroom.students[0].id],
      turns: [
        {
          prompt: "What fruit do you like?",
          targetPattern: "I like ___.",
          targetExample: "I like bananas.",
          tier1: "Start with: I like",
        },
        {
          prompt: "What color are apples?",
          targetPattern: "Apples are ___.",
          targetExample: "Apples are red.",
          tier1: "Start with: Apples are",
        },
      ],
    });
    await installFakeRecorder(page);
    await mockAudioResponses(page, admin, assignmentStudentId, [
      {
        turnOrder: 1,
        clipKind: "original_answer",
        displayTranscript: "I like bananas.",
        evaluation: { kind: "original", outcome: "accepted_original", improvedSentence: null },
      },
      {
        turnOrder: 2,
        clipKind: "original_answer",
        displayTranscript: "Apples are red.",
        evaluation: { kind: "original", outcome: "accepted_original", improvedSentence: null },
      },
    ]);

    await unlockStudent(page, classroom, classroom.students[0]);
    await page.getByText("Start").click();
    await expect(page.getByText("What fruit do you like?")).toBeVisible();
    await submitVoiceRecording(page);
    await expect(page.getByText("Nice answer!")).toBeVisible();
    await page.getByRole("button", { name: "Continue practice" }).click();
    await expect(page.getByText("What color are apples?")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Welcome back! Picking up where you left off.")).toBeVisible();
    await expect(page.getByText("What color are apples?")).toBeVisible();
    await expect(page.getByText("What fruit do you like?")).toHaveCount(0);
    await testInfo.attach("resumed", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await submitVoiceRecording(page);
    await expect(page.getByText("Nice answer!")).toBeVisible();
    await page.getByRole("button", { name: "Continue practice" }).click();
    await expect(page.getByText("Mission complete!")).toBeVisible();

    const { data: attempts } = await admin
      .from("attempts")
      .select("id, status, attempt_turns(turn_order, original_transcript)")
      .eq("assignment_student_id", assignmentStudentId);
    await testInfo.attach("attempts.json", {
      body: JSON.stringify(attempts, null, 2),
      contentType: "application/json",
    });
    expect(attempts).toHaveLength(1);
    expect(attempts![0].status).toBe("completed");
    expect(attempts![0].attempt_turns).toHaveLength(2);
  } finally {
    await cleanupClassroom(admin, classroom);
  }
});
