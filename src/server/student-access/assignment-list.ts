import { z } from "zod";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
import { pronunciationPracticeSnapshotSchema } from "@/domain/pronunciation/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type AssignmentDisplayStatus =
  | "start"
  | "continue"
  | "retry"
  | "done"
  // Two overdue variants: 'late' is work the student has already begun,
  // 'late_start' is overdue work never opened. Both badge as "Late"; they
  // differ only in the call to action ("Continue" vs "Start"), which
  // previously collapsed into a misleading "Continue mission".
  | "late"
  | "late_start";

// Both terminal statuses present identically to students — teacher_review
// is an internal-only distinction surfaced solely on teacher-facing
// surfaces (evidence queue, review reason, transcript-first presentation).
const STUDENT_COMPLETED_STATUSES = new Set(["completed", "teacher_review"]);

export type StudentAssignmentTab = "current" | "past";

export type StudentAssignmentListItem = {
  assignmentStudentId: string;
  assignmentKind: "mission" | "pronunciation";
  label: "Mission" | "Pronunciation";
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

const assignmentRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  submitted_at: z.string().nullable(),
  latest_attempt_id: z.string().nullable(),
  assignments: z.object({
    title: z.string(),
    assignment_kind: z.enum(["mission", "pronunciation"]).optional(),
    mission_snapshot: z.unknown(),
    due_at: z.string().nullable(),
    canceled_at: z.string().nullable(),
  }),
  latest_attempt: z
    .object({
      completed_at: z.string().nullable(),
      attempt_turns: z
        .array(
          z.object({
            count: z.number().optional(),
            id: z.string().optional(),
            turn_order: z.number().optional(),
            pronunciation_word_tries: z
              .array(z.object({ try_number: z.number(), outcome: z.string() }))
              .optional(),
          }),
        )
        .optional(),
    })
    .nullable(),
});

type AssignmentRow = z.infer<typeof assignmentRowSchema>;

function completedPronunciationWords(
  attempt: AssignmentRow["latest_attempt"],
): number {
  return (attempt?.attempt_turns ?? []).filter((turn) =>
    (turn.pronunciation_word_tries ?? []).some(
      (tryRow) => tryRow.outcome === "passed" || tryRow.try_number === 3,
    ),
  ).length;
}

function completedMissionTurns(attempt: AssignmentRow["latest_attempt"]): number {
  const turns = attempt?.attempt_turns ?? [];
  return turns[0]?.count ?? turns.length;
}

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
      assignments!inner (title, assignment_kind, mission_snapshot, due_at, canceled_at),
      latest_attempt:attempts!assignment_students_latest_attempt_fk (
        completed_at,
        attempt_turns(id, turn_order, pronunciation_word_tries(try_number, outcome))
      )
    `)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const now = Date.now();
  const items: StudentAssignmentListItem[] = [];

  if (!error && data) {
    for (const raw of data) {
      const parsed = assignmentRowSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(
          "listStudentAssignmentPage: dropping row with unexpected shape",
          parsed.error,
        );
        continue;
      }
      const row = parsed.data;
      if (row.assignments.canceled_at) continue;
      const assignmentKind = row.assignments.assignment_kind === "pronunciation"
        ? "pronunciation"
        : "mission";
      let turnCount: number;
      let targetPattern = "";
      if (assignmentKind === "pronunciation") {
        const snapshot = pronunciationPracticeSnapshotSchema.safeParse(
          row.assignments.mission_snapshot,
        );
        if (!snapshot.success) continue;
        turnCount = snapshot.data.requiredWords;
      } else {
        const snapshotResult = interpretMissionSnapshot(row.assignments.mission_snapshot);
        if (snapshotResult.kind === "invalid") continue;
        if (input.tab === "current" && snapshotResult.kind !== "complete") continue;
        turnCount = snapshotResult.snapshot.requiredTurns;
        if (snapshotResult.kind === "complete") {
          targetPattern =
            snapshotResult.snapshot.targetPattern ??
            snapshotResult.snapshot.turns[0]?.targetPattern ??
            "";
        }
      }
      const completedAt = row.latest_attempt?.completed_at ?? row.submitted_at;
      const isStudentCompleted = STUDENT_COMPLETED_STATUSES.has(row.status);
      if (input.tab === "past" && !isStudentCompleted) continue;
      if (input.tab === "current" && isStudentCompleted) continue;

      const due = timestamp(row.assignments.due_at);
      let displayStatus: AssignmentDisplayStatus;
      if (isStudentCompleted) displayStatus = "done";
      else if (row.status === "needs_retry") displayStatus = "retry";
      else if (row.status === "started") displayStatus = due !== null && due < now ? "late" : "continue";
      else displayStatus = due !== null && due < now ? "late_start" : "start";

      items.push({
        assignmentStudentId: row.id,
        assignmentKind,
        label: assignmentKind === "pronunciation" ? "Pronunciation" : "Mission",
        title: row.assignments.title,
        dueAt: row.assignments.due_at,
        completedAt,
        turnCount,
        completedTurnCount: assignmentKind === "pronunciation"
          ? completedPronunciationWords(row.latest_attempt)
          : completedMissionTurns(row.latest_attempt),
        targetPattern,
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
