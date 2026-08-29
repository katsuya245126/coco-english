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

describe("student unlock rate limiter integration", () => {
  it(
    "atomically permits exactly five of six concurrent attempts",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          ...noRealtime,
        },
      );
      const suffix = randomBytes(16).toString("hex");
      const targetDigest = `test-target-${suffix}`;
      const networkDigest = `test-network-${suffix}`;

      try {
        const results = await Promise.all(
          Array.from({ length: 6 }, () =>
            admin.rpc("consume_student_unlock_attempt", {
              p_target_digest: targetDigest,
              p_network_digest: networkDigest,
            }),
          ),
        );
        expect(results.map(({ error }) => error)).toEqual(
          Array.from({ length: 6 }, () => null),
        );
        expect(results.filter(({ data }) => data === true)).toHaveLength(5);
        expect(results.filter(({ data }) => data === false)).toHaveLength(1);

        const row = await admin
          .from("student_unlock_attempts")
          .select("attempt_count")
          .eq("target_digest", targetDigest)
          .eq("network_digest", networkDigest)
          .single();
        expect(row.error).toBeNull();
        expect(row.data?.attempt_count).toBe(6);

        const targetRow = await admin
          .from("student_unlock_target_attempts")
          .select("attempt_count")
          .eq("target_digest", targetDigest)
          .single();
        expect(targetRow.error).toBeNull();
        expect(targetRow.data?.attempt_count).toBe(6);
      } finally {
        await admin.rpc("clear_student_unlock_attempts", {
          p_target_digest: targetDigest,
        });
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
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          ...noRealtime,
        },
      );
      const anon = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      });
      const suffix = randomBytes(16).toString("hex");
      const args = {
        p_target_digest: `test-target-${suffix}`,
        p_network_digest: `test-network-${suffix}`,
      };

      const anonTable = await anon.from("student_unlock_attempts").select("*");
      expect(anonTable.error).not.toBeNull();
      const anonTargetTable = await anon
        .from("student_unlock_target_attempts")
        .select("*");
      expect(anonTargetTable.error).not.toBeNull();
      const anonRpc = await anon.rpc("consume_student_unlock_attempt", args);
      expect(anonRpc.error).not.toBeNull();
      const anonClearRpc = await anon.rpc("clear_student_unlock_attempts", {
        p_target_digest: args.p_target_digest,
      });
      expect(anonClearRpc.error).not.toBeNull();

      const password = "Test-Passw0rd!";
      const created = await admin.auth.admin.createUser({
        email: `unlock-limit-${suffix}@example.test`,
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
          email: `unlock-limit-${suffix}@example.test`,
          password,
        });
        expect(signedIn.error).toBeNull();

        const authenticatedTable = await authenticated
          .from("student_unlock_attempts")
          .select("*");
        expect(authenticatedTable.error).not.toBeNull();
        const authenticatedRpc = await authenticated.rpc(
          "consume_student_unlock_attempt",
          args,
        );
        expect(authenticatedRpc.error).not.toBeNull();
        const authenticatedClearRpc = await authenticated.rpc(
          "clear_student_unlock_attempts",
          { p_target_digest: args.p_target_digest },
        );
        expect(authenticatedClearRpc.error).not.toBeNull();
      } finally {
        await admin.auth.admin.deleteUser(userId);
        await admin.rpc("clear_student_unlock_attempts", {
          p_target_digest: args.p_target_digest,
        });
      }
    },
    30_000,
  );

  it(
    "permits ten target attempts across networks and five attempts per pair",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const suffix = randomBytes(16).toString("hex");
      const targetDigest = `test-target-${suffix}`;
      const pairTargetDigest = `test-target-pair-${suffix}`;

      try {
        const targetResults = await Promise.all(
          Array.from({ length: 11 }, (_, index) =>
            admin.rpc("consume_student_unlock_attempt", {
              p_target_digest: targetDigest,
              p_network_digest: `test-network-${suffix}-${index}`,
            }),
          ),
        );
        expect(targetResults.filter(({ data }) => data === true)).toHaveLength(10);
        expect(targetResults.filter(({ data }) => data === false)).toHaveLength(1);

        const pairResults = await Promise.all(
          Array.from({ length: 6 }, () =>
            admin.rpc("consume_student_unlock_attempt", {
              p_target_digest: pairTargetDigest,
              p_network_digest: `test-network-${suffix}-pair`,
            }),
          ),
        );
        expect(pairResults.filter(({ data }) => data === true)).toHaveLength(5);
        expect(pairResults.filter(({ data }) => data === false)).toHaveLength(1);
      } finally {
        await admin.rpc("clear_student_unlock_attempts", {
          p_target_digest: targetDigest,
        });
        await admin.rpc("clear_student_unlock_attempts", {
          p_target_digest: pairTargetDigest,
        });
      }
    },
    30_000,
  );

  it(
    "rolls back the target counter when the pair write fails",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const targetDigest = `test-target-${randomBytes(16).toString("hex")}`;

      const failed = await admin.rpc("consume_student_unlock_attempt", {
        p_target_digest: targetDigest,
        p_network_digest: null,
      } as never);
      expect(failed.error).not.toBeNull();

      const targetRow = await admin
        .from("student_unlock_target_attempts")
        .select("target_digest")
        .eq("target_digest", targetDigest);
      expect(targetRow.error).toBeNull();
      expect(targetRow.data).toHaveLength(0);
    },
    30_000,
  );
});
