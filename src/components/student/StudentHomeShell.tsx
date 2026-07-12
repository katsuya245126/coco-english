"use client";

import { useRouter } from "next/navigation";
import { clearStudentUnlockAction } from "@/app/join/actions";
import {
  bodyStyle,
  displayTitleStyle,
  headingStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";
import { AssignmentListItem } from "@/components/student/AssignmentListItem";
import type { StudentAssignmentPage } from "@/server/student-access/assignment-list";

// Verbatim UI-SPEC copy.
const NO_HOMEWORK_HEADING = "No homework yet";
const NO_HOMEWORK_BODY =
  "You are signed in for this class. Your teacher has not assigned speaking homework yet.";

type StudentHomeShellProps = {
  className: string;
  displayName: string;
  assignmentPage: StudentAssignmentPage;
};

// Student home shell (STUD-05, D-14, FLOW-01).
//
// Renders the student's assignment list with per-item badge states, or falls
// back to the "No homework yet" empty state when no assignments exist (D-13).
// The assignment list is passed from the SSR page; no client-side data fetching.
export function StudentHomeShell({
  className,
  displayName,
  assignmentPage,
}: StudentHomeShellProps) {
  const router = useRouter();

  async function handleSwitchClass() {
    await clearStudentUnlockAction();
    router.push("/join");
  }

  const hasAssignments = assignmentPage.items.length > 0;
  const pageHref = (page: number) => `/student/home?tab=${assignmentPage.tab}&page=${page}`;

  return (
    <div>
      <h1 style={displayTitleStyle}>{className}</h1>
      <p style={{ ...bodyStyle, marginBottom: 24 }}>
        Signed in as <strong>{displayName}</strong>
      </p>

      <nav aria-label="Mission lists" style={{ display: "flex", gap: 20, borderBottom: "1px solid #E5E7EB", marginBottom: 20 }}>
        <a href="/student/home?tab=current&page=1" aria-current={assignmentPage.tab === "current" ? "page" : undefined} style={{ padding: "10px 2px", color: assignmentPage.tab === "current" ? "#2563EB" : "#64748B", fontWeight: 700, textDecoration: "none", borderBottom: assignmentPage.tab === "current" ? "2px solid #2563EB" : "2px solid transparent" }}>Current{assignmentPage.tab === "current" ? ` · ${assignmentPage.total}` : ""}</a>
        <a href="/student/home?tab=past&page=1" aria-current={assignmentPage.tab === "past" ? "page" : undefined} style={{ padding: "10px 2px", color: assignmentPage.tab === "past" ? "#2563EB" : "#64748B", fontWeight: 700, textDecoration: "none", borderBottom: assignmentPage.tab === "past" ? "2px solid #2563EB" : "2px solid transparent" }}>Past missions</a>
      </nav>

      {hasAssignments ? (
        <section aria-live="polite">
          <h2 style={{ ...headingStyle, marginBottom: 8 }}>{assignmentPage.tab === "current" ? "Your missions" : "Completed missions"}</h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {assignmentPage.items.map((item) => (
              <AssignmentListItem
                key={item.assignmentStudentId}
                item={item}
              />
            ))}
          </div>
          {assignmentPage.totalPages > 1 ? <nav aria-label="Mission pages" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {assignmentPage.page > 1 ? <a href={pageHref(assignmentPage.page - 1)}>Previous</a> : <span>Previous</span>}
            {Array.from({ length: assignmentPage.totalPages }, (_, index) => index + 1).map((page) => <a key={page} href={pageHref(page)} aria-current={page === assignmentPage.page ? "page" : undefined}>{page}</a>)}
            {assignmentPage.page < assignmentPage.totalPages ? <a href={pageHref(assignmentPage.page + 1)}>Next</a> : <span>Next</span>}
          </nav> : null}
        </section>
      ) : (
        <section
          aria-live="polite"
          style={{
            background: "#F7F8FA",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 24,
            marginBottom: 16,
          }}
        >
          <h2 style={headingStyle}>{assignmentPage.tab === "past" ? "No past missions yet" : NO_HOMEWORK_HEADING}</h2>
          <p style={{ ...bodyStyle, marginBottom: 0 }}>{assignmentPage.tab === "past" ? "Completed speaking missions will show up here." : NO_HOMEWORK_BODY}</p>
        </section>
      )}

      <button
        type="button"
        style={secondaryButtonStyle}
        onClick={handleSwitchClass}
      >
        Switch class
      </button>
    </div>
  );
}
