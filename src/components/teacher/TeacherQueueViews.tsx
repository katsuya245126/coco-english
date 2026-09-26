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

const tileHref = (filter: string | undefined, className?: string) => {
  const params = new URLSearchParams();
  if (className) params.set("class", className);
  if (filter) params.set("filter", filter);
  return params.size ? `?${params}` : "?";
};

// Same student, same pastel on every row.
const avatarTone = (name: string) => [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;

type ReviewCounts = { total: number; unread: number; flagged: number };

// `scoped` renders the table for a single class workspace: no cross-class copy,
// no class chips or Incomplete tile (the class is already fixed by the
// surrounding page). The default (unscoped) form is the global /teacher inbox.
export function TeacherReviewTable({ rows, classes, page = 1, totalPages = 1, query = {}, counts, incomplete, newestHref, scoped = false }: { rows: TeacherReviewRow[]; classes: string[]; page?: number; totalPages?: number; query?: { className?: string; filter?: string }; counts: ReviewCounts; incomplete?: { count: number; missed: number }; newestHref?: string; scoped?: boolean }) {
  const Heading = scoped ? "h2" : "h1";
  const active = query.filter === "unread" || query.filter === "flagged" ? query.filter : undefined;
  const tiles = [
    { label: "Needs review", count: counts.total, filter: undefined },
    { label: "Not opened yet", count: counts.unread, filter: "unread" },
    { label: "Flagged by Coco", count: counts.flagged, filter: "flagged" },
  ];
  return <section className="review-queue">
    <div className="heading"><div><Heading>Needs review</Heading><p>{scoped ? "Submissions for this class, newest first." : `${counts.total} ${counts.total === 1 ? "submission" : "submissions"} across your classes. ${counts.unread} not opened yet.`}</p></div>
      {!scoped && newestHref && <Link className="primary-button" href={newestHref}>Open newest <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></Link>}
    </div>
    <nav className={scoped ? "review-tiles scoped" : "review-tiles"} aria-label="Review filters">
      {tiles.map((tile) => <Link key={tile.label} className={active === tile.filter ? "tile active" : "tile"} aria-current={active === tile.filter ? "true" : undefined} href={tileHref(tile.filter, query.className)}><span>{tile.label}</span><b>{tile.count}</b></Link>)}
      {!scoped && incomplete && <Link className="tile" href="/teacher/incomplete"><span>Incomplete{incomplete.missed > 0 && ` · ${incomplete.missed} missed`}</span><b>{incomplete.count}</b></Link>}
    </nav>
    <div className="review-card">
      {!scoped && classes.length > 1 && <nav className="class-chips" aria-label="Class filter">
        <Link className={query.className ? "chip" : "chip active"} aria-current={query.className ? undefined : "true"} href={tileHref(active)}>All classes</Link>
        {classes.map((name) => <Link key={name} className={query.className === name ? "chip active" : "chip"} aria-current={query.className === name ? "true" : undefined} href={tileHref(active, name)}>{name}</Link>)}
      </nav>}
      <div className="review-head" aria-hidden="true"><span/><span>Student</span><span>Submission</span><span>Status</span><span>Received</span><span/></div>
      <div className="queue">
        {rows.map((row) => <Link className={row.firstViewedAt === null ? "review-row unread" : "review-row"} href={`/teacher/evidence/${row.attemptId}`} key={row.attemptId}>
          <span className={`avatar tone-${avatarTone(row.studentName)}`} aria-hidden="true">{row.studentName.trim().charAt(0).toUpperCase()}</span>
          <span className="who"><strong>{row.firstViewedAt === null && <span className="new-dot"><span className="sr-only">New: </span></span>}<span>{row.studentName}</span></strong>{!scoped && <small>{row.className}</small>}</span>
          <span className="what"><b>{row.assignmentTitle}</b><small>{row.resultSummary ?? (row.needsReviewReason ? "Flagged for teacher review" : "Conversation recap available")}</small></span>
          <span><em className={row.needsReviewReason ? "tag flag" : "tag done"}>{row.needsReviewReason ? "Flagged" : "Completed"}</em></span>
          <time>{relativeTime(row.receivedAt)}</time>
          <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </Link>)}
        {rows.length === 0 && <p className="empty">Nothing needs review right now.</p>}
      </div>
      {totalPages > 1 && <nav className="pagination" aria-label="Needs review pages">
        {page > 1 ? <Link href={buildTeacherReviewPageHref(page - 1, query)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
        <strong>Page {page} of {totalPages}</strong>
        {page < totalPages ? <Link href={buildTeacherReviewPageHref(page + 1, query)}>Next</Link> : <span aria-disabled="true">Next</span>}
      </nav>}
    </div>
  </section>;
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
