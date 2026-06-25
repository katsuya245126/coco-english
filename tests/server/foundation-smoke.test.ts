import { describe, expect, it } from "vitest";
import { createFoundationSmokeRecord } from "@/server/foundation/createFoundationSmokeRecord";

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("foundation smoke server path", () => {
  it("creates and reads a demo class assignment skeleton when Supabase env is present", async (context) => {
    if (!hasSupabaseEnv) {
      context.skip();
      return;
    }

    const result = await createFoundationSmokeRecord();

    expect(result).toMatchObject({
      assignmentStudentStatus: "assigned",
      dataMode: "demo",
    });
    expect(result.className).toContain("Foundation Demo");
    expect(result.assignmentTitle).toContain("Foundation Smoke");
  });

  it("keeps the integration path explicitly skipped when Supabase env is absent", (context) => {
    if (hasSupabaseEnv) {
      context.skip();
      return;
    }

    expect(hasSupabaseEnv).toBe(false);
  });
});
