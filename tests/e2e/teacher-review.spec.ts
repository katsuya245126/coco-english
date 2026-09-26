/**
 * Teacher review e2e: transcript-first evidence, on-demand signed audio, and a
 * no-speech mark that removes the pronunciation score from the student recap.
 */

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
import { logInTeacher } from "./teacher-auth";

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});
test.describe.configure({ timeout: 90_000 });

test("teacher loads audio on demand and a no-speech mark hides the student's score", async ({
  page,
  browser,
}, testInfo) => {
  const admin = createAdmin();
  const classroom = await seedClassroom(admin, {
    label: "ReviewE2E",
    studentNames: ["Review Student"],
    withTeacherLogin: true,
  });
  const objectKey = `e2e/teacher-review/${randomUUID()}.webm`;
  try {
    const [assignmentStudentId] = await seedAssignment(admin, classroom, {
      title: `Review ${classroom.joinCode}`,
      studentIds: [classroom.students[0].id],
      turns: [
        {
          prompt: "What fruit do you like?",
          targetPattern: "I like ___.",
          targetExample: "I like bananas.",
          tier1: "Start with: I like",
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
    ]);

    await unlockStudent(page, classroom, classroom.students[0]);
    await page.getByText("Start").click();
    await submitVoiceRecording(page);
    await expect(page.getByText("Nice answer!")).toBeVisible();
    await page.getByRole("button", { name: "Continue practice" }).click();
    await expect(page.getByText("Mission complete!")).toBeVisible();

    // The stubbed audio route stores no clip, so add the one the real route
    // would have uploaded and scored.
    const { data: turn } = await admin
      .from("attempt_turns")
      .select("id, attempt_id, attempts!inner(assignment_student_id)")
      .eq("attempts.assignment_student_id", assignmentStudentId)
      .single();
    const audioClipId = randomUUID();
    const upload = await admin.storage
      .from("student-audio")
      .upload(objectKey, Buffer.from("e2e-audio"), { contentType: "audio/webm", upsert: true });
    expect(upload.error).toBeNull();
    const clip = await admin.from("audio_clips").insert({
      id: audioClipId,
      attempt_turn_id: turn!.id,
      clip_kind: "original_answer",
      object_key: objectKey,
      mime_type: "audio/webm",
      duration_ms: 1000,
      byte_size: 9,
      processing_status: "transcribed",
    });
    expect(clip.error).toBeNull();
    const score = await admin.from("pronunciation_scores").insert({
      audio_clip_id: audioClipId,
      provider: "e2e-double",
      reference_text: "I like bananas.",
      accuracy_score: 60,
      fluency_score: 60,
      completeness_score: 60,
      pronunciation_score: 60,
      star_band: 2,
      word_scores: [],
    });
    expect(score.error).toBeNull();

    await page.goto(`/student/history/${assignmentStudentId}`);
    await expect(page.getByText("★★ Pronunciation")).toBeVisible();

    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    try {
      await logInTeacher(teacherPage, classroom.teacherLogin!);
      await teacherPage.goto(`/teacher/evidence/${turn!.attempt_id}`);
      const transcripts = teacherPage.getByRole("region", { name: "Turn transcripts" });
      await expect(transcripts.getByText("I like bananas.").first()).toBeVisible();

      // Stored audio is never on the page until the teacher asks for it.
      await expect(teacherPage.locator("audio")).toHaveCount(0);
      await teacherPage.getByRole("button", { name: "Load audio" }).first().click();
      const audio = teacherPage.locator("audio").first();
      await expect(audio).toHaveAttribute("src", /\/object\/sign\/student-audio\/.+token=/);

      await teacherPage.getByRole("checkbox", { name: "Student said nothing" }).check();
      await teacherPage.getByRole("button", { name: "Save clarification" }).click();
      await expect(teacherPage.getByText("No-speech mark saved.")).toBeVisible();
      await testInfo.attach("teacher-evidence", {
        body: await teacherPage.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } finally {
      await teacherContext.close();
    }

    const { data: marked } = await admin
      .from("audio_clips")
      .select("teacher_marked_no_speech")
      .eq("id", audioClipId)
      .single();
    expect(marked!.teacher_marked_no_speech).toBe(true);

    await page.reload();
    await expect(page.getByText("I like bananas.").first()).toBeVisible();
    await expect(page.getByText("Pronunciation")).toHaveCount(0);
  } finally {
    await admin.storage.from("student-audio").remove([objectKey]);
    await cleanupClassroom(admin, classroom);
  }
});
