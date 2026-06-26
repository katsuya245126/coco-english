import { describe, expect, it } from "vitest";
import { resolveClassById } from "@/server/student-access/class-lookup";

// Remembered-class resolve-by-id invariant (STUD-02, D-18).
//
// A remembered device keys on the immutable class id, NOT the join code. When a
// teacher resets the join code, a device that already remembered the class must
// still be able to come back: resolving by the stored class id must return the
// CURRENT (new) join code, never the stale one. This is the heart of D-18 — a
// reset must not strand already-remembered devices.
//
// The pure-shape assertions run without Supabase env; the live-DB property
// (reset → resolve-by-id returns the NEW code) is env-gated like the other
// server tests.

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("resolveClassById (D-18 remembered-class survival)", () => {
  it("returns null for an empty/blank class id without a lookup", async () => {
    expect(await resolveClassById("")).toBeNull();
    expect(await resolveClassById("   ")).toBeNull();
  });

  it(
    "resolves a remembered class by id to the CURRENT join code after a reset (env-aware)",
    async (context) => {
      if (!hasSupabaseEnv) {
        context.skip();
        return;
      }

      const { createSupabaseServiceClient } = await import(
        "@/lib/supabase/server"
      );
      const { generateJoinCode } = await import("@/domain/classroom/join-code");

      const supabase = createSupabaseServiceClient();
      const stamp = Date.now();

      const teacher = await supabase
        .from("teacher_profiles")
        .insert({ display_name: `Remember Test Teacher ${stamp}` })
        .select("id")
        .single();
      expect(teacher.error).toBeNull();

      const originalCode = generateJoinCode();
      const klass = await supabase
        .from("classes")
        .insert({
          teacher_id: teacher.data!.id,
          name: `Remember Test Class ${stamp}`,
          join_code: originalCode,
          data_mode: "real",
        })
        .select("id")
        .single();
      expect(klass.error).toBeNull();
      const classId = klass.data!.id as string;

      // The device remembered this class while originalCode was live.
      const before = await resolveClassById(classId);
      expect(before).not.toBeNull();
      expect(before!.joinCode).toBe(originalCode);

      // Teacher resets the join code.
      const newCode = generateJoinCode();
      expect(newCode).not.toBe(originalCode);
      const reset = await supabase
        .from("classes")
        .update({ join_code: newCode })
        .eq("id", classId);
      expect(reset.error).toBeNull();

      // D-18: resolving the REMEMBERED class by its stable id must now return the
      // NEW code — the device is not stranded on the stale code.
      const after = await resolveClassById(classId);
      expect(after).not.toBeNull();
      expect(after!.classId).toBe(classId);
      expect(after!.joinCode).toBe(newCode);

      // An archived class must not resolve, even by a remembered id.
      await supabase
        .from("classes")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", classId);
      expect(await resolveClassById(classId)).toBeNull();

      await supabase
        .from("teacher_profiles")
        .delete()
        .eq("id", teacher.data!.id);
    },
  );
});
