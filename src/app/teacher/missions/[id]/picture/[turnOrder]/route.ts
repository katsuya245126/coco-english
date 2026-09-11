import { NextResponse } from "next/server";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getMissionForTeacher } from "@/server/mission/mission-service";
import { createMissionImageSignedUrl } from "@/server/mission/picture-storage";

type RouteContext = {
  params: Promise<{ id: string; turnOrder: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const profile = await requireTeacherProfile();
  const { id, turnOrder: turnOrderText } = await context.params;
  const turnOrder = Number(turnOrderText);
  if (!Number.isInteger(turnOrder) || turnOrder < 1) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const mission = await getMissionForTeacher({
    teacherId: profile.id,
    missionId: id,
  });
  if (!mission) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const objectKey = mission.turns.find(
    (turn) => turn.turnOrder === turnOrder,
  )?.picture?.objectKey;
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const signedUrl = await createMissionImageSignedUrl({ objectKey, teacherId: profile.id });
  if (!signedUrl) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 307);
}
