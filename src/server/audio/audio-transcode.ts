/**
 * Server-only audio transcode utility.
 *
 * Keep this module out of client components. The Azure Speech SDK's Node.js
 * client only accepts 16kHz mono PCM WAV input (no compressed-audio path), so
 * every non-WAV student clip (webm/mp4/mp3) must be transcoded here first via
 * a spawned ffmpeg-static binary. Tests inject a fake spawn so no automated
 * verification invokes a real ffmpeg subprocess.
 */

import { spawn as nodeSpawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { log } from "@/server/logging/logger";

export type TranscodeError = "transcode_failed";

export type TranscodeResult =
  | { ok: true; wav: Buffer }
  | { ok: false; error: TranscodeError };

export type TranscodeToWavDeps = {
  spawn?: typeof nodeSpawn;
};

export async function transcodeToWav(
  input: Blob,
  deps?: TranscodeToWavDeps,
): Promise<TranscodeResult> {
  const spawnFn = deps?.spawn ?? nodeSpawn;

  return new Promise((resolve) => {
    let inputBuffer: Buffer;
    try {
      // arrayBuffer() must complete before we can hand bytes to ffmpeg's stdin.
      // Blob#arrayBuffer is async, so read it inside this executor and resolve
      // the discriminated union on any failure rather than rejecting.
      void input
        .arrayBuffer()
        .then((raw) => {
          inputBuffer = Buffer.from(raw);
          runFfmpeg(inputBuffer);
        })
        .catch(() => {
          log("error", "audio.transcode_failed", { error: "transcode_failed" });
          resolve({ ok: false, error: "transcode_failed" });
        });
    } catch {
      log("error", "audio.transcode_failed", { error: "transcode_failed" });
      resolve({ ok: false, error: "transcode_failed" });
      return;
    }

    function runFfmpeg(buffer: Buffer) {
      try {
        const ffmpeg = spawnFn((ffmpegPath as unknown as string) ?? "ffmpeg", [
          "-i",
          "pipe:0",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-f",
          "wav",
          "pipe:1",
        ]);

        const chunks: Buffer[] = [];
        let settled = false;

        ffmpeg.stdout?.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        ffmpeg.on("error", () => {
          if (settled) return;
          settled = true;
          log("error", "audio.transcode_failed", { error: "transcode_failed" });
          resolve({ ok: false, error: "transcode_failed" });
        });

        ffmpeg.on("close", (code: number | null) => {
          if (settled) return;
          settled = true;
          if (code === 0) {
            resolve({ ok: true, wav: Buffer.concat(chunks) });
          } else {
            log("error", "audio.transcode_failed", { error: "transcode_failed" });
            resolve({ ok: false, error: "transcode_failed" });
          }
        });

        ffmpeg.stdin?.on("error", () => {
          // Writing to a dead stdin (e.g. process already exited) must never
          // throw/reject — the "close"/"error" handlers above own resolution.
        });
        ffmpeg.stdin?.write(buffer);
        ffmpeg.stdin?.end();
      } catch {
        log("error", "audio.transcode_failed", { error: "transcode_failed" });
        resolve({ ok: false, error: "transcode_failed" });
      }
    }
  });
}
