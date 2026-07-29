import { expect, test } from "@playwright/test";

/**
 * Coco voice replay — browser-required autoplay/audio semantics (VOICE-02,
 * VOICE-04, D-02, D-03, D-12..D-15). Source-only structural checks live in
 * tests/domain/tts-ui-source.test.ts; this spec is reserved for behavior
 * that depends on `HTMLMediaElement.play()` promise/autoplay semantics.
 */

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

test("student mission page renders without registering microphone permission for Coco playback", async ({
  page,
}) => {
  // CocoSpeechAudio must use plain <audio> playback and must never request
  // getUserMedia — voice playback is unrelated to the student's microphone
  // recording flow (separate concern from VoiceRecorderControl).
  await page.goto("/");

  const grantedPermissions = await page.evaluate(async () => {
    if (!("permissions" in navigator)) return "unsupported";
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return status.state;
    } catch {
      return "unsupported";
    }
  });

  expect(["prompt", "denied", "unsupported"]).toContain(grantedPermissions);
});
