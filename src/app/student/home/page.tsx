import "./student-home.css";
import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { StudentHomeShell } from "@/components/student/StudentHomeShell";
import { demoClassId } from "@/server/demo/demo-config";
import { demoStudentExists } from "@/server/demo/demo-student";
import { listStudentAssignmentPage, type StudentAssignmentTab } from "@/server/student-access/assignment-list";

// Student home shell route (STUD-04, STUD-05, FLOW-01, D-14).
//
// Server-rendered. Reads the short-lived, server-only unlock cookie set by the
// unlock action. If absent (no fresh PIN unlock this session), it redirects back
// to /join — remembering the class never bypasses the PIN (D-13/D-17). With a
// valid unlock it loads this student's assignments via service-role (T-04-03:
// studentId comes from the cookie, never from the request) and renders the home
// shell with the assignment list.
export default async function StudentHomePage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const unlock = await readStudentUnlock();

  const demoClass = demoClassId();
  if (!unlock) {
    redirect(demoClass ? "/" : "/join");
  }

  // Demo students are deleted nightly while their cookie may still be valid.
  if (demoClass && !(await demoStudentExists(demoClass, unlock.studentId))) {
    redirect("/");
  }

  const query = await searchParams;
  const tab: StudentAssignmentTab = query.tab === "past" ? "past" : "current";
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const page = await listStudentAssignmentPage(unlock.studentId, {
    tab,
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize: 5,
  });
  const currentCount = tab === "current" ? page.total : (await listStudentAssignmentPage(unlock.studentId, { tab: "current", page: 1, pageSize: 1 })).total;

  return (
    <main className="student-home-page sticker-theme">
      <div className="student-home-phone">
        <StudentHomeShell
          className={unlock.className}
          displayName={unlock.displayName}
          assignmentPage={page}
          currentCount={currentCount}
        />
      </div>
    </main>
  );
}
