"use client";

import Image from "next/image";
import Link from "next/link";
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
      <div className="student-home-greeting">
        <div>
          <h1><span className="student-home-hi">Hi, </span>{displayName}!</h1>
          <p>{className}</p>
          {currentCount > 0 && <span className="student-home-count">{currentCount} {currentCount === 1 ? "mission" : "missions"} to do</span>}
        </div>
        <div className="student-home-coco" aria-hidden="true"><Image alt="" height={1251} priority src="/images/coco-happy-alpha.png" width={950}/></div>
      </div>
      <nav aria-label="Mission lists" className="student-home-tabs">
        <Link aria-current={assignmentPage.tab === "current" ? "page" : undefined} href="/student/home?tab=current&page=1">To do · {currentCount}</Link>
        <Link aria-current={assignmentPage.tab === "past" ? "page" : undefined} href="/student/home?tab=past&page=1">Done</Link>
      </nav>
    </header>

    <section aria-live="polite" className="student-home-list">
      <div className="student-home-section-title"><strong>{assignmentPage.tab === "current" ? "Your missions" : "Completed missions"}</strong><span>{assignmentPage.tab === "current" ? "Due soon first" : "Newest first"}</span></div>
      {assignmentPage.items.length > 0 ? assignmentPage.items.map((item) => <AssignmentListItem item={item} key={item.assignmentStudentId}/>) : <div className="student-home-empty"><div aria-hidden="true">{assignmentPage.tab === "past" ? "🗂️" : "🌱"}</div><h2>{assignmentPage.tab === "past" ? "No past missions yet" : "No homework yet"}</h2>{assignmentPage.tab === "past" ? <p>Completed speaking missions will show up here.</p> : null}</div>}

      {assignmentPage.totalPages > 1 && <nav aria-label="Mission pages" className="student-home-pager">
        {assignmentPage.page > 1 ? <Link aria-label="Previous page" href={pageHref(assignmentPage.page - 1)}>‹</Link> : <span aria-disabled="true">‹</span>}
        {Array.from({ length: assignmentPage.totalPages }, (_, index) => index + 1).map((page) => <Link aria-current={page === assignmentPage.page ? "page" : undefined} href={pageHref(page)} key={page}>{page}</Link>)}
        {assignmentPage.page < assignmentPage.totalPages ? <Link aria-label="Next page" href={pageHref(assignmentPage.page + 1)}>›</Link> : <span aria-disabled="true">›</span>}
      </nav>}
      <button className="student-switch-class" onClick={handleSwitchClass} type="button">Log out</button>
    </section>
  </div>;
}
