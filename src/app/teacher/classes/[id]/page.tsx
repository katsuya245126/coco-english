import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { listRoster } from "@/server/classroom/roster-service";

// Per-teacher authenticated page: never statically cache (Supabase SSR caching
// warning). requireTeacherProfile gates access; the class load runs under RLS
// so a class owned by another teacher resolves to notFound rather than leaking.
export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  created_at: string;
};

export default async function ClassReviewDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTeacherProfile();
  const { id: classId } = await params;

  const supabase = await createSupabaseServerClient();

  // Load class under RLS — a class owned by another teacher resolves to null
  const classResult = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .maybeSingle();

  if (classResult.error) {
    throw new Error(`Unable to load class: ${classResult.error.message}`);
  }
  if (!classResult.data) {
    notFound();
  }

  // Load active student count for meta line
  const roster = await listRoster(classId);

  // Load assignments newest-first (D-04: due_at desc then created_at desc)
  const assignmentsResult = await supabase
    .from("assignments")
    .select("id, title, due_at, created_at")
    .eq("class_id", classId)
    .is("canceled_at", null)
    .order("due_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (assignmentsResult.error) {
    throw new Error(
      `Unable to load assignments: ${assignmentsResult.error.message}`,
    );
  }

  const assignments: AssignmentRow[] = assignmentsResult.data ?? [];

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
          justifyContent: "space-between",
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
        <Link
          href={`/teacher/classes/${classId}/manage`}
          style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
        >
          Class settings
        </Link>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {classResult.data.name} — Assignment Review
          </h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
            {roster.length} active student{roster.length === 1 ? "" : "s"}
          </p>
        </div>

        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: "0 0 12px",
            }}
          >
            Students
          </h2>

          {roster.length === 0 ? (
            <div
              style={{
                padding: 16,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                background: "#FFFFFF",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
                No students in this class yet.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {roster.map((student) => (
                <Link
                  key={student.id}
                  href={`/teacher/students/${student.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: 16,
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    background: "#FFFFFF",
                    textDecoration: "none",
                    color: "#111827",
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600 }}>
                    {student.displayName}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#2563EB",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View sounds →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: "0 0 12px",
            }}
          >
            Assignments
          </h2>

          {assignments.length === 0 ? (
            <div
              style={{
                padding: 16,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                background: "#FFFFFF",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
                No assignments yet.
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: "#4B5563" }}>
                Assign a mission to this class to see student homework here.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {assignments.map((assignment) => (
                <article
                  key={assignment.id}
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        margin: 0,
                        color: "#111827",
                      }}
                    >
                      {assignment.title}
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        color: "#4B5563",
                        margin: "4px 0 0",
                      }}
                    >
                      Due {formatDate(assignment.due_at)}
                    </p>
                  </div>
                  <Link
                    href={`/teacher/classes/${classId}/review/${assignment.id}`}
                    style={{
                      color: "#2563EB",
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    View results
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
