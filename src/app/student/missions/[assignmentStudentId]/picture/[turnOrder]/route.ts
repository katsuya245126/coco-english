import { NextResponse } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";
import { createMissionImageSignedUrl } from "@/server/mission/picture-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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

  const supabase = createSupabaseServiceClient();
  const assignment = await supabase
    .from("classes")
    .select("teacher_id, assignments!inner(assignment_students!inner(id, student_id))")
    .eq("assignments.assignment_students.id", assignmentStudentId)
    .eq("assignments.assignment_students.student_id", unlock.studentId)
    .maybeSingle();
  const teacherId = assignment.data?.teacher_id;
  if (assignment.error || !teacherId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const signedUrl = await createMissionImageSignedUrl({ objectKey, teacherId });
  if (!signedUrl) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 307);
}
