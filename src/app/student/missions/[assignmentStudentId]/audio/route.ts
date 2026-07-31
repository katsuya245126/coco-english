import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
  toStudentEvaluation,
  uploadAttemptAudioClip,
} from "@/server/student-access/audio-upload";

const audioUploadSchema = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.coerce.number().int().positive(),
  clipKind: z.enum(["original_answer", "repeat_attempt"]),
  durationMs: z.coerce.number().int().min(0).max(MAX_AUDIO_DURATION_MS),
});

type RouteContext = {
  params: Promise<{ assignmentStudentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    return NextResponse.json({ ok: false, error: "session_expired" }, { status: 401 });
  }

  const { assignmentStudentId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");
  const mimeTypeField = formData.get("mimeType");

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const parsed = audioUploadSchema.safeParse({
    assignmentStudentId,
    attemptId: formData.get("attemptId"),
    turnOrder: formData.get("turnOrder"),
    clipKind: formData.get("clipKind"),
    durationMs: formData.get("durationMs"),
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const mimeType =
    typeof mimeTypeField === "string" && mimeTypeField.trim().length > 0
      ? mimeTypeField
      : file.type;
  const normalizedMimeType = mimeType.toLowerCase().split(";")[0]?.trim();
  const fileMimeType = file.type.toLowerCase().split(";")[0]?.trim();

  if (
    file.size > MAX_AUDIO_BYTES ||
    !normalizedMimeType ||
    !ALLOWED_AUDIO_MIME_TYPES.has(normalizedMimeType) ||
    (!!fileMimeType && fileMimeType !== normalizedMimeType)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const result = await uploadAttemptAudioClip({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    turnOrder: parsed.data.turnOrder,
    clipKind: parsed.data.clipKind,
    file,
    mimeType,
    durationMs: parsed.data.durationMs,
    byteSize: file.size,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      audioClipId: result.audioClipId,
      processingStatus: result.processingStatus,
      displayTranscript: result.displayTranscript,
      evaluation: toStudentEvaluation(result.evaluation),
      starBand: result.starBand,
      wordsToPractice: result.wordsToPractice,
      cocoLine: result.cocoLine ?? null,
      cocoLineModerationEvent: result.cocoLineModerationEvent ?? null,
    });
  }

  if (result.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (result.error === "invalid_audio") {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  if (result.error === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds ?? 600),
        },
      },
    );
  }

  if (result.error === "transcription_failed_retryable") {
    return NextResponse.json(
      { ok: false, error: "transcription_failed_retryable" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { ok: false, error: "upload_failed_retryable" },
    { status: 502 },
  );
}
