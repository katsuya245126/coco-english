import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import { createFoundationSmokeRecord } from "@/server/foundation/createFoundationSmokeRecord";

export async function GET() {
  const env = getSupabaseEnv();

  return NextResponse.json({
    supabaseConfigured: env.isConfigured,
  });
}

export async function POST() {
  const payload = await createFoundationSmokeRecord();

  return NextResponse.json(payload);
}
