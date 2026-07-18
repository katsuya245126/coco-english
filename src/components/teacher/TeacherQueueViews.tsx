"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reopenSubmissionReviewAction } from "@/app/teacher/assignment-actions";
import { buildTeacherReviewPageHref } from "@/domain/teacher/review-pagination";
import type { IncompleteAssignmentGroup, TeacherActivityRow, TeacherReviewRow } from "@/server/teacher/assignment-operations";

const relativeTime = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr`;
  return new Date(value).toLocaleDateString();
};

function Filters({ classes, extra, scoped }: { classes?: string[]; extra?: string[]; scoped?: boolean }) {
  return <nav className="filters" aria-label="Queue filters">{!scoped && <Link href="?">All classes</Link>}{!scoped && classes?.map((name) => <Link key={name} href={`?class=${encodeURIComponent(name)}`}>{name}</Link>)}{extra?.map((name) => <Link key={name} href={`?filter=${name.toLowerCase()}`}>{name}</Link>)}</nav>;
}

// `scoped` renders the table for a single class workspace: no cross-class copy,
// no Class column, and only the Unread/Flagged filters (the class is already
// fixed by the surrounding page, so All-classes / per-class filters make no
// sense here). The default (unscoped) form is the global /teacher inbox.
export function TeacherReviewTable({ rows, classes, page = 1, totalPages = 1, query = {}, scoped = false }: { rows: TeacherReviewRow[]; classes: string[]; page?: number; totalPages?: number; query?: { className?: string; filter?: string }; scoped?: boolean }) {
  return <section><div className="heading"><h1>Needs review</h1><p>{scoped ? "Submissions for this class that need your review, newest first." : "Submissions from all your classes, newest first."}</p></div><Filters classes={classes} extra={["Unread", "Flagged"]} scoped={scoped}/><div className={scoped ? "review-head scoped" : "review-head"}><span>Student</span>{!scoped && <span>Class</span>}<span>Submission</span><span>Status</span><span>Received</span></div><div className="queue">
    {rows.map((row) => <Link className={row.firstViewedAt === null ? "review-row unread" : "review-row"} data-scoped={scoped ? "true" : "false"} href={`/teacher/evidence/${row.attemptId}`} key={row.attemptId}><strong>{row.studentName}</strong>{!scoped && <span><i>{row.className}</i></span>}<span><b>{row.assignmentTitle}</b><small>{row.needsReviewReason ? "Flagged for teacher review" : "Conversation recap available"}</small></span><span><em>{row.needsReviewReason ? "Flagged" : "Completed"}</em></span><time>{relativeTime(row.receivedAt)}</time></Link>)}
    {rows.length === 0 && <p className="empty">Nothing needs review right now.</p>}
  </div>{totalPages > 1 && <nav className="pagination" aria-label="Needs review pages">
    {page > 1 ? <Link href={buildTeacherReviewPageHref(page - 1, query)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
    <strong>Page {page} of {totalPages}</strong>
    {page < totalPages ? <Link href={buildTeacherReviewPageHref(page + 1, query)}>Next</Link> : <span aria-disabled="true">Next</span>}
  </nav>}</section>;
}

function IncompleteSection({ title, subtitle, groups }: { title: "Missed" | "Due soon"; subtitle: string; groups: IncompleteAssignmentGroup[] }) {
  return <section className="incomplete-group"><h2>{title} <small>{subtitle}</small></h2>{groups.map((group) => <div className="assignment" key={`${group.urgency}:${group.assignmentId}`}><header><strong>{group.assignmentTitle}</strong><span>{group.items[0]?.className}</span></header>{group.items.map((item) => <Link key={item.id} href={`/teacher/classes/${item.classId}/review/${item.assignmentId}?student=${item.id}`}><strong>{item.studentName}</strong><span className={`progress ${item.progress}`}>{item.progress === "started" ? "Started" : "Not started"}</span><span>View assignment →</span></Link>)}</div>)}</section>;
}

export function TeacherIncompleteGroups({ groups, classes }: { groups: IncompleteAssignmentGroup[]; classes: string[] }) {
  const missed = groups.filter((group) => group.urgency === "missed"); const soon = groups.filter((group) => group.urgency === "due_soon"); const later = groups.filter((group) => group.urgency === "later");
  return <section><div className="heading"><h1>Incomplete</h1><p>Students who have not submitted, ordered by urgency.</p></div><Filters classes={classes}/><IncompleteSection title="Missed" subtitle="Past due" groups={missed}/><IncompleteSection title="Due soon" subtitle="Within 3 days" groups={soon}/><details><summary>Later <small>Assigned work not due within 3 days</small></summary><div className="later"><IncompleteSection title="Due soon" subtitle="Later work" groups={later}/></div></details></section>;
}

export function ActivityOverflowMenu({ attemptId }: { attemptId: string }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <details className="overflow"><summary aria-label="Submission actions">•••</summary><button disabled={pending} type="button" onClick={() => startTransition(async () => { const result = await reopenSubmissionReviewAction(attemptId); if (result.ok) router.refresh(); })}>Move back to Needs review</button></details>;
}

export function ReviewUndoToast({ attemptId }: { attemptId?: string }) {
  const router = useRouter(); const [visible, setVisible] = useState(Boolean(attemptId)); const [pending, startTransition] = useTransition();
  if (!attemptId || !visible) return null;
  return <div className="undo" role="status">Submission marked reviewed <button disabled={pending} onClick={() => startTransition(async () => { const result = await reopenSubmissionReviewAction(attemptId); if (result.ok) { setVisible(false); router.refresh(); } })}>Undo</button></div>;
}

export function TeacherActivityTable({ rows, classes, reviewedAttemptId }: { rows: TeacherActivityRow[]; classes: string[]; reviewedAttemptId?: string }) {
  return <section><div className="heading"><h1>All activity</h1><p>Submission and review history across every class.</p></div><Filters classes={classes} extra={["Reviewed", "Retries"]}/><div className="activity-head"><span>Student</span><span>Submission</span><span>Status</span><span>Updated</span><span></span></div><div className="queue">{rows.map((row) => <div className="activity-row" key={row.attemptId}><Link href={`/teacher/evidence/${row.attemptId}`}><strong>{row.studentName}</strong></Link><span><b>{row.assignmentTitle}</b><small>{row.className}</small></span><em>{row.reviewedAt ? "Reviewed" : row.status.replaceAll("_", " ")}</em><time>{relativeTime(row.reviewedAt ?? row.receivedAt)}</time>{row.reviewedAt && <ActivityOverflowMenu attemptId={row.attemptId}/>}</div>)}{rows.length === 0 && <p className="empty">No submission history yet.</p>}</div><ReviewUndoToast attemptId={reviewedAttemptId}/></section>;
}

