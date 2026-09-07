import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { PronunciationPracticeShell } from "@/components/student/PronunciationPracticeShell";
import { getPronunciationPracticePage } from "@/server/student-access/pronunciation-flow";

type PronunciationPageProps = {
  params: Promise<{ assignmentStudentId: string }>;
};

export default async function PronunciationPage({ params }: PronunciationPageProps) {
  const unlock = await readStudentUnlock();
  if (!unlock) redirect("/join");

  const { assignmentStudentId } = await params;
  const result = await getPronunciationPracticePage({
    studentId: unlock.studentId,
    assignmentStudentId,
  });
  if (!result.ok) redirect("/student/home");

  return <PronunciationPracticeShell page={result.page} />;
}
