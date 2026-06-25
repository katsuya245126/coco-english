"use server";

import { revalidatePath } from "next/cache";
import {
  addStudents,
  archiveStudent,
  resetStudentPin,
  setStudentPin,
} from "@/server/classroom/roster-service";
import type {
  AddStudentsResult,
  GeneratedPin,
} from "@/server/classroom/roster-service";
import {
  bulkRosterSchema,
  pinSchema,
} from "@/domain/classroom/roster-schemas";

// Roster server actions. Each delegates to the RLS-bound roster service so
// ownership (RLS + the service's class-ownership check) is enforced server-side.
// One-time cleartext PINs flow back through these results for one-time display
// and are never re-read.

const GENERIC_ERROR =
  "We could not complete that action. Check the details and try again.";

export type AddStudentsActionResult =
  | { status: "ok"; result: AddStudentsResult }
  | { status: "error"; message: string };

export type PinActionResult =
  | { status: "ok"; generated: GeneratedPin }
  | { status: "error"; message: string };

export type RosterActionResult =
  | { status: "ok" }
  | { status: "error"; message: string };

function revalidateRoster(classId: string): void {
  revalidatePath(`/teacher/classes/${classId}`);
}

export async function addStudentsAction(
  classId: string,
  _prev: AddStudentsActionResult | undefined,
  formData: FormData,
): Promise<AddStudentsActionResult> {
  const parsed = bulkRosterSchema.safeParse({ paste: formData.get("paste") });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  try {
    const result = await addStudents(classId, parsed.data.paste);
    revalidateRoster(classId);
    return { status: "ok", result };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

export async function resetStudentPinAction(
  classId: string,
  studentId: string,
): Promise<PinActionResult> {
  try {
    const generated = await resetStudentPin(classId, studentId);
    revalidateRoster(classId);
    return { status: "ok", generated };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

export async function setStudentPinAction(
  classId: string,
  studentId: string,
  _prev: PinActionResult | undefined,
  formData: FormData,
): Promise<PinActionResult> {
  const parsed = pinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  try {
    const generated = await setStudentPin(classId, studentId, parsed.data.pin);
    revalidateRoster(classId);
    return { status: "ok", generated };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

export async function archiveStudentAction(
  classId: string,
  studentId: string,
): Promise<RosterActionResult> {
  try {
    await archiveStudent(classId, studentId);
    revalidateRoster(classId);
    return { status: "ok" };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}
