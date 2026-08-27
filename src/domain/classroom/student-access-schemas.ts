import { z } from "zod";

// Student-access input schemas (STUD-01, STUD-03, STUD-04).
//
// These validate fully-untrusted input from an unauthenticated student browser.
// They are intentionally permissive on the join code and name (the server
// resolves them against the database and returns a single generic mismatch on
// ANY failure — D-16), and strict on the PIN shape so a malformed PIN can be
// rejected before any lookup. None of these messages may reveal WHICH field
// failed during unlock; field-shape validation (e.g. "PIN must be 4 digits") is
// allowed only for the live form before submit, never as an unlock-failure
// reason.

// Join code: trimmed, uppercased for matching. The generator
// (JOIN_CODE_ALPHABET, plan 02-02) emits uppercase non-ambiguous chars; we
// uppercase here so a student typing lowercase still matches. Length is bounded
// to avoid pathological input but not asserted to a single value (codes are
// resettable and length could change).
export const joinCodeInputSchema = z
  .string()
  .trim()
  .min(1, "Enter the class code.")
  .max(32, "That class code is too long.")
  .transform((value) => value.toUpperCase());

// Typed student name (D-11: typed, never selected from a roster). Kept raw here;
// the unlock service normalizes it with normalizeRosterName before matching.
export const typedNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "That name is too long.");

// PIN: exactly 4 digits (STUD-04). A malformed PIN is rejected before any DB
// lookup so a wrong-shape PIN costs nothing and still reads as a generic failure
// to the student.
export const pinInputSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Enter your 4-digit PIN.");

// Full unlock tuple: join code + typed name + PIN.
export const studentUnlockSchema = z.object({
  joinCode: joinCodeInputSchema,
  typedName: typedNameSchema,
  pin: pinInputSchema,
});
