import { missionSnapshotSchema } from "@/domain/mission/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type AssignmentDisplayStatus =
  | "start"
  | "continue"
  | "retry"
  | "done"
  | "late"
  | "review";

export type StudentAssignmentTab = "current" | "past";

export type StudentAssignmentListItem = {
  assignmentStudentId: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  turnCount: number;
  completedTurnCount: number;
  targetPattern: string;
  displayStatus: AssignmentDisplayStatus;
};

export type StudentAssignmentPage = {
  tab: StudentAssignmentTab;
  items: StudentAssignmentListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AssignmentRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  latest_attempt_id: string | null;
  assignments: {
    title: string;
    mission_snapshot: unknown;
    due_at: string | null;
    canceled_at: string | null;
  };
  latest_attempt: { completed_at: string | null; turns?: Array<{ count: number }> } | null;
};

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currentPriority(item: StudentAssignmentListItem, now: number): number {
  if (item.displayStatus === "retry") return 0;
  const due = timestamp(item.dueAt);
  return due !== null && due >= now && due <= now + 24 * 60 * 60 * 1000 ? 1 : 2;
}

export async function listStudentAssignmentPage(
  studentId: string,
  input: { tab: StudentAssignmentTab; page: number; pageSize?: number },
): Promise<StudentAssignmentPage> {
  const pageSize = Math.max(1, Math.floor(input.pageSize ?? 5));
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("assignment_students")
    .select(`
      id, status, submitted_at, latest_attempt_id,
      assignments!inner (title, mission_snapshot, due_at, canceled_at),
      latest_attempt:attempts!assignment_students_latest_attempt_fk (completed_at, turns(count))
    `)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const now = Date.now();
  const items: StudentAssignmentListItem[] = [];

  if (!error && data) {
    for (const raw of data) {
      const row = raw as unknown as AssignmentRow;
      if (row.assignments.canceled_at) continue;
      const snapshot = missionSnapshotSchema.safeParse(row.assignments.mission_snapshot);
      if (!snapshot.success) continue;
      const completedAt = row.latest_attempt?.completed_at ?? row.submitted_at;
      if (input.tab === "past" && row.status !== "completed") continue;
      if (input.tab === "current" && row.status === "completed") continue;

      const due = timestamp(row.assignments.due_at);
      let displayStatus: AssignmentDisplayStatus;
      if (row.status === "completed") displayStatus = "done";
      else if (row.status === "needs_retry") displayStatus = "retry";
      else if (row.status === "teacher_review") displayStatus = "review";
      else if (row.status === "started") displayStatus = due !== null && due < now ? "late" : "continue";
      else displayStatus = due !== null && due < now ? "late" : "start";

      items.push({
        assignmentStudentId: row.id,
        title: row.assignments.title,
        dueAt: row.assignments.due_at,
        completedAt,
        turnCount: snapshot.data.requiredTurns,
        completedTurnCount: row.latest_attempt?.turns?.[0]?.count ?? 0,
        targetPattern: snapshot.data.targetPattern,
        displayStatus,
      });
    }
  }

  items.sort((a, b) => {
    if (input.tab === "past") {
      const timeDifference = (timestamp(b.completedAt) ?? Number.NEGATIVE_INFINITY) -
        (timestamp(a.completedAt) ?? Number.NEGATIVE_INFINITY);
      return timeDifference || a.assignmentStudentId.localeCompare(b.assignmentStudentId);
    }
    const priorityDifference = currentPriority(a, now) - currentPriority(b, now);
    const dueDifference = (timestamp(a.dueAt) ?? Number.POSITIVE_INFINITY) -
      (timestamp(b.dueAt) ?? Number.POSITIVE_INFINITY);
    return priorityDifference || dueDifference || a.assignmentStudentId.localeCompare(b.assignmentStudentId);
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(input.page) || 1));
  return { tab: input.tab, items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages };
}

export async function listStudentAssignments(studentId: string): Promise<StudentAssignmentListItem[]> {
  return (await listStudentAssignmentPage(studentId, { tab: "current", page: 1, pageSize: Number.MAX_SAFE_INTEGER })).items;
}
