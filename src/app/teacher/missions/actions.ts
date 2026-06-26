"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { missionFormSchema, missionIdSchema } from "@/domain/mission/schemas";
import {
  createMission,
  updateMission,
} from "@/server/mission/mission-service";

const GENERIC_FAILURE =
  "We could not save the mission. Check the highlighted fields and try again.";

export type MissionActionResult =
  | { ok: true; missionId: string }
  | { ok: false; error: string };

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

function missionPayloadFromFormData(formData: FormData) {
  return {
    title: formData.get("title"),
    targetPattern: formData.get("targetPattern"),
    topic: formData.get("topic"),
    level: formData.get("level"),
    requiredTurns: formData.get("requiredTurns"),
    turns: parseTurns(formData.get("turns")),
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
