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

// 16 kHz mono 16-bit PCM WAV is about 2.9 MB at the app's 90-second maximum.
// Keep headroom for the WAV container while rejecting malformed streams that
// expand far beyond the caller's reported duration.
export const MAX_TRANSCODED_WAV_BYTES = 5 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 15_000;

export type TranscodeResult =
  | { ok: true; wav: Buffer }
  | { ok: false; error: TranscodeError };

/** Read duration from the canonical WAV emitted by ffmpeg. */
export function readPcmWavDurationMs(wav: Buffer): number | null {
  if (
    wav.length < 12 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let format: { sampleRate: number; blockAlign: number } | null = null;
  let offset = 12;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkSize < 16 || chunkDataOffset + 16 > wav.length) return null;
      const audioFormat = wav.readUInt16LE(chunkDataOffset);
      const channels = wav.readUInt16LE(chunkDataOffset + 2);
      const sampleRate = wav.readUInt32LE(chunkDataOffset + 4);
      const blockAlign = wav.readUInt16LE(chunkDataOffset + 12);
      const bitsPerSample = wav.readUInt16LE(chunkDataOffset + 14);
      if (
        audioFormat !== 1 ||
        channels !== 1 ||
        sampleRate !== 16_000 ||
        blockAlign !== 2 ||
        bitsPerSample !== 16
      ) {
        return null;
      }
      format = { sampleRate, blockAlign };
    }

    if (chunkId === "data") {
      if (!format) return null;
      const pcmByteLength =
        chunkSize === 0xffff_ffff ? wav.length - chunkDataOffset : chunkSize;
      if (chunkDataOffset + pcmByteLength > wav.length) return null;
      if (pcmByteLength <= 0 || pcmByteLength % format.blockAlign !== 0) {
        return null;
      }
      return (pcmByteLength / format.blockAlign / format.sampleRate) * 1_000;
    }

    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);
    if (nextOffset <= offset || nextOffset > wav.length) return null;
    offset = nextOffset;
  }

  return null;
}

export type TranscodeToWavDeps = {
  spawn?: typeof nodeSpawn;
  timeoutMs?: number;
};

export async function transcodeToWav(
  input: Blob,
  deps?: TranscodeToWavDeps,
): Promise<TranscodeResult> {
  const spawnFn = deps?.spawn ?? nodeSpawn;
  const timeoutMs = deps?.timeoutMs ?? FFMPEG_TIMEOUT_MS;

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
        let outputBytes = 0;
        let settled = false;
        let killIssued = false;

        const killOnce = () => {
          if (killIssued) return;
          killIssued = true;
          try {
            ffmpeg.kill();
          } catch {
            // The process may already have exited; close/error still settle it.
          }
        };

        function fail(stage: string) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          killOnce();
          log("error", "audio.transcode_failed", {
            error: "transcode_failed",
            stage,
          });
          resolve({ ok: false, error: "transcode_failed" });
        }

        const timeout = setTimeout(() => fail("timeout"), timeoutMs);

        ffmpeg.stdout?.on("data", (chunk: Buffer) => {
          if (settled) return;
          if (outputBytes + chunk.length > MAX_TRANSCODED_WAV_BYTES) {
            fail("output_limit");
            return;
          }
          outputBytes += chunk.length;
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
          clearTimeout(timeout);
          killOnce();
          log("error", "audio.transcode_failed", {
            error: "transcode_failed",
            stage: "spawn_error",
            code: error.code ?? null,
          });
          resolve({ ok: false, error: "transcode_failed" });
        });

        ffmpeg.on("close", (code: number | null) => {
          if (settled) return;
          clearTimeout(timeout);
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

        ffmpeg.stdout?.on("error", () => fail("stdout_error"));
        ffmpeg.stderr?.on("error", () => fail("stderr_error"));
        ffmpeg.stdin?.on("error", () => fail("stdin_error"));
        // Native flowing mode drains stderr without retaining its contents.
        ffmpeg.stderr?.resume();
        try {
          ffmpeg.stdin?.write(buffer);
          ffmpeg.stdin?.end();
        } catch {
          fail("stdin_write_threw");
        }
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
