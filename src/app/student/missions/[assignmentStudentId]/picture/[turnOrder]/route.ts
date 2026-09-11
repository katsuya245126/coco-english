import { NextResponse } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import { createMissionImageSignedUrl } from "@/server/mission/picture-storage";

type RouteContext = {
  params: Promise<{ assignmentStudentId: string; turnOrder: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    return NextResponse.json(
      { ok: false, error: "session_expired" },
      { status: 401 },
    );
  }

  const { assignmentStudentId, turnOrder: turnOrderText } = await context.params;
  const turnOrder = Number(turnOrderText);
  if (!Number.isInteger(turnOrder) || turnOrder < 1) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const owned = await requireOwnedAssignmentStudent({
    studentId: unlock.studentId,
    assignmentStudentId,
  });
  if (!owned.ok || !owned.owned.snapshot) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const turn = owned.owned.snapshot.turns.find(
    (candidate) => candidate.turnOrder === turnOrder,
  );
  const objectKey = turn?.picture?.objectKey;
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const signedUrl = await createMissionImageSignedUrl({ objectKey });
  if (!signedUrl) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 307);
}
