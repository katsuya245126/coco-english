export type MarkMissedAssignmentsResult = {
  markedCount: number;
  assignmentStudentIds: string[];
};

export async function markMissedAssignments(): Promise<MarkMissedAssignmentsResult> {
  throw new Error("Not implemented");
}
