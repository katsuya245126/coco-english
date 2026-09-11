"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  assignMissionSchema,
  missionFormSchema,
  missionIdSchema,
  type MissionFormInput,
} from "@/domain/mission/schemas";
import { openerGenerationInputSchema } from "@/domain/ai/opener-generation";
import {
  assignMissionToClass,
  listAssignableClassesForTeacher,
} from "@/server/mission/assign-service";
import {
  archiveMission,
  cancelMissionAssignment,
  createMission,
  getMissionForTeacher,
  listMissionAssignmentsForTeacher,
  restoreMission,
  updateMission,
  type MissionAssignmentSummary,
} from "@/server/mission/mission-service";
import { consumeRequestBudget } from "@/server/security/request-budget";
import { generateOpener } from "@/server/ai/opener-generator";
import { uploadMissionImage } from "@/server/mission/picture-storage";

const GENERIC_FAILURE =
  "We could not save the mission. Check the highlighted fields and try again.";

const ASSIGN_FAILURE =
  "We could not assign this mission. Please try again.";

const ARCHIVE_FAILURE =
  "We could not archive this mission. Please try again.";

const RESTORE_FAILURE =
  "We could not restore this mission. Please try again.";

const CANCEL_ASSIGNMENT_FAILURE =
  "We could not cancel this assignment. Please try again.";

const GENERATE_OPENER_FAILURE =
  "We could not generate Coco's opening line. You can write one yourself or try again.";

const PROVIDER_RATE_LIMIT_FAILURE =
  "You’ve made several AI requests. Wait a few minutes and try again.";

const PICTURE_UPLOAD_FAILURE =
  "We could not upload that picture. Use a JPEG, PNG, or WebP up to 5 MB and add a description.";

/**
 * Fails closed: the admission module already denies on RPC error, and a
 * rejection here (an unreachable database) must never escape a server action's
 * typed result union, so it is treated as a denial too.
 */
async function teacherProviderAllowed(teacherId: string): Promise<boolean> {
  try {
    return (
      await consumeRequestBudget({
        actorId: teacherId,
        operation: "teacher_provider",
      })
    ).allowed;
  } catch {
    return false;
  }
}

export type MissionActionResult =
  | { ok: true; missionId: string }
  | { ok: false; error: string };

export type AssignMissionActionResult =
  | { ok: true; className: string; activeStudentCount: number }
  | { ok: false; error: string };

export type ArchiveMissionActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type RestoreMissionActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type CancelMissionAssignmentActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type ListMissionAssignmentsActionResult =
  | { ok: true; assignments: MissionAssignmentSummary[] }
  | { ok: false; error: string };

export type GenerateOpenerActionResult =
  | { ok: true; opener: string }
  | { ok: false; error: string };

export type UploadMissionPictureActionResult =
  | {
      ok: true;
      picture: {
        objectKey: string;
        description: string;
        mimeType: string;
      };
    }
  | { ok: false; error: string };

const cancelMissionAssignmentSchema = z.object({
  missionId: z.string().uuid("Invalid mission reference."),
  assignmentId: z.string().uuid("Invalid assignment reference."),
});

function parseTurns(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") {
    return [];
  }
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function parseConversationMode(value: FormDataEntryValue | null): boolean {
  return value === "true" || value === "on" || value === "1";
}

function parseBooleanSetting(
  value: FormDataEntryValue | null,
  defaultValue: boolean,
): boolean {
  if (value === null) return defaultValue;
  return value === "true" || value === "on" || value === "1";
}

function missionPayloadFromFormData(formData: FormData) {
  return {
    title: formData.get("title"),
    targetPattern: formData.get("targetPattern") ?? undefined,
    level: formData.get("level"),
    requiredTurns: formData.get("requiredTurns"),
    turns: parseTurns(formData.get("turns")),
    conversationMode: parseConversationMode(formData.get("conversationMode")),
    requireCompleteSentenceAnswers: parseBooleanSetting(
      formData.get("requireCompleteSentenceAnswers"),
      true,
    ),
  };
}

export async function uploadMissionPictureAction(
  formData: FormData,
): Promise<UploadMissionPictureActionResult> {
  const profile = await requireTeacherProfile();
  const file = formData.get("file");
  const description = formData.get("description");
  if (!(file instanceof Blob) || typeof description !== "string") {
    return { ok: false, error: PICTURE_UPLOAD_FAILURE };
  }

  try {
    const result = await uploadMissionImage({
      teacherId: profile.id,
      file,
      description: description.trim(),
    });
    return result.ok
      ? { ok: true, picture: result.picture }
      : { ok: false, error: PICTURE_UPLOAD_FAILURE };
  } catch {
    return { ok: false, error: PICTURE_UPLOAD_FAILURE };
  }
}

function omitUndefinedTargetPattern(input: MissionFormInput): MissionFormInput {
  if (input.targetPattern !== undefined) return input;
  const { targetPattern: _targetPattern, ...missionInput } = input;
  return missionInput;
}

