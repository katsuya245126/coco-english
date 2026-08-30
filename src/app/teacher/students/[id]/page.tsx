import Link from "next/link";
import { notFound } from "next/navigation";
import type { StudentSoundWeakness } from "@/domain/pronunciation/scoring";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  getStudentProfileHeader,
  getStudentSoundProfile,
} from "@/server/teacher/student-profile";
import { getPronunciationSamplesForTeacher } from "@/server/teacher/pronunciation-samples";
import { PronunciationSamplesPanel } from "@/components/teacher/PronunciationSamplesPanel";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacherProfile();
  const { id: studentId } = await params;

  const header = await getStudentProfileHeader(studentId);
  if (!header) {
    notFound();
  }

  const [weaknesses, samples] = await Promise.all([
    getStudentSoundProfile(studentId, teacher.id),
    getPronunciationSamplesForTeacher({
      studentId,
      teacherId: teacher.id,
    }),
  ]);

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
          href={`/teacher/classes/${header.classId}/students`}
          style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
        >
          ← Back to students
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {header.displayName}
          </h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
            {header.className}
          </p>
        </div>

        <PronunciationSamplesPanel studentId={studentId} samples={samples}>
          <section>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.25,
                margin: "0 0 12px",
              }}
            >
              Sounds to work on
            </h2>

            {weaknesses.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  background: "#FFFFFF",
                }}
              >
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  No consistent weak sounds yet.
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: "#4B5563" }}>
                  As this student completes more speaking homework, sounds they
                  repeatedly struggle with will appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {weaknesses.map((sound) => {
                  if (!sound.candidate) {
                    return (
                      <article key={sound.label + sound.ipa} style={soundCardStyle}>
                        <div style={soundSummaryStyle}>
                          <SoundSummary sound={sound} />
                        </div>
                      </article>
                    );
                  }

                  return (
                    <details
                      key={sound.label + sound.ipa}
                      style={soundCardStyle}
                    >
                      <summary style={{ ...soundSummaryStyle, cursor: "pointer" }}>
                        <SoundSummary sound={sound} />
                      </summary>
                      <div style={soundDetailStyle}>
                        <p style={{ margin: 0, fontWeight: 600, color: "#92400E" }}>
                          Sounded closer to /{sound.candidate.ipa}/
                        </p>
                        <p style={{ margin: "4px 0 0" }}>
                          Seen in {sound.candidate.count} weak attempt
                          {sound.candidate.count === 1 ? "" : "s"} · example
                          {sound.candidate.exampleWords.length === 1 ? "" : "s"}:{" "}
                          {sound.candidate.exampleWords
                            .map((word) => `“${word}”`)
                            .join(", ")} · Source: Mission
                        </p>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        </PronunciationSamplesPanel>
      </main>
    </div>
  );
}

function SoundSummary({ sound }: { sound: StudentSoundWeakness }) {
  return (
    <span style={{ minWidth: 0 }}>
      <span
        style={{
          display: "block",
          fontSize: 18,
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {sound.label}{" "}
        <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>
          /{sound.ipa}/
        </span>
      </span>
      <span
        style={{
          display: "block",
          fontSize: 14,
          color: "#4B5563",
          marginTop: 4,
        }}
      >
        Weak in {sound.weakCount} of {sound.totalCount} words · avg{" "}
        {sound.averageAccuracy}/100 · e.g. &quot;{sound.exampleWord}&quot;
      </span>
    </span>
  );
}

const soundCardStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
  overflow: "hidden",
};

const soundSummaryStyle: React.CSSProperties = {
  display: "block",
  padding: 16,
  listStylePosition: "inside",
};

const soundDetailStyle: React.CSSProperties = {
  padding: "0 16px 16px",
  fontSize: 14,
  color: "#4B5563",
};
