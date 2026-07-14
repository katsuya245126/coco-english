"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  assignMissionSchema,
  missionFormSchema,
  missionIdSchema,
} from "@/domain/mission/schemas";
import { scenePremiseInputSchema } from "@/domain/ai/scene-premise";
import { assignMissionToClass } from "@/server/mission/assign-service";
import {
  archiveMission,
  cancelMissionAssignment,
  createMission,
  deleteMission,
  listMissionAssignmentsForTeacher,
  restoreMission,
  updateMission,
  type MissionAssignmentSummary,
} from "@/server/mission/mission-service";
import { generateScenePremise } from "@/server/ai/scene-premise-generator";

const GENERIC_FAILURE =
  "We could not save the mission. Check the highlighted fields and try again.";

const ASSIGN_FAILURE =
  "We could not assign this mission. Please try again.";

const DELETE_FAILURE =
  "We could not delete this mission. Assigned missions cannot be deleted.";

const ARCHIVE_FAILURE =
  "We could not archive this mission. Please try again.";

const RESTORE_FAILURE =
  "We could not restore this mission. Please try again.";

const CANCEL_ASSIGNMENT_FAILURE =
  "We could not cancel this assignment. Please try again.";

const GENERATE_PREMISE_FAILURE =
  "We could not generate a scene premise. You can write one yourself or try again.";

export type MissionActionResult =
  | { ok: true; missionId: string }
  | { ok: false; error: string };

export type AssignMissionActionResult =
  | { ok: true; className: string; activeStudentCount: number }
  | { ok: false; error: string };

export type DeleteMissionActionResult =
  | { ok: true }
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

export type GeneratePremiseActionResult =
  | { ok: true; scenePremise: string }
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

function parseScenePremise(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function missionPayloadFromFormData(formData: FormData) {
  return {
    title: formData.get("title"),
    targetPattern: formData.get("targetPattern"),
    topic: formData.get("topic"),
    level: formData.get("level"),
    requiredTurns: formData.get("requiredTurns"),
    turns: parseTurns(formData.get("turns")),
    conversationMode: parseConversationMode(formData.get("conversationMode")),
    scenePremise: parseScenePremise(formData.get("scenePremise")),
  };
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
      ...parsed.data,
      // Explicit for clarity: chat-mode fields persist alongside the rest of
      // the mission payload (conversation_mode/scene_premise on the row).
      conversationMode: parsed.data.conversationMode,
      scenePremise: parsed.data.scenePremise,
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
    const mission = await updateMission({
      ...parsed.data,
      // Explicit for clarity: chat-mode fields persist alongside the rest of
      // the mission payload (conversation_mode/scene_premise on the row).
      conversationMode: parsed.data.conversationMode,
      scenePremise: parsed.data.scenePremise,
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

export async function deleteMissionAction(
  missionId: string,
): Promise<DeleteMissionActionResult> {
  const profile = await requireTeacherProfile();
  const parsed = missionIdSchema.safeParse({ missionId });

  if (!parsed.success) {
    return { ok: false, error: DELETE_FAILURE };
  }

  try {
    await deleteMission({
      teacherId: profile.id,
      missionId: parsed.data.missionId,
    });
    revalidatePath("/teacher/missions");
    return { ok: true };
  } catch {
    return { ok: false, error: DELETE_FAILURE };
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

export async function generatePremiseAction(
  input: unknown,
): Promise<GeneratePremiseActionResult> {
  await requireTeacherProfile();
  const parsed = scenePremiseInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERATE_PREMISE_FAILURE,
    };
  }

  const result = await generateScenePremise(parsed.data);
  if (!result.ok) {
    return { ok: false, error: GENERATE_PREMISE_FAILURE };
  }

  return { ok: true, scenePremise: result.scenePremise };
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
