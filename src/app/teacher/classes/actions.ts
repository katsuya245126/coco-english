"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClassSchema } from "@/domain/classroom/schemas";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createClass } from "@/server/classroom/class-service";

const GENERIC_FAILURE =
  "We could not complete that action. Check the details and try again.";

// name echoes the submitted value so the form can refill it after React's
// automatic form reset.
export type CreateClassActionState = { error: string | null; name: string };

export async function createClassAction(
  _previousState: CreateClassActionState,
  formData: FormData,
): Promise<CreateClassActionState> {
  const profile = await requireTeacherProfile();
  const name = String(formData.get("name") ?? "");
  const parsed = createClassSchema.safeParse({ name });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE,
      name,
    };
  }

  let createdClass: { id: string };
  try {
    createdClass = await createClass({
      teacherId: profile.id,
      name: parsed.data.name,
    });
  } catch {
    return { error: GENERIC_FAILURE, name };
  }

  revalidatePath("/teacher");
  redirect(`/teacher/classes/${createdClass.id}/manage`);
}
