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
        const ffmpeg = spawnFn(ffmpegPath ?? "ffmpeg", [
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

        // `code` is a libuv constant, never user data. It is the only field
        // that separates a binary missing from the deployed function (ENOENT)
        // from one present but not executable (EACCES) or built for the wrong
        // architecture (ENOEXEC) — a distinction the logs could not previously
        // make, since every failure path emitted the same bare string.
        ffmpeg.on("error", (error: NodeJS.ErrnoException) => {
          if (settled) return;
          settled = true;
          log("error", "audio.transcode_failed", {
            error: "transcode_failed",
            stage: "spawn_error",
            code: error.code ?? null,
          });
          resolve({ ok: false, error: "transcode_failed" });
        });

        ffmpeg.on("close", (code: number | null) => {
          if (settled) return;
          settled = true;
          if (code === 0) {
            resolve({ ok: true, wav: Buffer.concat(chunks) });
          } else {
            // Reaching a non-zero exit proves the binary ran: this is a decode
            // fault, not a packaging one.
            log("error", "audio.transcode_failed", {
              error: "transcode_failed",
              stage: "ffmpeg_exit",
            });
            resolve({ ok: false, error: "transcode_failed" });
          }
        });

        ffmpeg.stdin?.on("error", () => {
          // Writing to a dead stdin (e.g. process already exited) must never
          // throw/reject — the "close"/"error" handlers above own resolution.
        });
        ffmpeg.stdin?.write(buffer);
        ffmpeg.stdin?.end();
      } catch (error) {
        log("error", "audio.transcode_failed", {
          error: "transcode_failed",
          stage: "spawn_threw",
          code: (error as NodeJS.ErrnoException)?.code ?? null,
        });
        resolve({ ok: false, error: "transcode_failed" });
      }
    }
  });
}
