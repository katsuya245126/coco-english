import { z } from "zod";
import {
  interpretMissionSnapshot,
  resolveMissionSnapshotTargetPattern,
} from "@/domain/mission/mission-snapshot";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceClient>;

// Supabase nested joins come back as an object or a one-element array
// depending on the relationship; accept both and take the first.
const nested = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.array(schema)]).transform(
    (value): z.infer<T> | undefined =>
      Array.isArray(value) ? value[0] : value,
  );

const rawRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  submitted_at: z.string().nullable(),
  latest_attempt_id: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  students: nested(z.object({ display_name: z.string() })),
  assignments: nested(
    z.object({
      id: z.string(),
      title: z.string(),
      mission_snapshot: z.unknown(),
      classes: nested(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});

export type AssignmentStudentMissionTurn = {
  turnOrder: number;
  prompt: string;
  targetPattern: string | null;
  targetExample: string;
};

export type AssignmentStudentEvidence = {
  assignmentStudentId: string;
  studentName: string;
  missionTitle: string;
  status: string;
  statusLabel: string;
  submittedLabel: string;
  attemptCount: 0;
  highestHintLabel: "No hints used";
  classId: string;
  className: string;
  assignmentId: string;
  dismissedAt: string | null;
  // Mission content the student was assigned but never opened. Without an
  // attempt there is no evidence to show, so the page shows the work itself
  // rather than a grid of empty stats.
  turns: AssignmentStudentMissionTurn[];
};

export async function getAssignmentStudentEvidenceForTeacher(
  input: { teacherId: string; assignmentStudentId: string },
  client: Client = createSupabaseServiceClient(),
): Promise<AssignmentStudentEvidence | null> {
  const result = await client
    .from("assignment_students")
    .select(`
      id, status, submitted_at, latest_attempt_id, dismissed_at,
      students!inner(display_name),
      assignments!inner(id, title, mission_snapshot, classes!inner(id, name, teacher_id))
    `)
    .eq("id", input.assignmentStudentId)
    .eq("assignments.classes.teacher_id", input.teacherId)
    .maybeSingle();

  if (result.error) throw new Error(`Unable to load assignment student evidence: ${result.error.message}`);
  if (!result.data) return null;

  const parsed = rawRowSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error(
      "Unable to load assignment student evidence: unexpected row shape",
    );
  }
  const row = parsed.data;
  if (row.latest_attempt_id !== null) return null;

  const assignment = row.assignments;
  const student = row.students;
  const klass = assignment?.classes;
  // The !inner joins guarantee these rows exist; a miss is a malformed result.
  if (!assignment || !student || !klass) {
    throw new Error(
      "Unable to load assignment student evidence: missing joined rows",
    );
  }
  const snapshotResult = interpretMissionSnapshot(assignment.mission_snapshot);
  const snapshot =
    snapshotResult.kind === "invalid" ? null : snapshotResult.snapshot;

  return {
    assignmentStudentId: row.id,
    studentName: student.display_name,
    missionTitle: snapshot?.title ?? assignment.title,
    status: row.status,
    statusLabel: "Not started",
    submittedLabel: row.submitted_at ?? "Not yet submitted",
    attemptCount: 0,
    highestHintLabel: "No hints used",
    classId: klass.id,
    className: klass.name,
    assignmentId: assignment.id,
    dismissedAt: row.dismissed_at,
    turns: snapshot
      ? snapshot.turns.map((turn) => ({
          turnOrder: turn.turnOrder,
          prompt: turn.prompt,
          targetPattern:
            snapshotResult.kind === "complete" &&
            !snapshotResult.snapshot.conversationMode
              ? resolveMissionSnapshotTargetPattern(
                  snapshotResult.snapshot,
                  turn.turnOrder,
                )
              : null,
          targetExample: turn.targetExample,
        }))
      : [],
  };
}
