import type { FoundationSmokeResponse } from "@/domain/foundation/schemas";
import { foundationSmokeResponseSchema } from "@/domain/foundation/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function createFoundationSmokeRecord(): Promise<FoundationSmokeResponse> {
  const supabase = createSupabaseServiceClient();
  const stamp = new Date().toISOString();
  const teacherId = "00000000-0000-4000-8000-000000000101";

  const teacher = await supabase
    .from("teacher_profiles")
    .upsert({
      id: teacherId,
      display_name: "Foundation Smoke Teacher",
    })
    .select("id")
    .single();

  if (teacher.error) {
    throw new Error(`Unable to upsert smoke teacher: ${teacher.error.message}`);
  }

  const classRow = await supabase
    .from("classes")
    .insert({
      teacher_id: teacher.data.id,
      name: `Foundation Demo Class ${stamp}`,
      data_mode: "demo",
    })
    .select("id, name, data_mode")
    .single();

  if (classRow.error) {
    throw new Error(`Unable to create smoke class: ${classRow.error.message}`);
  }

  const student = await supabase
    .from("students")
    .insert({
      class_id: classRow.data.id,
      display_name: "Demo Student",
    })
    .select("id")
    .single();

  if (student.error) {
    throw new Error(`Unable to create smoke student: ${student.error.message}`);
  }

  const mission = await supabase
    .from("missions")
    .insert({
      teacher_id: teacher.data.id,
      title: "Foundation Smoke Mission",
      target_pattern: "I am going to ____.",
      topic: "weekend plans",
      level: "elementary",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id, title, character_id")
    .single();

  if (mission.error) {
    throw new Error(`Unable to create smoke mission: ${mission.error.message}`);
  }

  const template = await supabase
    .from("mission_turn_templates")
    .insert({
      mission_id: mission.data.id,
      turn_order: 1,
      prompt: "What are you going to do this weekend?",
      target_example: "I am going to play soccer.",
      hint_ladder: {
        pattern: "I am going to ____.",
        wordBank: ["play", "visit", "read"],
        example: "I am going to visit my grandma.",
      },
    })
    .select("id")
    .single();

  if (template.error) {
    throw new Error(
      `Unable to create smoke mission turn: ${template.error.message}`,
    );
  }

  const assignment = await supabase
    .from("assignments")
    .insert({
      class_id: classRow.data.id,
      mission_id: mission.data.id,
      title: "Foundation Smoke Assignment",
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      data_mode: classRow.data.data_mode,
      mission_snapshot: {
        missionId: mission.data.id,
        title: mission.data.title,
        characterId: mission.data.character_id,
        requiredTurns: 1,
        turns: [
          {
            order: 1,
            prompt: "What are you going to do this weekend?",
            targetExample: "I am going to play soccer.",
          },
        ],
      },
    })
    .select("id, title, data_mode")
    .single();

  if (assignment.error) {
    throw new Error(
      `Unable to create smoke assignment: ${assignment.error.message}`,
    );
  }

  const assignmentStudent = await supabase
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data.id,
      student_id: student.data.id,
      status: "assigned",
    })
    .select("id, status")
    .single();

  if (assignmentStudent.error) {
    throw new Error(
      `Unable to create smoke assignment student: ${assignmentStudent.error.message}`,
    );
  }

  const event = await supabase.from("assignment_status_events").insert({
    assignment_student_id: assignmentStudent.data.id,
    previous_status: null,
    next_status: "assigned",
    actor_type: "system",
    reason_code: "foundation_smoke_created",
    metadata: { source: "createFoundationSmokeRecord" },
  });

  if (event.error) {
    throw new Error(
      `Unable to create initial status event: ${event.error.message}`,
    );
  }

  return foundationSmokeResponseSchema.parse({
    className: classRow.data.name,
    assignmentTitle: assignment.data.title,
    assignmentStudentStatus: assignmentStudent.data.status,
    dataMode: assignment.data.data_mode,
  });
}
