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
  /**
   * Emit "close" after "error". A real failed spawn can do both, and the
   * `settled` guard is what keeps that from logging (and resolving) twice.
   */
  closeAfterError?: boolean;
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
        if (!behavior.closeAfterError) return;
      }
      for (const chunk of behavior.chunks ?? []) {
        child.stdout.emit("data", chunk);
      }
      child.emit("close", behavior.exitCode);
    });

    return child;
  });
}

/** An ErrnoException as `spawn` raises it — the `code` is what we assert on. */
function spawnError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`spawn ffmpeg ${code}`), { code });
}

/**
 * Capture `audio.transcode_failed` lines off stdout. The logger writes real
 * JSON to process.stdout, so asserting on the parsed line tests the payload
 * that actually reaches production logs rather than the call arguments.
 */
function captureTranscodeLogs() {
  const captured: Record<string, unknown>[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      try {
        const entry = JSON.parse(String(chunk));
        if (entry?.event === "audio.transcode_failed") captured.push(entry);
      } catch {
        // Non-JSON stdout writes (test reporter output) are not our concern.
      }
      return true;
    });

  return {
    entries: () => captured,
    restore: () => spy.mockRestore(),
  };
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

  it("logs the spawn errno code so ENOENT is distinguishable from EACCES", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const lines = captureTranscodeLogs();

    try {
      await transcodeToWav(new Blob(["voice"], { type: "audio/webm" }), {
        spawn: createFakeSpawn({
          exitCode: null,
          emitError: spawnError("ENOENT"),
        }) as never,
      });
    } finally {
      lines.restore();
    }

    expect(lines.entries()).toHaveLength(1);
    expect(lines.entries()[0]).toMatchObject({
      event: "audio.transcode_failed",
      error: "transcode_failed",
      stage: "spawn_error",
      code: "ENOENT",
    });
  });

  it("logs once when a spawn error is followed by close", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const lines = captureTranscodeLogs();

    try {
      await transcodeToWav(new Blob(["voice"], { type: "audio/webm" }), {
        spawn: createFakeSpawn({
          exitCode: 1,
          emitError: spawnError("ENOENT"),
          closeAfterError: true,
        }) as never,
      });
    } finally {
      lines.restore();
    }

    expect(lines.entries()).toHaveLength(1);
    expect(lines.entries()[0]).toMatchObject({ stage: "spawn_error" });
  });

  it("logs nothing on the success path", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const lines = captureTranscodeLogs();

    let result;
    try {
      result = await transcodeToWav(new Blob(["voice"], { type: "audio/webm" }), {
        spawn: createFakeSpawn({
          chunks: [Buffer.from("RIFF....WAVEfmt ")],
          exitCode: 0,
        }) as never,
      });
    } finally {
      lines.restore();
    }

    expect(result).toMatchObject({ ok: true });
    expect(lines.entries()).toEqual([]);
  });
});
