/**
 * RED test — structured stdout logger (Wave 0, Plan 07-01).
 *
 * Imports from the not-yet-existing logger module.
 * Fails with "Cannot find module" until Wave 1 implements the logger.
 *
 * Contract locked here:
 *   - log() writes a single JSON line to process.stdout
 *   - The JSON contains level, event, context fields, and a ts ISO timestamp
 *   - The line ends with a newline character
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This import will fail (RED) until Wave 1 creates src/server/logging/logger.ts
import { log } from "@/server/logging/logger";

describe("structured stdout logger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let capturedOutput: string;

  beforeEach(() => {
    capturedOutput = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk: string | Uint8Array) => {
        capturedOutput += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        return true;
      },
    );
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("writes exactly one line to process.stdout for a single log call", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    expect(stdoutSpy).toHaveBeenCalledOnce();
  });

  it("the output line is valid JSON", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    expect(() => JSON.parse(capturedOutput.trim())).not.toThrow();
  });

  it("JSON contains level: 'error'", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.level).toBe("error");
  });

  it("JSON contains event: 'audio.transcription_failed'", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.event).toBe("audio.transcription_failed");
  });

  it("JSON contains context fields (clipId) at the top level", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.clipId).toBe("c1");
  });

  it("JSON contains a ts field that is a valid ISO timestamp", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.ts).toBeTruthy();
    expect(new Date(parsed.ts as string).getTime()).not.toBeNaN();
    // ISO format: contains 'T' separator
    expect(String(parsed.ts)).toContain("T");
  });

  it("the written string ends with a newline character", () => {
    log("error", "audio.transcription_failed", { clipId: "c1" });

    expect(capturedOutput.endsWith("\n")).toBe(true);
  });

  it("accepts 'info' log level", () => {
    log("info", "cron.mark_missed.complete", { markedCount: 5 });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("cron.mark_missed.complete");
    expect(parsed.markedCount).toBe(5);
  });

  it("accepts 'warn' log level", () => {
    log("warn", "cron.mark_missed.storage_error", { reason: "timeout" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.level).toBe("warn");
  });

  it("merges multiple context fields into the output object", () => {
    log("info", "teacher.override", { teacherId: "t-1", assignmentStudentId: "as-1", nextStatus: "completed" });

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.teacherId).toBe("t-1");
    expect(parsed.assignmentStudentId).toBe("as-1");
    expect(parsed.nextStatus).toBe("completed");
  });

  it("works with an empty context object", () => {
    log("info", "healthcheck", {});

    const parsed = JSON.parse(capturedOutput.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("healthcheck");
    expect(parsed.ts).toBeTruthy();
  });
});
