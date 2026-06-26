import { JoinForm } from "@/components/student/JoinForm";
import { resolveClassByJoinCode } from "@/server/student-access/class-lookup";
import {
  bodyStyle,
  displayTitleStyle,
  pageStyle,
  panelStyle,
} from "@/components/student/styles";

// Verbatim UI-SPEC generic mismatch copy (D-16). An unknown/archived code shows
// this same copy — it never reveals whether the code exists.
const GENERIC_MISMATCH_COPY =
  "We could not match that class, name, and PIN. Try again or ask your teacher.";

// Direct link/QR entry (STUD-01, D-10). Resolves the class server-side from the
// path code, then opens the name + PIN step. An unknown/archived code renders
// the generic mismatch copy with no enumeration of why.
export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ joinCode: string }>;
}) {
  const { joinCode } = await params;
  const context = await resolveClassByJoinCode(joinCode);

  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        {context ? (
          <JoinForm
            initialClass={{
              classId: context.classId,
              className: context.className,
              joinCode: context.joinCode,
            }}
          />
        ) : (
          <div>
            <h1 style={displayTitleStyle}>Join class</h1>
            <p role="alert" style={bodyStyle}>
              {GENERIC_MISMATCH_COPY}
            </p>
            <JoinForm showRemembered />
          </div>
        )}
      </div>
    </main>
  );
}
