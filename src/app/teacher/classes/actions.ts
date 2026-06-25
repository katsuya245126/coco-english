"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  createClassSchema,
  updateClassSchema,
} from "@/domain/classroom/schemas";
import {
  archiveClass,
  createClass,
  resetJoinCode,
  updateClass,
} from "@/server/classroom/class-service";

// Generic, non-enumerating failure copy (UI-SPEC error state). Validation errors
// are specific; server/RLS failures stay generic.
const GENERIC_FAILURE =
  "We could not complete that action. Check the details and try again.";

export type ClassActionResult =
  | { ok: true; joinCode?: string }
  | { ok: false; error: string };

// Create a class for the logged-in teacher. requireTeacherProfile gates auth and
// yields the owning teacher id; createClass writes through the RLS-bound client.
export async function createClassAction(
  formData: FormData,
): Promise<ClassActionResult> {
  const profile = await requireTeacherProfile();

  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    await createClass({ teacherId: profile.id, name: parsed.data.name });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/teacher");
  return { ok: true };
}

// Rename a class. Ownership is enforced by RLS + the auth guard.
export async function updateClassAction(
  formData: FormData,
): Promise<ClassActionResult> {
  await requireTeacherProfile();

  const parsed = updateClassSchema.safeParse({
    classId: formData.get("classId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    await updateClass({ classId: parsed.data.classId, name: parsed.data.name });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/teacher");
  return { ok: true };
}

// Archive a class. Archived classes drop out of the active list (D-03).
export async function archiveClassAction(
  formData: FormData,
): Promise<ClassActionResult> {
  await requireTeacherProfile();

  const classId = formData.get("classId");
  if (typeof classId !== "string" || classId.length === 0) {
    return { ok: false, error: GENERIC_FAILURE };
  }

  try {
    await archiveClass({ classId });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/teacher");
  return { ok: true };
}

// Reset a class join code (D-18: new entry only; remembered devices still reach
// the class). Returns the new code so the dialog can show it immediately.
export async function resetJoinCodeAction(
  formData: FormData,
): Promise<ClassActionResult> {
  await requireTeacherProfile();

  const classId = formData.get("classId");
  if (typeof classId !== "string" || classId.length === 0) {
    return { ok: false, error: GENERIC_FAILURE };
  }

  try {
    const joinCode = await resetJoinCode({ classId });
    revalidatePath("/teacher");
    return { ok: true, joinCode };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}
