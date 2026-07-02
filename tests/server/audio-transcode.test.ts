import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

type FakeChildProcess = EventEmitter & {
  stdin: Writable;
  stdout: PassThrough;
};

function createFakeSpawn(behavior: {
  chunks?: Buffer[];
  exitCode: number | null;
  emitError?: Error;
}) {
  return vi.fn(() => {
    const child = new EventEmitter() as FakeChildProcess;
    child.stdout = new PassThrough();
    child.stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    queueMicrotask(() => {
      if (behavior.emitError) {
        child.emit("error", behavior.emitError);
        return;
      }
      for (const chunk of behavior.chunks ?? []) {
        child.stdout.emit("data", chunk);
      }
      child.emit("close", behavior.exitCode);
    });

    return child;
  });
}

describe("transcodeToWav", () => {
  it("keeps ffmpeg-static externalized from the Next server bundle", () => {
    const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

    expect(nextConfig).toContain("serverExternalPackages");
    expect(nextConfig).toContain('"ffmpeg-static"');
  });

  it("resolves a WAV buffer from a happy-path fake ffmpeg process", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const fakeWav = Buffer.from("RIFF....WAVEfmt ");
    const spawnFn = createFakeSpawn({ chunks: [fakeWav], exitCode: 0 });

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawnFn as never },
    );

    expect(result).toEqual({ ok: true, wav: fakeWav });
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["-ar", "16000", "-ac", "1", "-f", "wav"]),
    );
  });

  it("maps a non-zero exit code to a typed transcode_failed result", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const spawnFn = createFakeSpawn({ chunks: [], exitCode: 1 });

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawnFn as never },
    );

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
  });

  it("maps a spawn error to a typed transcode_failed result without throwing", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const spawnFn = createFakeSpawn({ exitCode: null, emitError: new Error("ENOENT") });

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawnFn as never },
    );

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
  });
});
