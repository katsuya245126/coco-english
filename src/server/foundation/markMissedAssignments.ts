import { assertTransitionRequest, shouldMarkMissed } from "@/domain/foundation/status";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type MarkMissedAssignmentsResult = {
  markedCount: number;
  assignmentStudentIds: string[];
};

export async function markMissedAssignments(): Promise<MarkMissedAssignmentsResult> {
  const supabase = createSupabaseServiceClient();
  const now = new Date();

  const rows = await supabase
    .from("assignment_students")
    .select("id, status, assignments!inner(due_at)")
    .in("status", ["assigned", "started"]);

  if (rows.error) {
    throw new Error(`Unable to load overdue assignments: ${rows.error.message}`);
  }

  const candidates = rows.data.filter((row) => {
    const assignment = Array.isArray(row.assignments)
      ? row.assignments[0]
      : row.assignments;

    return shouldMarkMissed({
      status: row.status,
      dueAt: assignment?.due_at ?? null,
      now,
    });
  });

  for (const row of candidates) {
    assertTransitionRequest({
      previousStatus: row.status,
      nextStatus: "missed",
      actorType: "job",
      reasonCode: "due_date_elapsed",
      occurredAt: now.toISOString(),
    });

    const update = await supabase
      .from("assignment_students")
      .update({ status: "missed" })
      .eq("id", row.id);

    if (update.error) {
      throw new Error(
        `Unable to mark assignment student ${row.id} missed: ${update.error.message}`,
      );
    }

    const event = await supabase.from("assignment_status_events").insert({
      assignment_student_id: row.id,
      previous_status: row.status,
      next_status: "missed",
      actor_type: "job",
      reason_code: "due_date_elapsed",
      metadata: { job: "markMissedAssignments", evaluatedAt: now.toISOString() },
    });

    if (event.error) {
      throw new Error(
        `Unable to audit missed assignment student ${row.id}: ${event.error.message}`,
      );
    }
  }

  return {
    markedCount: candidates.length,
    assignmentStudentIds: candidates.map((row) => row.id),
  };
}
