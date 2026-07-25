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

        <section style={missionStyle} aria-label="Mission content">
          <h2 style={sectionTitleStyle}>What this mission asked for</h2>
          <p style={missionNoteStyle}>
            {evidence.status === "missed"
              ? `${evidence.studentName} did not open this mission before it was due, so there is no recording to review.`
              : `${evidence.studentName} has not started this mission yet, so there is no recording to review.`}{" "}
            This is the work that was assigned.
          </p>

          {(evidence.targetPattern || evidence.topic) && (
            <div style={missionMetaStyle}>
              {evidence.topic && <SummaryItem label="Topic" value={evidence.topic} />}
              {evidence.targetPattern && (
                <SummaryItem label="Target pattern" value={evidence.targetPattern} />
              )}
            </div>
          )}

          {evidence.turns.length === 0 ? (
            <p style={missionNoteStyle}>Mission details are unavailable for this assignment.</p>
          ) : (
            <ol style={turnListStyle}>
              {evidence.turns.map((turn) => (
                <li key={turn.turnOrder} style={turnItemStyle}>
                  <p style={labelStyle}>Turn {turn.turnOrder}</p>
                  <p style={turnPromptStyle}>{turn.prompt}</p>
                  <p style={turnExampleStyle}>Example answer: {turn.targetExample}</p>
                </li>
              ))}
            </ol>
          )}
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

const missionStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 20,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 20,
  fontWeight: 600,
};

const missionNoteStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 14,
  color: "#4B5563",
  lineHeight: 1.5,
};

const missionMetaStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 20,
  marginBottom: 20,
};

const turnListStyle: React.CSSProperties = {
  listStyle: "none",
  display: "grid",
  gap: 12,
  margin: 0,
  padding: 0,
};

const turnItemStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  background: "#F9FAFB",
};

const turnPromptStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 15,
  fontWeight: 600,
  color: "#111827",
};

const turnExampleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#4B5563",
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
