import { type NextRequest, NextResponse } from "next/server";
import { demoClassId } from "@/server/demo/demo-config";
import { resetDemoClass } from "@/server/demo/demo-reset";
import { log } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/demo-reset
 *
 * Nightly Vercel Cron on the public demo deployment: deletes throwaway demo
 * students and their audio. 404 unless the demo gate is on (production has the
 * route in vercel.json but no gate), then CRON_SECRET Bearer like other crons.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const classId = demoClassId();
  if (!classId) return new NextResponse(null, { status: 404 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json("Unauthorized", { status: 401 });
  }

  try {
    const result = await resetDemoClass(classId);
    log("info", "job.demo_reset.complete", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("error", "job.demo_reset.failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
