import { describe, expect, it } from "vitest";

// Cross-teacher RLS isolation proof (AUTH-04, D-15, RESEARCH Pitfall 2).
//
// Phase 1 enabled RLS; plan 02-01 added the ownership policies. This test proves
// the policies actually isolate two teachers across the class row, the student
// row, AND at least one linked row (assignments) — Pitfall 2 warns that RLS can
// cover classes but miss linked records.
//
// The test seeds two teacher auth users + profiles via the service-role admin
// client, then queries with an AUTHENTICATED user-context client for teacher A
// (RLS active) and asserts teacher A reads zero of teacher B's rows. When
// Supabase env is absent (no service-role key, no anon key) it skips cleanly,
// consistent with tests/server/foundation-smoke.test.ts. Authenticated reads
// also require the anon key to mint a user session, so the full isolation run is
// gated on BOTH keys being present.

const hasServiceEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const hasAnonEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const canRunIsolation = hasServiceEnv && hasAnonEnv;

describe("cross-teacher RLS isolation (AUTH-04)", () => {
  it(
    "prevents teacher A from reading teacher B's class, student, and linked rows",
    async (context) => {
      if (!canRunIsolation) {
        // Requires service-role (seeding/admin) + anon (authenticated user
        // session) Supabase env. Skip cleanly when absent.
        context.skip();
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      // supabase-js constructs a RealtimeClient eagerly, which needs a global
      // WebSocket. Node < 22 has none, and this test only does DB queries (no
      // realtime), so provide an inert transport stub to satisfy the constructor
      // without pulling in the `ws` package or ever opening a socket.
      const noRealtime = {
        realtime: {
          transport: class {
            constructor() {}
            close() {}
          } as unknown as never,
        },
      };

      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      });

      const stamp = Date.now();
      const password = "Test-Passw0rd!";
      const emailA = `rls-teacher-a-${stamp}@example.test`;
      const emailB = `rls-teacher-b-${stamp}@example.test`;

      // --- Seed two confirmed auth users + profiles + owned data. ---
      const userA = await admin.auth.admin.createUser({
        email: emailA,
        password,
        email_confirm: true,
      });
      expect(userA.error).toBeNull();
      const userB = await admin.auth.admin.createUser({
        email: emailB,
        password,
        email_confirm: true,
      });
      expect(userB.error).toBeNull();

      const profileA = await admin
        .from("teacher_profiles")
        .insert({ auth_user_id: userA.data.user!.id, display_name: "Teacher A" })
        .select("id")
        .single();
      expect(profileA.error).toBeNull();
      const profileB = await admin
        .from("teacher_profiles")
        .insert({ auth_user_id: userB.data.user!.id, display_name: "Teacher B" })
        .select("id")
        .single();
      expect(profileB.error).toBeNull();

      const classB = await admin
        .from("classes")
        .insert({
          teacher_id: profileB.data!.id,
          name: `B Class ${stamp}`,
          join_code: `B${stamp}`.slice(0, 12),
          data_mode: "real",
        })
        .select("id")
        .single();
      expect(classB.error).toBeNull();

      const studentB = await admin
        .from("students")
        .insert({
          class_id: classB.data!.id,
          display_name: `b student ${stamp}`,
          pin_hash: "s1:deadbeef:deadbeef",
        })
        .select("id")
        .single();
      expect(studentB.error).toBeNull();

      // A linked row beyond classes/students: a mission + assignment for B's
      // class. Pitfall 2 requires proving isolation extends to linked records.
      const missionB = await admin
        .from("missions")
        .insert({
          teacher_id: profileB.data!.id,
          title: `B Mission ${stamp}`,
          target_pattern: "I like ____.",
          topic: "food",
          level: "elementary",
          required_turns: 1,
          character_id: "default-buddy",
        })
        .select("id")
        .single();
      expect(missionB.error).toBeNull();

      const assignmentB = await admin
        .from("assignments")
        .insert({
          class_id: classB.data!.id,
          mission_id: missionB.data!.id,
          title: `B Assignment ${stamp}`,
          due_at: new Date(Date.now() + 86_400_000).toISOString(),
          data_mode: "real",
          mission_snapshot: { missionId: missionB.data!.id, turns: [] },
        })
        .select("id")
        .single();
      expect(assignmentB.error).toBeNull();

      // --- Authenticate as teacher A (RLS active via anon-key user client). ---
      const aClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      });
      const signIn = await aClient.auth.signInWithPassword({
        email: emailA,
        password,
      });
      expect(signIn.error).toBeNull();

      // Teacher A must read ZERO of teacher B's rows across every level.
      const seenClass = await aClient
        .from("classes")
        .select("id")
        .eq("id", classB.data!.id);
      expect(seenClass.error).toBeNull();
      expect(seenClass.data ?? []).toHaveLength(0);

      const seenStudent = await aClient
        .from("students")
        .select("id")
        .eq("id", studentB.data!.id);
      expect(seenStudent.error).toBeNull();
      expect(seenStudent.data ?? []).toHaveLength(0);

      const seenAssignment = await aClient
        .from("assignments")
        .select("id")
        .eq("id", assignmentB.data!.id);
      expect(seenAssignment.error).toBeNull();
      expect(seenAssignment.data ?? []).toHaveLength(0);

      // --- Cleanup. ---
      await admin.from("teacher_profiles").delete().eq("id", profileA.data!.id);
      await admin.from("teacher_profiles").delete().eq("id", profileB.data!.id);
      await admin.from("missions").delete().eq("id", missionB.data!.id);
      await admin.auth.admin.deleteUser(userA.data.user!.id);
      await admin.auth.admin.deleteUser(userB.data.user!.id);
    },
    30_000,
  );

  it("keeps the cross-teacher isolation check explicitly skipped without Supabase env", (context) => {
    if (canRunIsolation) {
      context.skip();
      return;
    }

    expect(canRunIsolation).toBe(false);
  });
});
