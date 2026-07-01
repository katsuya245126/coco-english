import { type NextRequest, NextResponse } from "next/server";
import { purgeExpiredAudio } from "@/server/foundation/purgeExpiredAudio";
import { log } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/purge-audio
 *
 * Daily Vercel Cron route that purges expired audio clips Storage-first (PILOT-04).
 * Gated by CRON_SECRET Bearer token — returns 401 immediately when absent or
 * mismatched (T-07-09/T-CRON-AUTH).
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
    const result = await purgeExpiredAudio();
    log("info", "job.purge_audio.complete", { deletedCount: result.deletedCount });
    return NextResponse.json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("error", "job.purge_audio.failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
