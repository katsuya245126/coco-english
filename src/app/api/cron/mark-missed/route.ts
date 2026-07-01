import { type NextRequest, NextResponse } from "next/server";
import { markMissedAssignments } from "@/server/foundation/markMissedAssignments";
import { log } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/mark-missed
 *
 * Daily Vercel Cron route that calls markMissedAssignments() to flip overdue
 * incomplete homework to "missed" status (ASGN-05). Gated by CRON_SECRET Bearer
 * token — returns 401 immediately when absent or mismatched (T-07-09/T-CRON-AUTH).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  // T-CRON-AUTH: reject when secret is unset OR header does not match
  if (!cronSecret) {
    return NextResponse.json("Unauthorized", { status: 401 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json("Unauthorized", { status: 401 });
  }

  try {
    const result = await markMissedAssignments();
    log("info", "job.mark_missed.complete", { markedCount: result.markedCount });
    return NextResponse.json({ ok: true, markedCount: result.markedCount });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("error", "job.mark_missed.failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
