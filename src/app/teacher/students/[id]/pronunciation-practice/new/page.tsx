import Link from "next/link";
import { notFound } from "next/navigation";
import { PronunciationPracticeForm } from "@/components/teacher/PronunciationPracticeForm";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getPronunciationSetup } from "@/server/pronunciation/teacher-service";

export const dynamic = "force-dynamic";

export default async function NewPronunciationPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacherProfile();
  const { id: studentId } = await params;
  const setup = await getPronunciationSetup({
    teacherId: teacher.id,
    studentId,
  });
  if (!setup) notFound();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F7F8FA",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#111827",
      }}
    >
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <Link
          href={`/teacher/students/${setup.studentId}`}
          style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
        >
          ← Back to student
        </Link>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: 32 }}>
        <PronunciationPracticeForm
          studentId={setup.studentId}
          studentName={setup.displayName}
          soundOptions={setup.soundOptions}
          initialSoundId={setup.initialSoundId}
          initialDifficulty={setup.initialDifficulty}
          suggestions={setup.suggestions}
        />
      </main>
    </div>
  );
}
