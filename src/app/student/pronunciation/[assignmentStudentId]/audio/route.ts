import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
} from "@/server/student-access/audio-upload";
import {
  MAX_PRONUNCIATION_DURATION_MS,
  uploadPronunciationTry,
} from "@/server/student-access/pronunciation-upload";

const uploadInput = z.object({
  assignmentStudentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnOrder: z.coerce.number().int().positive(),
  mimeType: z.string().trim().min(1),
  durationMs: z.coerce.number().int().min(0).max(MAX_PRONUNCIATION_DURATION_MS),
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
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const parsed = uploadInput.safeParse({
    assignmentStudentId,
    attemptId: formData.get("attemptId"),
    turnOrder: formData.get("turnOrder"),
    mimeType: formData.get("mimeType"),
    durationMs: formData.get("durationMs"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const mimeType = parsed.data.mimeType.toLowerCase().split(";")[0]?.trim();
  const fileMimeType = file.type.toLowerCase().split(";")[0]?.trim();
  if (
    file.size > MAX_AUDIO_BYTES ||
    !ALLOWED_AUDIO_MIME_TYPES.has(mimeType) ||
    (!!fileMimeType && fileMimeType !== mimeType)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const result = await uploadPronunciationTry({
    studentId: unlock.studentId,
    assignmentStudentId: parsed.data.assignmentStudentId,
    attemptId: parsed.data.attemptId,
    turnOrder: parsed.data.turnOrder,
    file,
    mimeType,
    durationMs: parsed.data.durationMs,
    byteSize: file.size,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }
  if (result.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.error === "invalid_audio") {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (result.error === "out_of_order" || result.error === "word_finished") {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }
  if (result.error === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds ?? 600) } },
    );
  }
  if (result.error === "db_error") {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: 502 },
  );
}
