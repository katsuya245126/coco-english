import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { StudentHomeShell } from "@/components/student/StudentHomeShell";
import { listStudentAssignments } from "@/server/student-access/assignment-list";
import { pageStyle, panelStyle } from "@/components/student/styles";

// Student home shell route (STUD-04, STUD-05, FLOW-01, D-14).
//
// Server-rendered. Reads the short-lived, server-only unlock cookie set by the
// unlock action. If absent (no fresh PIN unlock this session), it redirects back
// to /join — remembering the class never bypasses the PIN (D-13/D-17). With a
// valid unlock it loads this student's assignments via service-role (T-04-03:
// studentId comes from the cookie, never from the request) and renders the home
// shell with the assignment list.
export default async function StudentHomePage() {
  const unlock = await readStudentUnlock();

  if (!unlock) {
    redirect("/join");
  }

  const assignments = await listStudentAssignments(unlock.studentId);

  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <StudentHomeShell
          className={unlock.className}
          displayName={unlock.displayName}
          assignments={assignments}
        />
      </div>
    </main>
  );
}
