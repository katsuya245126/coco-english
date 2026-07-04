import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  getStudentProfileHeader,
  getStudentSoundProfile,
} from "@/server/teacher/student-profile";

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

  const weaknesses = await getStudentSoundProfile(studentId, teacher.id);

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
          href="/teacher"
          style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
        >
          ← Classes
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
              {weaknesses.map((sound) => (
                <article
                  key={sound.label + sound.ipa}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: 16,
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    background: "#FFFFFF",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        margin: 0,
                        color: "#111827",
                      }}
                    >
                      {sound.label}{" "}
                      <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>
                        /{sound.ipa}/
                      </span>
                    </p>
                    <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
                      Weak in {sound.weakCount} of {sound.totalCount} words · avg{" "}
                      {sound.averageAccuracy}/100 · e.g. "{sound.exampleWord}"
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
