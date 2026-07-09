import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "http://localhost:3000";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: npm run test:student-feedback-states

Prerequisite: start the app yourself on http://localhost:3000.

Optional env:
  FEEDBACK_STATE_BASE_URL       default: ${DEFAULT_BASE_URL}
  FEEDBACK_STATE_CLASS_CODE     required
  FEEDBACK_STATE_STUDENT_NAME   required
  FEEDBACK_STATE_PIN            required
`);
  process.exit(0);
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

function fakeMediaRecorderInitScript() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => undefined }],
      }),
    },
  });

  class FakeMediaRecorder {
    static isTypeSupported() {
      return true;
    }

    constructor(_stream, options = {}) {
      this.state = "inactive";
      this.mimeType = options.mimeType || "audio/webm";
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
    }

    start() {
      this.state = "recording";
    }

    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["fake-audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  }

  Object.defineProperty(window, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });
}

function jsonOk(payload) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, ...payload }),
  };
}

function jsonFail(payload, status = 400) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

function silentWavDataUri({
  sampleRate = 8000,
  durationSeconds = 0.35,
} = {}) {
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

async function createTemporaryAssignment(admin, klass, student, stamp, slug) {
  const title = "First mission";
  const missionInsert = await admin
    .from("missions")
    .insert({
      teacher_id: klass.teacher_id,
      title,
      level: "beginner",
      topic: "feedback check",
      target_pattern: "I am fine.",
      required_turns: 2,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  if (missionInsert.error) {
    throw new Error(`Mission insert failed: ${missionInsert.error.message}`);
  }

  const snapshot = {
    missionId: missionInsert.data.id,
    title,
    level: "beginner",
    topic: "feedback check",
    targetPattern: "I am fine.",
    characterId: "default-buddy",
    requiredTurns: 2,
    turns: [
      {
        turnOrder: 1,
        prompt: "How are you?",
        targetExample: "I am fine.",
        hintLadder: {
          tier1: "Use: I am ___.",
          tier2: "fine, happy, okay",
          tier3: "I am fine.",
        },
      },
      {
        turnOrder: 2,
        prompt: "What do you like?",
        targetExample: "I like English.",
        hintLadder: {
          tier1: "Use: I like ___.",
          tier2: "English, soccer, apples",
          tier3: "I like English.",
        },
      },
    ],
  };

  const assignmentInsert = await admin
    .from("assignments")
    .insert({
      mission_id: missionInsert.data.id,
      class_id: klass.id,
      title,
      mission_snapshot: snapshot,
      data_mode: "real",
    })
    .select("id")
    .single();
  if (assignmentInsert.error) {
    throw new Error(`Assignment insert failed: ${assignmentInsert.error.message}`);
  }

  const assignmentStudentInsert = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignmentInsert.data.id,
      student_id: student.id,
      status: "assigned",
    })
    .select("id")
    .single();
  if (assignmentStudentInsert.error) {
    throw new Error(
      `Assignment student insert failed: ${assignmentStudentInsert.error.message}`,
    );
  }

  return {
    slug,
    missionId: missionInsert.data.id,
    assignmentId: assignmentInsert.data.id,
    assignmentStudentId: assignmentStudentInsert.data.id,
    title,
  };
}

async function main() {
  loadEnvLocal();

  const baseUrl = process.env.FEEDBACK_STATE_BASE_URL || DEFAULT_BASE_URL;
  const classCode = process.env.FEEDBACK_STATE_CLASS_CODE;
  const studentName = process.env.FEEDBACK_STATE_STUDENT_NAME;
  const pin = process.env.FEEDBACK_STATE_PIN;

  if (!classCode || !studentName || !pin) {
    throw new Error(
      "Missing FEEDBACK_STATE_CLASS_CODE, FEEDBACK_STATE_STUDENT_NAME, or FEEDBACK_STATE_PIN.",
    );
  }

  try {
    const response = await fetch(`${baseUrl}/join`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Could not reach ${baseUrl}/join. Start the app before running this checker.`,
      { cause: error },
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: class { close() {} } },
    },
  );

  const classResult = await admin
    .from("classes")
    .select("id, teacher_id, name, join_code")
    .eq("join_code", classCode)
    .maybeSingle();
  if (classResult.error || !classResult.data) {
    throw new Error(`Test class not found for code ${classCode}.`);
  }

  const studentResult = await admin
    .from("students")
    .select("id, display_name")
    .eq("class_id", classResult.data.id)
    .eq("display_name", studentName)
    .maybeSingle();
  if (studentResult.error || !studentResult.data) {
    throw new Error(`Test student not found: ${studentName}.`);
  }

  const stamp = Date.now();
  const screenshotDir = path.resolve(
    "test-results",
    `manual-feedback-states-${stamp}`,
  );
  mkdirSync(screenshotDir, { recursive: true });

  const created = [];
  const logs = [];

  try {
    for (const slug of [
      "Accepted",
      "Improved",
      "Repeat Accepted",
      "Retry",
      "Couldnt Hear",
      "Teacher Review",
      "Repeat Retry",
    ]) {
      created.push(
        await createTemporaryAssignment(
          admin,
          classResult.data,
          studentResult.data,
          stamp,
          slug,
        ),
      );
    }

    const bySlug = Object.fromEntries(
      created.map((assignment) => [assignment.slug, assignment]),
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
    await context.addInitScript(fakeMediaRecorderInitScript);
    const page = await context.newPage();

    page.on("console", (message) => {
      logs.push({ type: message.type(), text: message.text() });
    });
    page.on("pageerror", (error) => {
      logs.push({ type: "pageerror", text: error.message });
    });

    const silentWav = silentWavDataUri();
    await page.route("**/student/missions/**/tts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, audioUrl: silentWav, mimeType: "audio/wav" }),
      });
    });

    let queuedAudioResponses = [];
    await page.route("**/student/missions/**/audio", async (route) => {
      const next = queuedAudioResponses.shift();
      if (!next) {
        await route.fulfill(
          jsonFail({ ok: false, error: "unexpected_audio_call" }, 500),
        );
        return;
      }
      await route.fulfill(next);
    });

    async function login() {
      await page.goto(`${baseUrl}/join`);
      await page.getByLabel("Class code").fill(classCode);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByLabel("Your name").fill(studentName);
      await page.getByLabel("4-digit PIN").fill(pin);
      await page.getByRole("button", { name: "Unlock homework" }).click();
      await page.waitForURL("**/student/home", { timeout: 15_000 });
    }

    async function gotoMission(assignmentStudentId) {
      queuedAudioResponses = [];
      await page.goto(`${baseUrl}/student/missions/${assignmentStudentId}`);
      await page.getByText("How are you?").waitFor({
        state: "visible",
        timeout: 15_000,
      });
    }

    async function submitRecording() {
      await page.getByRole("button", { name: "Start recording" }).click();
      await page.getByRole("button", { name: "Stop recording" }).click();
    }

    async function screenshotState(slug, waitText) {
      await page
        .getByText(waitText)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      await verifyVisibleCocoAudio(slug);
      const filePath = path.join(screenshotDir, `${slug}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      return {
        slug,
        path: filePath,
        visibleText: await page.locator("body").innerText(),
      };
    }

    async function verifyVisibleCocoAudio(slug) {
      const button = page.locator('button[aria-label="Play Coco"]').first();
      await button.waitFor({ state: "visible", timeout: 15_000 });
      await expectButtonEnabled(button, slug);
      await button.click();
      const played = await page.evaluate(async () => {
        const audio = document.querySelector("audio[preload='auto']");
        if (!audio) return { ok: false, reason: "missing_audio_element" };
        if (!(audio instanceof HTMLAudioElement)) {
          return { ok: false, reason: "not_audio_element" };
        }
        if (!audio.paused || audio.currentTime > 0) {
          return { ok: true };
        }
        return await new Promise((resolve) => {
          const timeout = window.setTimeout(() => {
            cleanup();
            resolve({
              ok: false,
              reason: "playback_timeout",
              paused: audio.paused,
              currentTime: audio.currentTime,
              readyState: audio.readyState,
            });
          }, 2000);
          function cleanup() {
            window.clearTimeout(timeout);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("play", onPlaying);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onError);
          }
          function onPlaying() {
            cleanup();
            resolve({ ok: true });
          }
          function onEnded() {
            cleanup();
            resolve({ ok: true });
          }
          function onError() {
            cleanup();
            resolve({ ok: false, reason: "audio_error" });
          }
          audio.addEventListener("playing", onPlaying);
          audio.addEventListener("play", onPlaying);
          audio.addEventListener("ended", onEnded);
          audio.addEventListener("error", onError);
        });
      });
      if (!played.ok) {
        throw new Error(`Coco audio playback failed for ${slug}: ${JSON.stringify(played)}`);
      }
    }

    async function expectButtonEnabled(locator, slug) {
      await locator.waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForFunction(
        (label) => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.getAttribute("aria-label") === "Play Coco",
          );
          return button && !button.disabled && button.getAttribute("aria-busy") !== "true";
        },
        slug,
        { timeout: 15_000 },
      );
    }

    await login();
    const results = [];

    await gotoMission(bySlug.Accepted.assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "I am fine.",
        evaluation: { outcome: "accepted_original" },
        starBand: 3,
      }),
    ];
    await submitRecording();
    results.push(await screenshotState("01-accepted-original-green", "Nice answer!"));

    await gotoMission(bySlug.Improved.assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "I don't know.",
        evaluation: {
          outcome: "needs_correction",
          improvedSentence: "I am fine.",
        },
      }),
    ];
    await submitRecording();
    results.push(await screenshotState("02-improved-sentence-blue", "Try this:"));

    await gotoMission(bySlug["Repeat Accepted"].assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "I don't know.",
        evaluation: {
          outcome: "needs_correction",
          improvedSentence: "I am fine.",
        },
      }),
      jsonOk({
        transcript: "I am fine.",
        evaluation: { outcome: "repeat_accepted" },
        starBand: 3,
      }),
    ];
    await submitRecording();
    await page.getByText("Try this:").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Try again" }).click();
    await submitRecording();
    results.push(await screenshotState("03-repeat-accepted-green", "Good repeat."));

    await gotoMission(bySlug.Retry.assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "한국어로 말했어요.",
        evaluation: { outcome: "retry_original" },
      }),
    ];
    await submitRecording();
    results.push(await screenshotState("04-retry-original-amber", "Try again."));

    await gotoMission(bySlug["Couldnt Hear"].assignmentStudentId);
    queuedAudioResponses = [
      jsonFail({ ok: false, error: "transcription_failed_retryable" }),
    ];
    await submitRecording();
    results.push(await screenshotState("05-couldnt-hear-amber", "I didn't hear you. Try again."));

    await gotoMission(bySlug["Teacher Review"].assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "Maybe fine.",
        evaluation: { outcome: "teacher_review" },
      }),
    ];
    await submitRecording();
    results.push(
      await screenshotState("06-teacher-review-amber", "Your teacher will check this answer."),
    );

    await gotoMission(bySlug["Repeat Retry"].assignmentStudentId);
    queuedAudioResponses = [
      jsonOk({
        transcript: "I don't know.",
        evaluation: {
          outcome: "needs_correction",
          improvedSentence: "I am fine.",
        },
      }),
      jsonOk({
        transcript: "I fine.",
        evaluation: { outcome: "retry_repeat" },
      }),
    ];
    await submitRecording();
    await page.getByText("Try this:").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Try again" }).click();
    await submitRecording();
    results.push(await screenshotState("07-repeat-retry-amber", "Try again:"));

    await browser.close();

    const relevantLogs = logs.filter((entry) => {
      const text = String(entry.text || "");
      return (
        entry.type === "error" ||
        entry.type === "pageerror" ||
        /already connected|Web Audio/i.test(text)
      );
    });

    console.log(JSON.stringify({ screenshotDir, results, relevantLogs }, null, 2));
  } finally {
    const assignmentStudentIds = created.map((item) => item.assignmentStudentId);
    const assignmentIds = created.map((item) => item.assignmentId);
    const missionIds = created.map((item) => item.missionId);

    if (assignmentStudentIds.length) {
      await admin.from("assignment_students").delete().in("id", assignmentStudentIds);
    }
    if (assignmentIds.length) {
      await admin.from("assignments").delete().in("id", assignmentIds);
    }
    if (missionIds.length) {
      await admin.from("missions").delete().in("id", missionIds);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
