/**
 * Shared classroom device e2e: after student A logs out, the next student on
 * the same browser cannot reach A's assigned homework, even by direct URL.
 */

import { expect, test } from "@playwright/test";
import {
  cleanupClassroom,
  createAdmin,
  seedAssignment,
  seedClassroom,
  unlockStudent,
} from "./mission-fixtures";

test.describe.configure({ timeout: 90_000 });

const turn = {
  prompt: "What fruit do you like?",
  targetPattern: "I like ___.",
  targetExample: "I like bananas.",
  tier1: "Start with: I like",
};

test("logout on a shared device keeps the next student out of the previous student's homework", async ({
  page,
}, testInfo) => {
  const admin = createAdmin();
  const classroom = await seedClassroom(admin, {
    label: "SharedE2E",
    studentNames: ["Student A", "Student B"],
  });
  try {
    const [studentA, studentB] = classroom.students;
    const titleA = `Homework A ${classroom.joinCode}`;
    const titleB = `Homework B ${classroom.joinCode}`;
    const [missionA] = await seedAssignment(admin, classroom, {
      title: titleA,
      studentIds: [studentA.id],
      turns: [turn],
    });
    await seedAssignment(admin, classroom, {
      title: titleB,
      studentIds: [studentB.id],
      turns: [turn],
    });
    const missionAUrl = `/student/missions/${missionA}`;

    await unlockStudent(page, classroom, studentA);
    await expect(page.getByText(titleA)).toBeVisible();
    await page.goto(missionAUrl);
    await expect(page.getByText("What fruit do you like?")).toBeVisible();

    await page.goto("/student/home");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/join/);

    await page.goto(missionAUrl);
    await expect(page).toHaveURL(/\/join/);

    // Student B re-enters through the remembered class, not the class code.
    await expect(async () => {
      await page.getByRole("button", { name: "Login", exact: true }).click({ timeout: 1_000 });
      await expect(page.getByLabel("4-digit PIN")).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.getByLabel(/name/i).fill(studentB.name);
    await page.getByLabel("4-digit PIN").fill(studentB.pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();
    await expect(page).toHaveURL(/\/student\/home/);
    await expect(page.getByText(titleB)).toBeVisible();
    await expect(page.getByText(titleA)).toHaveCount(0);

    await page.goto(missionAUrl);
    await expect(page).toHaveURL(/\/student\/home/);
    await expect(page.getByText("What fruit do you like?")).toHaveCount(0);
    await testInfo.attach("student-b-home", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await cleanupClassroom(admin, classroom);
  }
});
