"use client";

import type { StudentAssignmentListItem } from "@/server/student-access/assignment-list";

const BADGE_LABELS: Record<StudentAssignmentListItem["displayStatus"], string> = { start: "New", continue: "In progress", retry: "Retry", done: "Completed", late: "Late", late_start: "Late" };
const ACTION_LABELS: Partial<Record<StudentAssignmentListItem["displayStatus"], string>> = { start: "Start mission", continue: "Continue mission", retry: "Try again", late: "Continue mission", late_start: "Start mission" };

function actionLabel(item: StudentAssignmentListItem) {
  if (item.assignmentKind === "mission") return ACTION_LABELS[item.displayStatus];
  return {
    start: "Start practice",
    continue: "Continue practice",
    retry: "Try again",
    late: "Continue practice",
    late_start: "Start practice",
    done: "Completed",
  }[item.displayStatus];
}

function assignmentHref(item: StudentAssignmentListItem) {
  return item.assignmentKind === "pronunciation"
    ? `/student/pronunciation/${item.assignmentStudentId}`
    : `/student/missions/${item.assignmentStudentId}`;
}

function dateLabel(value: string | null, prefix: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return prefix === "Due" ? "No deadline" : "Completed";
  return `${prefix} ${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function AssignmentListItem({ item }: { item: StudentAssignmentListItem }) {
  if (item.displayStatus === "done") return <article className="student-mission-card past"><div className="student-mission-top"><div>{item.assignmentKind === "pronunciation" && <small>{item.label}</small>}<h2>{item.title}</h2></div><span className="student-mission-badge done">Completed</span></div><div className="student-mission-past-meta"><span>{dateLabel(item.completedAt, "Completed")}</span><a href={item.assignmentKind === "pronunciation" ? assignmentHref(item) : `/student/history/${item.assignmentStudentId}`}>{item.assignmentKind === "pronunciation" ? "View practice →" : "View what I said →"}</a></div></article>;

  const isLaunchable = item.displayStatus === "start" || item.displayStatus === "continue" || item.displayStatus === "retry" || item.displayStatus === "late" || item.displayStatus === "late_start";
  const noun = item.assignmentKind === "pronunciation" ? "words" : "turns";
  const content = <><div className="student-mission-top"><div>{item.assignmentKind === "pronunciation" && <small>{item.label}</small>}<h2>{item.title}</h2></div><span className={`student-mission-badge ${item.displayStatus}`}>{BADGE_LABELS[item.displayStatus]}</span></div>{item.completedTurnCount > 0 && <div className="student-mission-progress" aria-label={`${item.completedTurnCount} of ${item.turnCount} ${noun} completed`}><span style={{ width: `${Math.min(100, (item.completedTurnCount / item.turnCount) * 100)}%` }}/></div>}<div className="student-mission-meta"><span>{item.completedTurnCount > 0 ? `${item.completedTurnCount} of ${item.turnCount} ${noun} completed` : dateLabel(item.dueAt, "Due")}</span>{item.completedTurnCount > 0 && <span>{dateLabel(item.dueAt, "Due")}</span>}</div>{isLaunchable && <span className="student-mission-action">{actionLabel(item)}</span>}</>;

  return isLaunchable ? <a className="student-mission-card" href={assignmentHref(item)}>{content}</a> : <article className="student-mission-card waiting">{content}</article>;
}
