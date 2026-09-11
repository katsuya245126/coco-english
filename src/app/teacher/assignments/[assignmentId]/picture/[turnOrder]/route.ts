import { NextResponse } from "next/server";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
import { createMissionImageSignedUrl } from "@/server/mission/picture-storage";

type RouteContext = {
  params: Promise<{ assignmentId: string; turnOrder: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const profile = await requireTeacherProfile();
  const { assignmentId, turnOrder: turnOrderText } = await context.params;
  const turnOrder = Number(turnOrderText);
  if (!Number.isInteger(turnOrder) || turnOrder < 1) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseServiceClient();
  const assignment = await supabase
    .from("assignments")
    .select("mission_snapshot, classes!inner(teacher_id)")
    .eq("id", assignmentId)
    .eq("classes.teacher_id", profile.id)
    .maybeSingle();
  if (assignment.error || !assignment.data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const interpreted = interpretMissionSnapshot(assignment.data.mission_snapshot);
  if (interpreted.kind !== "complete" || interpreted.snapshot.conversationMode) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const objectKey = interpreted.snapshot.turns.find(
    (turn) => turn.turnOrder === turnOrder,
  )?.picture?.objectKey;
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const signedUrl = await createMissionImageSignedUrl({ objectKey });
  if (!signedUrl) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 307);
}
