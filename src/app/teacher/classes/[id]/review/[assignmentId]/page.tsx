import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { bucketAssignmentStudents } from "@/domain/teacher/review-buckets";
import { StatusBadge } from "@/components/teacher/StatusBadge";

// Per-teacher authenticated page: never statically cache (Supabase SSR caching
// warning). requireTeacherProfile gates access; the class and assignment load
// runs under RLS so resources owned by another teacher resolve to notFound.
export const dynamic = "force-dynamic";

type NestedRelation<T> = T | T[] | null | undefined;

const studentRelationSchema = z.object({ display_name: z.string() });
const assignmentStudentRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  submitted_at: z.string().nullable(),
  latest_attempt_id: z.string().nullable(),
  students: z
    .union([studentRelationSchema, z.array(studentRelationSchema)])
    .nullish(),
});

type StudentEntry = {
  id: string;
  status: string;
  submittedAt: string | null;
  latestAttemptId: string | null;
  studentName: string;
};

function one<T>(relation: NestedRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not yet submitted";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string | null): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

// Bucket render order per UI-SPEC:
//   completed → needs_retry → teacher_review → not_started → missed
// Rationale: teacher priority order — confirm done first, then act on
// exceptions, then see who hasn't started, then archived misses.
const BUCKET_ORDER = [
  { key: "completed", heading: "Completed" },
  { key: "needs_retry", heading: "Needs retry" },
  { key: "teacher_review", heading: "Needs your review" },
  { key: "not_started", heading: "Not started" },
  { key: "missed", heading: "Missed" },
] as const;

type BucketKey = (typeof BUCKET_ORDER)[number]["key"];

export default async function AssignmentReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  await requireTeacherProfile();
  const { id: classId, assignmentId } = await params;
  const { student: requestedStudentId } = await searchParams;

  const supabase = await createSupabaseServerClient();

  // Load class (name for breadcrumb) under RLS
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

  // Load assignment and verify it belongs to this class (notFound otherwise)
  // This enforces T-07-05: no cross-class data leak via URL manipulation.
  const assignmentResult = await supabase
    .from("assignments")
    .select("id, title, due_at, class_id")
    .eq("id", assignmentId)
    .eq("class_id", classId)
    .maybeSingle();

  if (assignmentResult.error) {
    throw new Error(
      `Unable to load assignment: ${assignmentResult.error.message}`,
    );
  }
  if (!assignmentResult.data) {
    notFound();
  }

  const assignment = assignmentResult.data;
  const className = classResult.data.name;

  // D-03: Scope query to ONE assignment_id — no cross-assignment bleed (Pitfall 6)
  const studentsResult = await supabase
    .from("assignment_students")
    .select(
      `
        id,
        status,
        submitted_at,
        latest_attempt_id,
        students!inner(display_name)
      `,
    )
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (studentsResult.error) {
    throw new Error(
      `Unable to load student results: ${studentsResult.error.message}`,
    );
  }

  const rowsParsed = z
    .array(assignmentStudentRowSchema)
    .safeParse(studentsResult.data ?? []);
  if (!rowsParsed.success) {
    throw new Error("Unable to load student results: unexpected row shape");
  }

  const entries: StudentEntry[] = rowsParsed.data.map((row) => ({
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    latestAttemptId: row.latest_attempt_id,
    studentName: one(row.students)?.display_name ?? "Unknown student",
  }));
  const selectedStudentId = entries.some((entry) => entry.id === requestedStudentId)
    ? requestedStudentId
    : undefined;

  // Bucket all rows into the five D-05 groups
  const buckets = bucketAssignmentStudents(entries);

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
          href={`/teacher/classes/${classId}`}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#2563EB",
            textDecoration: "none",
          }}
        >
          ← {className}
        </Link>
        <Link
          href={`/teacher/classes/${classId}/manage`}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#2563EB",
            textDecoration: "none",
          }}
        >
          Class settings
        </Link>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {assignment.title} · Due {formatDate(assignment.due_at)}
          </h1>
        </div>

        {BUCKET_ORDER.map(({ key, heading }) => {
          const rows = buckets[key as BucketKey];
          return (
            <section
              key={key}
              aria-label={`${heading} students`}
              style={{
                marginTop: 24,
                paddingTop: 16,
                borderTop: "1px solid #E5E7EB",
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  margin: "0 0 12px",
                }}
              >
                {heading}
              </h2>

              {rows.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "#4B5563",
                    padding: "12px 0",
                  }}
                >
                  No students in this group.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {rows.map((entry) => (
                    <article
                      key={entry.id}
                      aria-current={entry.id === selectedStudentId ? "true" : undefined}
                      aria-label={`${entry.studentName} — ${entry.status}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: 16,
                        minHeight: 56,
                        border: entry.id === selectedStudentId ? "2px solid #2563EB" : "1px solid #D1D5DB",
                        borderRadius: 8,
                        background: entry.id === selectedStudentId ? "#EFF6FF" : "#FFFFFF",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flex: 1,
                          minWidth: 0,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#111827",
                          }}
                        >
                          {entry.studentName}
                        </span>
                        <StatusBadge status={entry.status} />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 14, color: "#4B5563" }}>
                          {entry.submittedAt
                            ? `Submitted ${formatDateTime(entry.submittedAt)}`
                            : "Not yet submitted"}
                        </span>
                        {entry.latestAttemptId ? (
                          <Link
                            href={`/teacher/evidence/${entry.latestAttemptId}`}
                            aria-label={`Review ${entry.studentName}'s attempt`}
                            style={{
                              color: "#2563EB",
                              textDecoration: "none",
                              fontSize: 14,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Review evidence
                          </Link>
                        ) : (
                          <Link
                            href={`/teacher/assignment-students/${entry.id}`}
                            aria-label={`View ${entry.studentName}'s assignment`}
                            style={{
                              color: "#2563EB",
                              textDecoration: "none",
                              fontSize: 14,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            View assignment
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
