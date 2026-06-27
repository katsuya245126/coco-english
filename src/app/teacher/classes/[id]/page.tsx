import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { listRoster } from "@/server/classroom/roster-service";
import { RosterEditor } from "@/components/teacher/RosterEditor";

type NestedRelation<T> = T | T[] | null | undefined;

type EvidenceLinkRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  latest_attempt_id: string | null;
  students: NestedRelation<{
    display_name: string;
  }>;
  assignments: NestedRelation<{
    title: string;
  }>;
};

type EvidenceLink = {
  id: string;
  attemptId: string;
  studentName: string;
  missionTitle: string;
  status: string;
  submittedAt: string | null;
};

function one<T>(relation: NestedRelation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not submitted";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// Per-teacher authenticated page: never statically cache (Supabase SSR caching
// warning). requireTeacherProfile gates access; the class load runs under RLS
// so a class owned by another teacher resolves to notFound rather than leaking.
export const dynamic = "force-dynamic";

export default async function ClassRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTeacherProfile();
  const { id: classId } = await params;

  const supabase = await createSupabaseServerClient();
  const classResult = await supabase
    .from("classes")
    .select("id, name, join_code")
    .eq("id", classId)
    .maybeSingle();

  if (classResult.error) {
    throw new Error(`Unable to load class: ${classResult.error.message}`);
  }
  if (!classResult.data) {
    notFound();
  }

  const roster = await listRoster(classId);
  const evidenceRows = await supabase
    .from("assignment_students")
    .select(
      `
        id,
        status,
        submitted_at,
        latest_attempt_id,
        students!inner(display_name),
        assignments!inner(
          title,
          class_id
        )
      `,
    )
    .eq("assignments.class_id", classId)
    .not("latest_attempt_id", "is", null)
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (evidenceRows.error) {
    throw new Error(
      `Unable to load speaking evidence links: ${evidenceRows.error.message}`,
    );
  }

  const evidenceLinks: EvidenceLink[] = (
    (evidenceRows.data ?? []) as unknown as EvidenceLinkRow[]
  )
    .filter((row) => row.latest_attempt_id)
    .map((row) => ({
      id: row.id,
      attemptId: row.latest_attempt_id as string,
      studentName: one(row.students)?.display_name ?? "Unknown student",
      missionTitle: one(row.assignments)?.title ?? "Untitled mission",
      status: row.status,
      submittedAt: row.submitted_at,
    }));

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
        <Link href="/teacher" style={{ fontSize: 14, color: "#2563EB", textDecoration: "none" }}>
          ← Classes
        </Link>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {classResult.data.name}
          </h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
            {roster.length} active student{roster.length === 1 ? "" : "s"}
            {classResult.data.join_code ? ` · Join code ${classResult.data.join_code}` : ""}
          </p>
        </div>

        <RosterEditor classId={classId} roster={roster} />

        <section style={evidenceSectionStyle} aria-label="Speaking evidence">
          <div style={{ marginBottom: 16 }}>
            <h2 style={sectionHeadingStyle}>Speaking evidence</h2>
            <p style={sectionHelpStyle}>
              Review submitted voice homework for this class.
            </p>
          </div>

          {evidenceLinks.length === 0 ? (
            <p style={emptyStateStyle}>No speaking evidence is ready yet.</p>
          ) : (
            <div style={evidenceListStyle}>
              {evidenceLinks.map((item) => (
                <article key={item.id} style={evidenceItemStyle}>
                  <div>
                    <h3 style={evidenceTitleStyle}>{item.studentName}</h3>
                    <p style={evidenceMetaStyle}>
                      {item.missionTitle} · {item.status} ·{" "}
                      {formatDateTime(item.submittedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/teacher/evidence/${item.attemptId}`}
                    style={evidenceLinkStyle}
                  >
                    Review evidence
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

const evidenceSectionStyle: React.CSSProperties = {
  marginTop: 32,
  paddingTop: 24,
  borderTop: "1px solid #E5E7EB",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const sectionHelpStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: "4px 0 0",
};

const emptyStateStyle: React.CSSProperties = {
  margin: 0,
  padding: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
  color: "#4B5563",
};

const evidenceListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const evidenceItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
  flexWrap: "wrap",
};

const evidenceTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
};

const evidenceMetaStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: "4px 0 0",
};

const evidenceLinkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};
