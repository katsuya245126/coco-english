/**
 * Conversation mission e2e: what the student sees across a two-turn chat.
 *
 * The audio route is stubbed (no transcription or AI), so this proves the
 * client side of the preset/conversation split: no preset success narration,
 * Coco's follow-up becomes the active question, the reply hint is framed from
 * that question (never the conversation context pattern), and the closing line
 * replaces "Mission complete!". Server grounding rules live in
 * tests/server/conversation-orchestrator.test.ts.
 */

import { expect, test } from "@playwright/test";
import { buildReplyHintFrame } from "../../src/domain/ai/reply-hint-frame";
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

const CONTEXT_PATTERN = "My favorite subject is ___.";
const OPENER = "What do you do after school?";
const FOLLOW_UP = "Fun! Who do you play soccer with?";
const CLOSING = "Thanks for telling me. Bye!";

test("conversation mission follows Coco's lines, not the preset flow", async ({
  page,
}, testInfo) => {
  const admin = createAdmin();
  const classroom = await seedClassroom(admin, {
    label: "ConvE2E",
    studentNames: ["Conv Student"],
  });
  try {
    const title = `Conversation ${classroom.joinCode}`;
    const [assignmentStudentId] = await seedAssignment(admin, classroom, {
      title,
      studentIds: [classroom.students[0].id],
      conversation: { contextPattern: CONTEXT_PATTERN, requiredTurns: 2 },
      turns: [
        {
          prompt: OPENER,
          targetPattern: CONTEXT_PATTERN,
          targetExample: "My favorite subject is art.",
          tier1: "Start with: My favorite subject is",
        },
      ],
    });
    await installFakeRecorder(page);
    await mockAudioResponses(page, admin, assignmentStudentId, [
      {
        turnOrder: 1,
        clipKind: "original_answer",
        // Off the context pattern on purpose: conversation mode accepts it.
        displayTranscript: "I play soccer.",
        evaluation: { kind: "original", outcome: "accepted_original", improvedSentence: null },
        cocoLine: FOLLOW_UP,
      },
      {
        turnOrder: 2,
        clipKind: "original_answer",
        displayTranscript: "I play with my brother.",
        evaluation: { kind: "original", outcome: "accepted_original", improvedSentence: null },
        cocoLine: CLOSING,
      },
    ]);

    await unlockStudent(page, classroom, classroom.students[0]);
    await page.getByText("Start").click();
    await expect(page.getByText(OPENER)).toBeVisible();

    await submitVoiceRecording(page);
    await expect(page.getByText(FOLLOW_UP)).toBeVisible();
    await expect(page.getByText("Nice answer!")).toHaveCount(0);
    await expect(page.getByText(/Good job/)).toHaveCount(0);

    const expectedFrame = buildReplyHintFrame(FOLLOW_UP);
    expect(expectedFrame).toBeTruthy();
    expect(expectedFrame).not.toContain("favorite subject");
    await expect(async () => {
      await page.getByRole("button", { name: "Show hint" }).click({ timeout: 1_000 });
      await expect(page.getByText(expectedFrame!)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(page.getByText("My favorite subject is")).toHaveCount(0);

    await submitVoiceRecording(page);
    await expect(page.getByText(CLOSING)).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish mission" })).toBeVisible();
    await expect(page.getByText("Mission complete!")).toHaveCount(0);
    await testInfo.attach("closing", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.getByRole("button", { name: "Finish mission" }).click();
    await expect(page).toHaveURL(new RegExp(`/student/history/${assignmentStudentId}`));

    const { data: attempts } = await admin
      .from("attempts")
      .select("status, attempt_turns(turn_order, original_transcript, coco_line)")
      .eq("assignment_student_id", assignmentStudentId);
    await testInfo.attach("attempts.json", {
      body: JSON.stringify(attempts, null, 2),
      contentType: "application/json",
    });
    expect(attempts).toHaveLength(1);
    expect(attempts![0].status).toBe("completed");
  } finally {
    await cleanupClassroom(admin, classroom);
  }
});
