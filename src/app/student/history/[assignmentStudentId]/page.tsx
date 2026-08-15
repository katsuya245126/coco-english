import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { HomeworkReview } from "@/components/student/HomeworkReview";
import { pageStyle, panelStyle, primaryButtonStyle } from "@/components/student/styles";
import {
  getCompletedMissionRecap,
  type StudentMissionRecap as Recap,
} from "@/server/student-access/student-history";

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

  return <HomeworkReview recap={recap} studentDisplayName={unlock.displayName} />;
}
