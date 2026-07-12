import { NextResponse } from "next/server";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getTeacherQueueSnapshot } from "@/server/teacher/assignment-operations";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const profile = await requireTeacherProfile();
  const snapshot = await getTeacherQueueSnapshot({ teacherId: profile.id });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
