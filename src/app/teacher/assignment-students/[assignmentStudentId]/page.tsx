import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getAssignmentStudentEvidenceForTeacher } from "@/server/teacher/assignment-student-evidence";
import { AssignmentStudentDismissControls } from "@/components/teacher/AssignmentStudentDismissControls";
import { HoverLink } from "@/components/ui/HoverLink";
import { subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function AssignmentStudentPage({
  params,
}: {
  params: Promise<{ assignmentStudentId: string }>;
}) {
  const [{ assignmentStudentId }, profile] = await Promise.all([
    params,
    requireTeacherProfile(),
  ]);
  const evidence = await getAssignmentStudentEvidenceForTeacher({
    teacherId: profile.id,
    assignmentStudentId,
  });

  if (!evidence) notFound();

  return (
    <div style={shellStyle}>
      <main style={mainStyle}>
        <p style={{ margin: "0 0 12px" }}>
          <HoverLink
            href={`/teacher/classes/${evidence.classId}/review/${evidence.assignmentId}`}
            style={linkStyle}
            hoverStyle={subtleHover}
          >
            ← Back to assignment review
          </HoverLink>
        </p>
        <h1 style={titleStyle}>Assignment details</h1>

        <AssignmentStudentDismissControls
          assignmentStudentId={evidence.assignmentStudentId}
          className={evidence.className}
          dismissed={evidence.dismissedAt != null}
        />

        <section style={summaryStyle} aria-label="Assignment summary">
          <SummaryItem label="Student" value={evidence.studentName} />
          <SummaryItem label="Mission" value={evidence.missionTitle} />
          <SummaryItem label="Status" value={evidence.statusLabel} />
          <SummaryItem label="Submitted" value={evidence.submittedLabel} />
          <SummaryItem label="Attempts" value={evidence.attemptCount} />
          <SummaryItem label="Highest hint used" value={evidence.highestHintLabel} />
        </section>
      </main>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={valueStyle}>{value}</p>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#F7F8FA",
  color: "#111827",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: 32,
};

const linkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 24px",
  fontSize: 28,
  fontWeight: 600,
};

const summaryStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 20,
  padding: 20,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const labelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 12,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
};

const valueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 500,
};
