/**
 * Public student demo E2E: one-click guest, real preset mission, teacher
 * routes closed, daily cap and Azure-quota "resting" screen, per-network start limit, and a
 * stale cookie after the nightly reset.
 *
 * Runs through `npm run test:e2e:demo` (reset local Supabase + demo seed +
 * DEMO_MODE dev server). Screenshots of each state are the artifact.
 */

import { createHmac } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createAdmin,
  installFakeRecorder,
  mockAudioResponses,
  submitVoiceRecording,
} from "../e2e/mission-fixtures";

test.describe.configure({ mode: "serial", timeout: 90_000 });
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

const admin = createAdmin();
const classId = process.env.DEMO_CLASS_ID!;
const TRY_DEMO = { name: "Try the demo · 체험하기" };

async function snap(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

async function startDemo(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Your recordings are used only to run this session")).toBeVisible();
  await page.getByRole("button", TRY_DEMO).click();
  await expect(page).toHaveURL(/\/student\/home$/);
}

test.beforeEach(async () => {
  const cleared = await admin
    .from("request_budgets")
    .delete()
    .in("operation", ["demo_start", "demo_daily"]);
  expect(cleared.error).toBeNull();
});

test("a guest starts the demo and completes the preset mission", async ({ page }, testInfo) => {
  await installFakeRecorder(page);
  await page.route("**/student/missions/**/tts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, audioUrl: "data:audio/mpeg;base64,SUQz", mimeType: "audio/mpeg" }),
    }),
  );

  await startDemo(page);
  for (const title of ["My Favorite Things", "My Weekend", "F Sound Practice"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await snap(page, testInfo, "1-guest-home");

  const missionLink = page.getByRole("link", { name: /My Favorite Things/ });
  const assignmentStudentId = (await missionLink.getAttribute("href"))!.split("/").pop()!;
  const owner = await admin
    .from("assignment_students")
    .select("students!inner(class_id, pin_hash)")
    .eq("id", assignmentStudentId)
    .single();
  expect(owner.data?.students).toEqual({ class_id: classId, pin_hash: null });

  const answers = ["My favorite food is pizza.", "My favorite animal is a rabbit.", "My favorite color is blue."];
  await mockAudioResponses(
    page,
    admin,
    assignmentStudentId,
    answers.map((displayTranscript, index) => ({
      turnOrder: index + 1,
      clipKind: "original_answer",
      displayTranscript,
      evaluation: { kind: "original", outcome: "accepted_original", improvedSentence: null },
    })),
  );

  await missionLink.click();
  for (const prompt of ["What is your favorite food?", "What is your favorite animal?", "What is your favorite color?"]) {
    await expect(page.getByText(prompt)).toBeVisible();
    await submitVoiceRecording(page);
    await expect(page.getByText("Nice answer!")).toBeVisible();
    await page.getByRole("button", { name: /^Continue (mission|practice)$/ }).click();
  }
  await expect(page.getByText("Mission complete!")).toBeVisible();
  await expect(page.getByText(/You finished all 3 turns/)).toBeVisible();
  await snap(page, testInfo, "2-mission-complete");
});

test("teacher pages are closed on the demo", async ({ page }) => {
  for (const path of ["/teacher", "/auth/login", "/auth/signup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", TRY_DEMO)).toBeVisible();
  }
});

test("an exhausted daily cap shows the resting screen", async ({ page }, testInfo) => {
  // Same digest the server derives for the class-wide daily budget; all 600
  // calls used, so the next paid call would be denied.
  const digest = createHmac("sha256", process.env.STUDENT_ACCESS_SECRET!)
    .update(`request-budget:v1:demo-class:${classId}`)
    .digest("base64url");
  const exhausted = await admin
    .from("request_budgets")
    .insert({ actor_digest: digest, operation: "demo_daily", request_count: 600 });
  expect(exhausted.error).toBeNull();

  await page.goto("/");
  await expect(page.getByText("Coco is resting after a busy day. Come back tomorrow!")).toBeVisible();
  await expect(page.getByRole("button", TRY_DEMO)).toHaveCount(0);
  await snap(page, testInfo, "3-resting");

  const start = await page.request.post("/demo/start", { maxRedirects: 0 });
  expect(start.status()).toBe(303);
  expect(start.headers().location).toMatch(/\/\?demo=resting$/);
});

test("an Azure 429 during pronunciation shows the resting screen", async ({ page }, testInfo) => {
  // The demo's Azure F0 resource refuses calls once its free hours run out; the
  // server turns that into demo_resting (unit-tested), mocked here as the reply.
  await installFakeRecorder(page);
  await page.route("**/student/pronunciation/**/audio", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "demo_resting" }) }),
  );

  await startDemo(page);
  await page.getByRole("link", { name: /F Sound Practice/ }).click();
  await submitVoiceRecording(page);

  await expect(page).toHaveURL(/\/\?demo=resting$/);
  await expect(page.getByText("Coco is resting after a busy day. Come back tomorrow!")).toBeVisible();
  await snap(page, testInfo, "3b-azure-resting");
});

test("the sixth start from one network in an hour is refused", async ({ page }, testInfo) => {
  for (let i = 0; i < 5; i += 1) {
    const allowed = await page.request.post("/demo/start", { maxRedirects: 0 });
    expect(allowed.headers().location).toMatch(/\/student\/home$/);
  }
  const refused = await page.request.post("/demo/start", { maxRedirects: 0 });
  expect(refused.status()).toBe(303);
  expect(refused.headers().location).toMatch(/\/\?demo=busy$/);

  await page.goto("/?demo=busy");
  await expect(page.getByText("Lots of demos started from your network.")).toBeVisible();
  await snap(page, testInfo, "4-busy");
});

test("after the nightly reset an old session lands on the demo landing", async ({ page }, testInfo) => {
  await startDemo(page);

  const reset = await page.request.get("/api/cron/demo-reset", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(reset.status()).toBe(200);
  const remaining = await admin
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);
  expect(remaining.count).toBe(0);

  await page.goto("/student/home");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", TRY_DEMO)).toBeVisible();
  await snap(page, testInfo, "5-after-reset");
});
