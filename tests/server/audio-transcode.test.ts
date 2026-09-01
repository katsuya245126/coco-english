import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

type FakeChildProcess = EventEmitter & {
  stdin: Writable;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
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
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => true);
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

function createHangingSpawn() {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit("close", null));
    return true;
  });
  return { spawn: vi.fn(() => child), child };
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
  it("reads canonical and streamed PCM WAV duration and rejects truncation", async () => {
    const { readPcmWavDurationMs } = await import(
      "@/server/audio/audio-transcode"
    );
    const dataBytes = 16_000 * 2;
    const wav = Buffer.alloc(44 + dataBytes);
    wav.write("RIFF", 0, "ascii");
    wav.writeUInt32LE(36 + dataBytes, 4);
    wav.write("WAVE", 8, "ascii");
    wav.write("fmt ", 12, "ascii");
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16_000, 24);
    wav.writeUInt32LE(32_000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36, "ascii");
    wav.writeUInt32LE(dataBytes, 40);

    expect(readPcmWavDurationMs(wav)).toBe(1_000);
    wav.writeUInt32LE(dataBytes + 2, 40);
    expect(readPcmWavDurationMs(wav)).toBeNull();
    wav.writeUInt32LE(0xffff_ffff, 40);
    expect(readPcmWavDurationMs(wav)).toBe(1_000);
  });

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
    const spawnFn = createFakeSpawn({
      exitCode: null,
      emitError: new Error("ENOENT"),
    });

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawnFn as never },
    );
    const child = spawnFn.mock.results[0]?.value as FakeChildProcess;

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
    expect(child.kill).toHaveBeenCalledTimes(1);
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

  it("caps cumulative decoded output and kills ffmpeg once", async () => {
    const { transcodeToWav, MAX_TRANSCODED_WAV_BYTES } = await import(
      "@/server/audio/audio-transcode"
    );
    const spawnFn = createFakeSpawn({
      chunks: [Buffer.alloc(MAX_TRANSCODED_WAV_BYTES + 1)],
      exitCode: 0,
    });

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawnFn as never },
    );
    const child = spawnFn.mock.results[0]?.value as FakeChildProcess;

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("times out a hung process, kills once, and settles", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const { spawn, child } = createHangingSpawn();

    const result = await transcodeToWav(
      new Blob(["voice"], { type: "audio/webm" }),
      { spawn: spawn as never, timeoutMs: 1 },
    );

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("drains large stderr without changing the success result", async () => {
    const { transcodeToWav } = await import("@/server/audio/audio-transcode");
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as FakeChildProcess;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
      child.kill = vi.fn(() => true);
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.alloc(1024 * 1024));
        child.stdout.emit("data", Buffer.from("RIFF....WAVEfmt "));
        child.emit("close", 0);
      });
      return child;
    });

    await expect(
      transcodeToWav(new Blob(["voice"], { type: "audio/webm" }), {
        spawn: spawnFn as never,
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});
