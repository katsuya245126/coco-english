import { describe, expect, it } from "vitest";
import { unlockStudent } from "@/server/student-access/unlock";

// Student-access unlock invariants (STUD-04, STUD-05, D-16).
//
// The single most important security property of this slice is the
// non-enumeration invariant: a wrong class code, a wrong (typed) name, and a
// wrong PIN must ALL fail with the identical public error value. These pure
// invariant tests run without Supabase env because the failure paths assert on
// shape and never reach the database — a malformed PIN short-circuits before any
// lookup, and the env-aware happy-path / live-lookup assertions are gated behind
// Supabase env like tests/server/foundation-smoke.test.ts.

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("unlockStudent generic-mismatch invariant (D-16)", () => {
  it("returns generic_mismatch for a malformed PIN without performing a lookup", async () => {
    const result = await unlockStudent({
      joinCode: "ABC123",
      typedName: "Jamie Lee",
      pin: "12", // not 4 digits -> short-circuits before any DB lookup
    });

    expect(result).toEqual({ ok: false, error: "generic_mismatch" });
  });

  it("returns generic_mismatch for non-numeric PINs without a lookup", async () => {
    const result = await unlockStudent({
      joinCode: "ABC123",
      typedName: "Jamie Lee",
      pin: "abcd",
    });

    expect(result).toEqual({ ok: false, error: "generic_mismatch" });
  });

  it("uses the SAME error value for malformed-PIN failures regardless of input", async () => {
    // Different malformed inputs must still funnel to one identical value so a
    // caller can never distinguish which field was wrong (D-16).
    const a = await unlockStudent({
      joinCode: "WRONGCODE",
      typedName: "Someone Else",
      pin: "1",
    });
    const b = await unlockStudent({
      joinCode: "ANOTHER",
      typedName: "Different Name",
      pin: "99999",
    });

    expect(a).toEqual(b);
    expect(a).toEqual({ ok: false, error: "generic_mismatch" });
  });

  it(
    "returns the identical generic_mismatch for wrong code, wrong name, and wrong PIN (env-aware)",
    async (context) => {
      if (!hasSupabaseEnv) {
        // The wrong-code / wrong-name / wrong-PIN branches each hit the DB, so
        // they require Supabase env. Skip cleanly, consistent with the
        // foundation server test, rather than failing.
        context.skip();
        return;
      }

      const { createSupabaseServiceClient } = await import(
        "@/lib/supabase/server"
      );
      const { hashPin } = await import("@/domain/classroom/pin");
      const { generateJoinCode } = await import(
        "@/domain/classroom/join-code"
      );
      const { normalizeRosterName } = await import(
        "@/domain/classroom/roster-parser"
      );

      const supabase = createSupabaseServiceClient();
      const stamp = Date.now();

      const teacher = await supabase
        .from("teacher_profiles")
        .insert({ display_name: `Unlock Test Teacher ${stamp}` })
        .select("id")
        .single();
      expect(teacher.error).toBeNull();

      const joinCode = generateJoinCode();
      const klass = await supabase
        .from("classes")
        .insert({
          teacher_id: teacher.data!.id,
          name: `Unlock Test Class ${stamp}`,
          join_code: joinCode,
          data_mode: "real",
        })
        .select("id")
        .single();
      expect(klass.error).toBeNull();

      const realName = `Unlock Student ${stamp}`;
      const realPin = "4271";
      const student = await supabase
        .from("students")
        .insert({
          class_id: klass.data!.id,
          display_name: normalizeRosterName(realName),
          pin_hash: hashPin(realPin),
        })
        .select("id")
        .single();
      expect(student.error).toBeNull();

      // Happy path: correct tuple unlocks.
      const ok = await unlockStudent({
        joinCode,
        typedName: realName,
        pin: realPin,
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) {
        expect(ok.classId).toBe(klass.data!.id);
        expect(ok.studentId).toBe(student.data!.id);
      }

      // Three distinct failure branches must produce one identical value.
      const wrongCode = await unlockStudent({
        joinCode: "ZZZZZZ",
        typedName: realName,
        pin: realPin,
      });
      const wrongName = await unlockStudent({
        joinCode,
        typedName: "Totally Different Person",
        pin: realPin,
      });
      const wrongPin = await unlockStudent({
        joinCode,
        typedName: realName,
        pin: "0000",
      });

      const generic = { ok: false, error: "generic_mismatch" };
      expect(wrongCode).toEqual(generic);
      expect(wrongName).toEqual(generic);
      expect(wrongPin).toEqual(generic);
      // Identical across all three (the core D-16 assertion).
      expect(wrongCode).toEqual(wrongName);
      expect(wrongName).toEqual(wrongPin);

      // Cleanup (cascades remove class + student).
      await supabase
        .from("teacher_profiles")
        .delete()
        .eq("id", teacher.data!.id);
    },
  );

  it("keeps the live-lookup path explicitly skipped when Supabase env is absent", (context) => {
    if (hasSupabaseEnv) {
      context.skip();
      return;
    }

    expect(hasSupabaseEnv).toBe(false);
  });
});
