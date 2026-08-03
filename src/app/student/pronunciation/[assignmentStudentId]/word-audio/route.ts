import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudentUnlock } from "@/app/join/actions";
import { pronunciationPracticeSnapshotSchema } from "@/domain/pronunciation/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { signPronunciationWordAudioFromSnapshot } from "@/server/audio/pronunciation-word-audio";

const wordAudioInput = z.object({
  wordOrder: z.number().int().min(1).max(5),
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const parsedInput = wordAudioInput.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const owned = await supabase
    .from("assignment_students")
    .select(
      "id, student_id, assignments!inner(assignment_kind, mission_snapshot, canceled_at)",
    )
    .eq("id", assignmentStudentId)
    .eq("student_id", unlock.studentId)
    .maybeSingle();
  if (owned.error || !owned.data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const assignment = owned.data as unknown as {
    assignments?: {
      assignment_kind?: string;
      mission_snapshot?: unknown;
      canceled_at?: string | null;
    } | null;
  };
  if (
    assignment.assignments?.assignment_kind !== "pronunciation" ||
    assignment.assignments.canceled_at
  ) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const snapshot = pronunciationPracticeSnapshotSchema.safeParse(
    assignment.assignments.mission_snapshot,
  );
  const word = snapshot.success
    ? snapshot.data.words.find((candidate) => candidate.order === parsedInput.data.wordOrder)
    : null;
  if (!word) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const result = await signPronunciationWordAudioFromSnapshot({
    schemaVersion: word.wordAudio.schemaVersion,
    contentHash: word.wordAudio.contentHash,
    voice: word.wordAudio.voice,
    format: word.wordAudio.format,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error === "not_found" ? "not_found" : "audio_unavailable" },
      { status: result.error === "not_found" ? 404 : 502 },
    );
  }

  return NextResponse.json({ ok: true, audioUrl: result.audioUrl, mimeType: result.mimeType });
}
