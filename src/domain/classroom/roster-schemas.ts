import { z } from "zod";

// Roster + PIN input schemas (CLASS-02, CLASS-03). Shared between the roster
// server actions and the client forms via @hookform/resolvers where useful.

// A single student display name. Length cap keeps roster rows readable and
// matches the classroom-friendly intent; normalization happens in the parser.
export const studentNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a student name.")
  .max(80, "Name is too long.");

// Add-one-student form.
export const studentSchema = z.object({
  displayName: studentNameSchema,
});

export type StudentInput = z.infer<typeof studentSchema>;

// Bulk paste form: the raw textarea contents. Parsing/blank/duplicate surfacing
// is done by parseRosterPaste; this only guards that something was pasted.
export const bulkRosterSchema = z.object({
  paste: z
    .string()
    .min(1, "Paste at least one student name."),
});

export type BulkRosterInput = z.infer<typeof bulkRosterSchema>;

// A 4-digit PIN entered/confirmed by a teacher when manually changing a PIN.
export const pinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export type PinInput = z.infer<typeof pinSchema>;
