import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { HomeworkReview } from "@/components/student/HomeworkReview";
import { StudentMissionRecap } from "@/components/student/StudentMissionRecap";
import { pageStyle, panelStyle, primaryButtonStyle } from "@/components/student/styles";
import {
  getCompletedMissionRecap,
  type StudentMissionRecap as Recap,
} from "@/server/student-access/student-history";

const backLinkStyle = {
  ...primaryButtonStyle,
  width: 44,
  minHeight: 44,
  padding: 0,
  marginBottom: 12,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 20,
  boxSizing: "border-box",
} as const;

export default async function StudentHistoryPage({ params }: { params: Promise<{ assignmentStudentId: string }> }) {
  const unlock = await readStudentUnlock();
  if (!unlock) redirect("/join");
  const { assignmentStudentId } = await params;

  let recap: Recap | null;
  try {
    recap = await getCompletedMissionRecap(unlock.studentId, assignmentStudentId);
  } catch {
    return <main style={pageStyle}><div style={{ ...panelStyle, maxWidth: 430 }}>
      <h1>Homework Review</h1>
      <p>Your homework is complete, but the review could not load.</p>
      <Link href="/student/home" className="student-primary-button" style={primaryButtonStyle}>Back to homework</Link>
    </div></main>;
  }
  if (!recap) notFound();

  if (recap.conversationMode) {
    return <HomeworkReview recap={recap} studentDisplayName={unlock.displayName} />;
  }

  return <main style={pageStyle}><div style={{ ...panelStyle, maxWidth: 430 }}>
    <Link href="/student/home?tab=past" className="student-primary-button" style={backLinkStyle} aria-label="Back to past missions" title="Back to past missions">←</Link>
    <h1 style={{ marginBottom: 4 }}>{recap.title}</h1>
    <p style={{ color: "#64748B", marginTop: 0 }}>{recap.completedAt ? `Completed ${new Date(recap.completedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })} · ` : ""}Read-only recap</p>
    <StudentMissionRecap recap={recap} />
  </div></main>;
}
