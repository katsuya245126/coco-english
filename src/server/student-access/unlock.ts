import { createHmac } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeRosterName } from "@/domain/classroom/roster-parser";
import { verifyPin } from "@/domain/classroom/pin";

// Student unlock service (STUD-04, STUD-05, D-16).
//
// This is the security heart of the student-access slice. It verifies the
// (join code, typed name, PIN) tuple entirely server-side and returns ONE
// identical public failure (`generic_mismatch`) for EVERY failure branch —
// wrong/unknown/archived code, wrong name, wrong PIN, malformed PIN, or any
// internal error. The browser can never learn which field was wrong, so the
// roster/codes/PINs cannot be enumerated (threat T-02-14).
//
// Students have no Supabase Auth session, so this uses the server-only
// SERVICE-ROLE client (bypasses RLS). The closed/no_homework result variants are
// reserved for the home shell to describe class STATE; they are never used to
// describe an unlock FAILURE, so they can never leak which field mismatched.
//
// SECURITY: server-only by construction (service-role client + node:crypto via
// verifyPin + PIN_HASH_PEPPER). Never import into a client component.

export type StudentUnlockResult =
  | {
      ok: true;
      classId: string;
      studentId: string;
      className: string;
      displayName: string;
    }
  | { ok: false; error: "generic_mismatch" };

// The single public failure value. Returned identically for every failure path.
const GENERIC_MISMATCH: StudentUnlockResult = {
  ok: false,
  error: "generic_mismatch",
};

export async function unlockStudent(input: {
  joinCode: string;
  typedName: string;
  pin: string;
}, networkSignal: string): Promise<StudentUnlockResult> {
  // 1. Reject a malformed PIN BEFORE any lookup. A wrong-shape PIN costs no DB
  //    work and reads as the same generic failure as everything else.
  if (!/^\d{4}$/.test(input.pin)) {
    return GENERIC_MISMATCH;
  }

  const joinCode = input.joinCode.trim().toUpperCase();
  const normalizedName = normalizeRosterName(input.typedName);
  if (joinCode.length === 0 || normalizedName.length === 0) {
    return GENERIC_MISMATCH;
  }

  const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
  if (Buffer.byteLength(secret) < 32) return GENERIC_MISMATCH;
  const digest = (purpose: string, value: string) =>
    createHmac("sha256", secret)
      .update(`${purpose}:v1:${value}`)
      .digest("base64url");

  try {
    const supabase = createSupabaseServiceClient();

    // 2. Resolve the active class by join code. Archived/unknown -> generic.
    const klass = await supabase
      .from("classes")
      .select("id, name, join_code, archived_at")
      .eq("join_code", joinCode)
      .is("archived_at", null)
      .maybeSingle();

    if (klass.error || !klass.data) {
      return GENERIC_MISMATCH;
    }

    // 3. Look up the active student by class + normalized typed name. The stored
    //    display_name is the normalized value (plan 02-03), so we match against
    //    the normalized typed name. Unknown name -> generic.
    const student = await supabase
      .from("students")
      .select("id, display_name, pin_hash, archived_at")
      .eq("class_id", klass.data.id)
      .eq("display_name", normalizedName)
      .is("archived_at", null)
      .maybeSingle();

    if (student.error || !student.data || !student.data.pin_hash) {
      return GENERIC_MISMATCH;
    }

    const targetDigest = digest("student-unlock-target", student.data.id);
    const networkDigest = digest(
      "student-unlock-network",
      networkSignal || "unknown",
    );
    const permitted = await supabase.rpc("consume_student_unlock_attempt", {
      p_target_digest: targetDigest,
      p_network_digest: networkDigest,
    });
    if (permitted.error || permitted.data !== true) return GENERIC_MISMATCH;

    // 4. Verify the PIN hash (constant-time, never throws). Wrong PIN -> generic.
    if (!verifyPin(input.pin, student.data.pin_hash)) {
      return GENERIC_MISMATCH;
    }

    const cleared = await supabase.rpc("clear_student_unlock_attempts", {
      p_target_digest: targetDigest,
    });
    if (cleared.error) return GENERIC_MISMATCH;

    // 5. Full match. Return minimal student/class context for the home shell.
    return {
      ok: true,
      classId: klass.data.id,
      studentId: student.data.id,
      className: klass.data.name,
      displayName: student.data.display_name,
    };
  } catch {
    // Any unexpected error funnels to the same generic failure — never reveal
    // internal detail to the student (D-16).
    return GENERIC_MISMATCH;
  }
}
