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
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return NextResponse.json(
      {
        error:
          "Supabase env is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const payload = await createFoundationSmokeRecord();

  return NextResponse.json(payload);
}
