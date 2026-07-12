"use client";

import { useRouter } from "next/navigation";
import { clearStudentUnlockAction } from "@/app/join/actions";
import { AssignmentListItem } from "@/components/student/AssignmentListItem";
import type { StudentAssignmentPage } from "@/server/student-access/assignment-list";

export function StudentHomeShell({ className, displayName, assignmentPage, currentCount }: { className: string; displayName: string; assignmentPage: StudentAssignmentPage; currentCount: number }) {
  const router = useRouter();
  const pageHref = (page: number) => `/student/home?tab=${assignmentPage.tab}&page=${page}`;

  async function handleSwitchClass() {
    await clearStudentUnlockAction();
    router.push("/join");
  }

  return <div className="student-home-shell">
    <header className="student-home-header">
      <div className="student-home-greeting"><div><h1>Hi, {displayName}! <span aria-hidden="true">👋</span></h1><p>{className}</p></div><div aria-hidden="true" className="student-home-avatar">🥥</div></div>
      <nav aria-label="Mission lists" className="student-home-tabs">
        <a aria-current={assignmentPage.tab === "current" ? "page" : undefined} href="/student/home?tab=current&page=1">Current · {currentCount}</a>
        <a aria-current={assignmentPage.tab === "past" ? "page" : undefined} href="/student/home?tab=past&page=1">Past missions</a>
      </nav>
    </header>

    <section aria-live="polite" className="student-home-list">
      <div className="student-home-section-title"><strong>{assignmentPage.tab === "current" ? "Your missions" : "Completed missions"}</strong><span>{assignmentPage.tab === "current" ? "Due soon first" : "Newest first"}</span></div>
      {assignmentPage.items.length > 0 ? assignmentPage.items.map((item) => <AssignmentListItem item={item} key={item.assignmentStudentId}/>) : <div className="student-home-empty"><div aria-hidden="true">{assignmentPage.tab === "past" ? "🗂️" : "🌱"}</div><h2>{assignmentPage.tab === "past" ? "No past missions yet" : "No homework yet"}</h2><p>{assignmentPage.tab === "past" ? "Completed speaking missions will show up here." : "Your teacher has not assigned speaking homework yet."}</p></div>}

      {assignmentPage.totalPages > 1 && <nav aria-label="Mission pages" className="student-home-pager">
        {assignmentPage.page > 1 ? <a aria-label="Previous page" href={pageHref(assignmentPage.page - 1)}>‹</a> : <span aria-disabled="true">‹</span>}
        {Array.from({ length: assignmentPage.totalPages }, (_, index) => index + 1).map((page) => <a aria-current={page === assignmentPage.page ? "page" : undefined} href={pageHref(page)} key={page}>{page}</a>)}
        {assignmentPage.page < assignmentPage.totalPages ? <a aria-label="Next page" href={pageHref(assignmentPage.page + 1)}>›</a> : <span aria-disabled="true">›</span>}
      </nav>}
      <p className="student-home-page-hint">Up to 5 missions per page</p>
      <button className="student-switch-class" onClick={handleSwitchClass} type="button">Switch class</button>
    </section>
  </div>;
}
