import { z } from "zod";

// Roster + PIN input schemas (CLASS-02, CLASS-03). Shared between the roster
// server actions and the client forms via @hookform/resolvers where useful.

// Bulk paste form: the raw textarea contents. Parsing/blank/duplicate surfacing
// is done by parseRosterPaste; this only guards that something was pasted.
export const bulkRosterSchema = z.object({
  paste: z
    .string()
    .min(1, "Paste at least one student name."),
});

// A 4-digit PIN entered/confirmed by a teacher when manually changing a PIN.
export const pinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});
