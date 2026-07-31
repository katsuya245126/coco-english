import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

const noRealtime = {
  realtime: {
    transport: class {
      constructor() {}
      close() {}
    } as unknown as never,
  },
};

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

describe("provider request budgets integration", () => {
  it(
    "atomically permits exactly 24 of 25 concurrent audio requests",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }

      const admin = await createAdminClient();
      const actorDigest = `test-audio-${randomBytes(16).toString("hex")}`;

      try {
        const results = await Promise.all(
          Array.from({ length: 25 }, () =>
            admin.rpc("consume_request_budget", {
              p_actor_digest: actorDigest,
              p_operation: "student_audio",
              p_request_limit: 24,
              p_window_seconds: 600,
            }),
          ),
        );
        expect(results.every(({ error }) => error === null)).toBe(true);
        expect(
          results.filter(({ data }) => data?.[0]?.permitted === true),
        ).toHaveLength(24);
        expect(
          results.filter(({ data }) => data?.[0]?.permitted === false),
        ).toHaveLength(1);

        const denied = results.find(
          ({ data }) => data?.[0]?.permitted === false,
        );
        expect(denied?.data?.[0]?.retry_after_seconds).toBeGreaterThan(0);
      } finally {
        await admin
          .from("request_budgets")
          .delete()
          .eq("actor_digest", actorDigest);
      }
    },
    30_000,
  );

  it(
    "resets an expired window and admits one global warm-up",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }

      const admin = await createAdminClient();
      const actorDigest = `test-warmup-${randomBytes(16).toString("hex")}`;
      const args = {
        p_actor_digest: actorDigest,
        p_operation: "evaluator_warmup",
        p_request_limit: 1,
        p_window_seconds: 90,
      };

      try {
        expect(
          (await admin.rpc("consume_request_budget", args)).data?.[0]
            ?.permitted,
        ).toBe(true);
        expect(
          (await admin.rpc("consume_request_budget", args)).data?.[0]
            ?.permitted,
        ).toBe(false);

        await admin
          .from("request_budgets")
          .update({
            window_started_at: new Date(Date.now() - 91_000).toISOString(),
          })
          .eq("actor_digest", actorDigest)
          .eq("operation", "evaluator_warmup");

        expect(
          (await admin.rpc("consume_request_budget", args)).data?.[0]
            ?.permitted,
        ).toBe(true);
      } finally {
        await admin
          .from("request_budgets")
          .delete()
          .eq("actor_digest", actorDigest);
      }
    },
    30_000,
  );

  it(
    "denies table and RPC access to anon and authenticated roles",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const admin = await createAdminClient();
      const anon = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      });
      const suffix = randomBytes(16).toString("hex");
      const args = {
        p_actor_digest: `test-role-${suffix}`,
        p_operation: "student_helper",
        p_request_limit: 60,
        p_window_seconds: 600,
      };

      const anonTable = await anon.from("request_budgets").select("*");
      expect(anonTable.error).not.toBeNull();
      const anonRpc = await anon.rpc("consume_request_budget", args);
      expect(anonRpc.error).not.toBeNull();

      const password = "Test-Passw0rd!";
      const email = `request-budget-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      const userId = created.data.user!.id;

      try {
        const authenticated = createClient<Database>(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          ...noRealtime,
        });
        const signedIn = await authenticated.auth.signInWithPassword({
          email,
          password,
        });
        expect(signedIn.error).toBeNull();

        const authenticatedTable = await authenticated
          .from("request_budgets")
          .select("*");
        expect(authenticatedTable.error).not.toBeNull();
        const authenticatedRpc = await authenticated.rpc(
          "consume_request_budget",
          args,
        );
        expect(authenticatedRpc.error).not.toBeNull();
      } finally {
        await admin.auth.admin.deleteUser(userId);
        await admin
          .from("request_budgets")
          .delete()
          .eq("actor_digest", args.p_actor_digest);
      }
    },
    30_000,
  );
});
