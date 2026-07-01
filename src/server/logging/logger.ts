// Structured stdout logger (PILOT-03).
//
// Zero-dependency server-side logger that writes newline-terminated JSON lines
// to process.stdout. Every log line contains level, event, an ISO ts, and any
// caller-supplied context fields — no third-party packages required.
//
// SECURITY: server-only by construction (writes to process.stdout). Never import
// from a "use client" module.

export type LogLevel = "info" | "warn" | "error";

/**
 * Write one structured JSON log line to process.stdout.
 *
 * @param level   - Severity: "info" | "warn" | "error"
 * @param event   - Dot-separated event name, e.g. "audio.transcription_failed"
 * @param context - Optional key/value context fields (ids, counts, error messages
 *                  only — never transcript text or PII per T-07-12)
 */
export function log(
  level: LogLevel,
  event: string,
  context?: Record<string, unknown>,
): void {
  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...context,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}