export async function createMissionAction(
  formData: FormData,
): Promise<MissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionFormSchema.safeParse(missionPayloadFromFormData(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
    };
  }

  try {
    const mission = await createMission({
      ...omitUndefinedTargetPattern(parsed.data),
      teacherId: profile.id,
    });
    revalidatePath("/teacher/missions");
    return { ok: true, missionId: mission.id };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function updateMissionAction(
  formData: FormData,
): Promise<MissionActionResult> {
  const profile = await requireTeacherProfile();
  const missionId = missionIdSchema.safeParse({
    missionId: formData.get("missionId"),
  });
  const parsed = missionFormSchema.safeParse(missionPayloadFromFormData(formData));

  if (!missionId.success || !parsed.success) {
    return {
      ok: false,
      error:
        parsed.success === false
          ? parsed.error.issues[0]?.message ?? GENERIC_FAILURE
          : GENERIC_FAILURE,
    };
  }

  try {
    // Ownership first: a foreign mission id must never spend this teacher's
    // allowance, so the budget is consumed only for a mission they own. Both
    // reads stay inside the try so a database failure returns this action's
    // typed failure instead of rejecting into the caller.
    const ownedMission = await getMissionForTeacher({
      teacherId: profile.id,
      missionId: missionId.data.missionId,
    });
    if (!ownedMission) {
      return { ok: false, error: GENERIC_FAILURE };
    }

    const mission = await updateMission({
      ...omitUndefinedTargetPattern(parsed.data),
      teacherId: profile.id,
      missionId: missionId.data.missionId,
    });
    revalidatePath("/teacher/missions");
    revalidatePath(`/teacher/missions/${mission.id}`);
    return { ok: true, missionId: mission.id };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function archiveMissionAction(
  missionId: string,
): Promise<ArchiveMissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionIdSchema.safeParse({ missionId });

  if (!parsed.success) {
    return { ok: false, error: ARCHIVE_FAILURE };
  }

  try {
    await archiveMission({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
    });
    revalidatePath("/teacher/missions");
    revalidatePath("/teacher/missions/archived");
    return { ok: true };
  } catch {
    return { ok: false, error: ARCHIVE_FAILURE };
  }
}

export async function restoreMissionAction(
  missionId: string,
): Promise<RestoreMissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionIdSchema.safeParse({ missionId });

  if (!parsed.success) {
    return { ok: false, error: RESTORE_FAILURE };
  }

  try {
    await restoreMission({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
    });
    revalidatePath("/teacher/missions");
    revalidatePath("/teacher/missions/archived");
    return { ok: true };
  } catch {
    return { ok: false, error: RESTORE_FAILURE };
  }
}

export async function cancelMissionAssignmentAction(
  input: unknown,
): Promise<CancelMissionAssignmentActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = cancelMissionAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: CANCEL_ASSIGNMENT_FAILURE };
  }

  try {
    await cancelMissionAssignment({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
      assignmentId: parsed.data.assignmentId,
    });
    revalidatePath("/teacher/missions");
    revalidatePath("/student/home");
    return { ok: true };
  } catch {
    return { ok: false, error: CANCEL_ASSIGNMENT_FAILURE };
  }
}

export async function generateOpenerAction(
  input: unknown,
): Promise<GenerateOpenerActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = openerGenerationInputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: GENERATE_OPENER_FAILURE };
  }

  if (!(await teacherProviderAllowed(profile.id))) {
    return { ok: false, error: PROVIDER_RATE_LIMIT_FAILURE };
  }

  const result = await generateOpener(parsed.data);
  if (!result.ok) {
    return { ok: false, error: GENERATE_OPENER_FAILURE };
  }

  return { ok: true, opener: result.opener };
}

export async function listMissionAssignmentsAction(
  missionId: string,
): Promise<ListMissionAssignmentsActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionIdSchema.safeParse({ missionId });

  if (!parsed.success) {
    return { ok: false, error: CANCEL_ASSIGNMENT_FAILURE };
  }

  try {
    const assignments = await listMissionAssignmentsForTeacher({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
    });
    return { ok: true, assignments };
  } catch {
    return { ok: false, error: CANCEL_ASSIGNMENT_FAILURE };
  }
}

export async function assignMissionAction(
  formData: FormData,
): Promise<AssignMissionActionResult> {
  const profile = await requireTeacherProfile();
  const dueDate = formData.get("dueAt");
  const parsed = assignMissionSchema.safeParse({
    missionId: formData.get("missionId"),
    classId: formData.get("classId"),
    dueAt:
      typeof dueDate === "string" && dueDate.length > 0
        ? new Date(`${dueDate}T23:59:59.000Z`).toISOString()
        : null,
  });

  if (!parsed.success) {
    return { ok: false, error: ASSIGN_FAILURE };
  }

  try {
    // Both referenced resources are proven owned before admission, so a forged
    // mission or class id cannot spend this teacher's allowance. The assignment
    // RPC and its TTS warm-up stay behind the gate. These reads stay inside the
    // try so a database failure returns ASSIGN_FAILURE rather than rejecting.
    const [assignedMission, ownedClasses] = await Promise.all([
      getMissionForTeacher({
        teacherId: profile.id,
        missionId: parsed.data.missionId,
      }),
      listAssignableClassesForTeacher({ teacherId: profile.id }),
    ]);
    if (
      !assignedMission ||
      !ownedClasses.some(({ id }) => id === parsed.data.classId)
    ) {
      return { ok: false, error: ASSIGN_FAILURE };
    }

    if (!(await teacherProviderAllowed(profile.id))) {
      return { ok: false, error: PROVIDER_RATE_LIMIT_FAILURE };
    }

    const result = await assignMissionToClass({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
      classId: parsed.data.classId,
      dueAt: parsed.data.dueAt,
    });
    revalidatePath("/teacher/missions");
    return {
      ok: true,
      className: result.className,
      activeStudentCount: result.activeStudentCount,
    };
  } catch {
    return { ok: false, error: ASSIGN_FAILURE };
  }
}
