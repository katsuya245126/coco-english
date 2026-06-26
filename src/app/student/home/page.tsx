import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { StudentHomeShell } from "@/components/student/StudentHomeShell";
import { pageStyle, panelStyle } from "@/components/student/styles";

// Student home shell route (STUD-04, STUD-05, D-14).
//
// Server-rendered. Reads the short-lived, server-only unlock cookie set by the
// unlock action. If absent (no fresh PIN unlock this session), it redirects back
// to /join — remembering the class never bypasses the PIN (D-13/D-17). With a
// valid unlock it renders the no-homework shell with class/name context.
export default async function StudentHomePage() {
  const unlock = await readStudentUnlock();

  if (!unlock) {
    redirect("/join");
  }

  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <StudentHomeShell
          className={unlock.className}
          displayName={unlock.displayName}
        />
      </div>
    </main>
  );
}
