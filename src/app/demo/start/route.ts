import { NextResponse } from "next/server";
import { demoClassId } from "@/server/demo/demo-config";
import { createDemoStudent } from "@/server/demo/demo-student";
import { log } from "@/server/logging/logger";
import {
  consumeRequestBudget,
  isRequestBudgetExhausted,
} from "@/server/security/request-budget";
import { studentNetworkSignal } from "@/server/student-access/network-signal";
import {
  sealStudentSession,
  STUDENT_UNLOCK_COOKIE,
} from "@/server/student-access/student-session";

export const dynamic = "force-dynamic";

// Relative Location keeps the browser on the host that received the cookie
// (request.url can carry a different host behind proxies or in dev).
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

// POST /demo/start — "Try the demo" on the public demo deployment. Creates a
// throwaway student in the configured demo class and signs them in with the
// normal student session cookie. 404 unless the demo gate is on.
export async function POST(): Promise<NextResponse> {
  const classId = demoClassId();
  if (!classId) return new NextResponse(null, { status: 404 });

  const back = (state: "busy" | "resting" | "error") => seeOther(`/?demo=${state}`);

  const startBudget = await consumeRequestBudget({
    actorId: `demo-start:${await studentNetworkSignal()}`,
    operation: "demo_start",
  });
  if (!startBudget.allowed) return back("busy");

  if (
    await isRequestBudgetExhausted({
      actorId: `demo-class:${classId}`,
      operation: "demo_daily",
    })
  ) {
    return back("resting");
  }

  let token: string;
  try {
    const student = await createDemoStudent(classId);
    token = sealStudentSession(
      { classId, ...student },
      process.env.STUDENT_ACCESS_SECRET ?? "",
    );
  } catch (err) {
    log("error", "demo.start.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return back("error");
  }

  const response = seeOther("/student/home");
  response.cookies.set(STUDENT_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
