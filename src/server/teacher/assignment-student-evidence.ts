import { missionSnapshotSchema } from "@/domain/mission/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceClient>;

type RawValue = string | number | boolean | null | RawRow | RawRow[];
interface RawRow { [key: string]: RawValue | undefined }

function one(value: RawValue | undefined): RawRow {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? item as RawRow : {};
}

export type AssignmentStudentMissionTurn = {
  turnOrder: number;
  prompt: string;
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
  targetPattern: string | null;
  topic: string | null;
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

  const row = result.data as unknown as RawRow;
  if (row.latest_attempt_id !== null) return null;

  const assignment = one(row.assignments);
  const klass = one(assignment.classes);
  const snapshot = missionSnapshotSchema.safeParse(assignment.mission_snapshot);
  const status = String(row.status);

  return {
    assignmentStudentId: String(row.id),
    studentName: String(one(row.students).display_name),
    missionTitle: snapshot.success ? snapshot.data.title : String(assignment.title),
    status,
    statusLabel: "Not started",
    submittedLabel: row.submitted_at === null ? "Not yet submitted" : String(row.submitted_at),
    attemptCount: 0,
    highestHintLabel: "No hints used",
    classId: String(klass.id),
    className: String(klass.name),
    assignmentId: String(assignment.id),
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    targetPattern: snapshot.success ? snapshot.data.targetPattern : null,
    topic: snapshot.success ? snapshot.data.topic : null,
    turns: snapshot.success
      ? snapshot.data.turns.map((turn) => ({
          turnOrder: turn.turnOrder,
          prompt: turn.prompt,
          targetExample: turn.targetExample,
        }))
      : [],
  };
}
