import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { StudentMissionRecap } from "@/components/student/StudentMissionRecap";
import { pageStyle, panelStyle } from "@/components/student/styles";
import { getCompletedMissionRecap } from "@/server/student-access/student-history";

const backLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  marginBottom: 12,
  background: "none",
  color: "#2563EB",
  border: "1px solid #2563EB",
  borderRadius: 6,
  fontSize: 20,
  fontWeight: 600,
  textDecoration: "none",
  boxSizing: "border-box",
} as const;

export default async function StudentHistoryPage({ params }: { params: Promise<{ assignmentStudentId: string }> }) {
  const unlock = await readStudentUnlock();
  if (!unlock) redirect("/join");
  const { assignmentStudentId } = await params;
  const recap = await getCompletedMissionRecap(unlock.studentId, assignmentStudentId);
  if (!recap) notFound();
  return <main style={pageStyle}><div style={{ ...panelStyle, maxWidth: 430 }}>
    <Link href="/student/home?tab=past" style={backLinkStyle} aria-label="Back to past missions" title="Back to past missions">←</Link>
    <h1 style={{ marginBottom: 4 }}>{recap.title}</h1>
    <p style={{ color: "#64748B", marginTop: 0 }}>{recap.completedAt ? `Completed ${new Date(recap.completedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })} · ` : ""}Read-only recap</p>
    <StudentMissionRecap recap={recap} />
  </div></main>;
}
