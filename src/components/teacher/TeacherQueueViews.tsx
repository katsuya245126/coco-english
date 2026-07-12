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
  </nav>}<QueueStyles/></section>;
}

function IncompleteSection({ title, subtitle, groups }: { title: "Missed" | "Due soon"; subtitle: string; groups: IncompleteAssignmentGroup[] }) {
  return <section className="incomplete-group"><h2>{title} <small>{subtitle}</small></h2>{groups.map((group) => <div className="assignment" key={`${group.urgency}:${group.assignmentId}`}><header><strong>{group.assignmentTitle}</strong><span>{group.items[0]?.className}</span></header>{group.items.map((item) => <Link key={item.id} href={`/teacher/classes/${item.classId}/review/${item.assignmentId}?student=${item.id}`}><strong>{item.studentName}</strong><span className={`progress ${item.progress}`}>{item.progress === "started" ? "Started" : "Not started"}</span><span>View assignment →</span></Link>)}</div>)}</section>;
}

export function TeacherIncompleteGroups({ groups, classes }: { groups: IncompleteAssignmentGroup[]; classes: string[] }) {
  const missed = groups.filter((group) => group.urgency === "missed"); const soon = groups.filter((group) => group.urgency === "due_soon"); const later = groups.filter((group) => group.urgency === "later");
  return <section><div className="heading"><h1>Incomplete</h1><p>Students who have not submitted, ordered by urgency.</p></div><Filters classes={classes}/><IncompleteSection title="Missed" subtitle="Past due" groups={missed}/><IncompleteSection title="Due soon" subtitle="Within 24 hours" groups={soon}/><details><summary>Later <small>Assigned work not due within 24 hours</small></summary><div className="later"><IncompleteSection title="Due soon" subtitle="Later work" groups={later}/></div></details><QueueStyles/></section>;
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
  return <section><div className="heading"><h1>All activity</h1><p>Submission and review history across every class.</p></div><Filters classes={classes} extra={["Reviewed", "Retries"]}/><div className="activity-head"><span>Student</span><span>Submission</span><span>Status</span><span>Updated</span><span></span></div><div className="queue">{rows.map((row) => <div className="activity-row" key={row.attemptId}><Link href={`/teacher/evidence/${row.attemptId}`}><strong>{row.studentName}</strong></Link><span><b>{row.assignmentTitle}</b><small>{row.className}</small></span><em>{row.reviewedAt ? "Reviewed" : row.status.replaceAll("_", " ")}</em><time>{relativeTime(row.reviewedAt ?? row.receivedAt)}</time>{row.reviewedAt && <ActivityOverflowMenu attemptId={row.attemptId}/>}</div>)}{rows.length === 0 && <p className="empty">No submission history yet.</p>}</div><ReviewUndoToast attemptId={reviewedAttemptId}/><QueueStyles/></section>;
}

function QueueStyles() { return <style jsx global>{`.heading h1{font-size:25px;margin:0}.heading p{margin:5px 0 20px;color:#64748b;font-size:13px}.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.filters a{border:1px solid #cbd5e1;border-radius:999px;padding:6px 10px;color:#475569;text-decoration:none;font-size:11px}.review-head,.review-row,.activity-head,.activity-row{display:grid;align-items:center;gap:12px}.review-head,.review-row{grid-template-columns:minmax(110px,.7fr) minmax(100px,.5fr) minmax(190px,1.3fr) 90px 72px}.review-head.scoped,.review-row[data-scoped="true"]{grid-template-columns:minmax(110px,.7fr) minmax(190px,1.3fr) 90px 72px}.activity-head,.activity-row{grid-template-columns:minmax(110px,.7fr) minmax(180px,1.3fr) 100px 80px 40px}.review-head,.activity-head{padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:10px;text-transform:uppercase}.review-row,.activity-row{padding:14px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-decoration:none;font-size:13px}.review-row.unread{background:#eff6ff;box-shadow:inset 3px 0 #2563eb;color:#0f172a}.review-row i{display:inline-block;background:#f1f5f9;border-radius:5px;padding:4px 6px;font-style:normal;font-size:10px}.review-row small,.activity-row small{display:block;margin-top:3px;color:#64748b;font-weight:400}.review-row em,.activity-row em,.progress{justify-self:start;border-radius:999px;padding:4px 8px;background:#dcfce7;color:#166534;font-style:normal;font-size:10px;font-weight:700}.review-row time,.activity-row time{text-align:right;color:#64748b;font-size:11px}.activity-row>a{color:#0f172a;text-decoration:none}.overflow{position:relative}.overflow summary{cursor:pointer;list-style:none}.overflow button{position:absolute;right:0;z-index:2;width:190px;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155}.incomplete-group{margin:22px 0}.incomplete-group h2{font-size:14px}.incomplete-group h2 small{float:right;color:#64748b;font-weight:400}.assignment{margin:8px 0;border:1px solid #e2e8f0;border-radius:9px;overflow:hidden}.assignment header{display:flex;justify-content:space-between;padding:12px 14px;background:#f8fafc;font-size:13px}.assignment header span{color:#64748b}.assignment>a{display:grid;grid-template-columns:1fr 110px 120px;padding:11px 14px;border-top:1px solid #edf0f3;color:#334155;text-decoration:none;font-size:12px}.assignment>a>span:last-child{text-align:right;color:#2563eb;font-weight:700}.progress{background:#fef3c7;color:#92400e}details>summary{cursor:pointer;padding:14px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc;font-weight:700}details>summary small{float:right;color:#64748b;font-weight:400}.later .incomplete-group>h2{display:none}.empty{padding:30px;color:#64748b;text-align:center}.undo{position:fixed;right:20px;bottom:20px;padding:12px 14px;border-radius:8px;background:#172554;color:#fff}.undo button{margin-left:16px;border:0;background:none;color:#93c5fd;font-weight:700}@media(max-width:800px){.review-head,.activity-head{display:none}.review-row{grid-template-columns:1fr 80px}.review-row[data-scoped="false"]>span:nth-child(2),.review-row[data-scoped="false"]>span:nth-child(3){grid-column:1/3}.review-row[data-scoped="false"]>span:nth-child(4){grid-column:1}.review-row[data-scoped="true"]>span:nth-child(2){grid-column:1/3}.review-row[data-scoped="true"]>span:nth-child(3){grid-column:1}.review-row time{grid-column:2;grid-row:1}.activity-row{grid-template-columns:1fr 80px 35px}.activity-row>span:nth-child(2){grid-column:1/4}.assignment>a{grid-template-columns:1fr auto}.assignment>a>span:last-child{grid-column:2;grid-row:1}}`}</style>; }
