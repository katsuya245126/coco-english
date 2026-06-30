import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { listRoster } from "@/server/classroom/roster-service";
import { RosterEditor } from "@/components/teacher/RosterEditor";

type NestedRelation<T> = T | T[] | null | undefined;

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

export default async function ClassManagePage({
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
            {classResult.data.name} — Class Settings
          </h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
            {roster.length} active student{roster.length === 1 ? "" : "s"}
            {classResult.data.join_code ? ` · Join code ${classResult.data.join_code}` : ""}
          </p>
        </div>

        <RosterEditor classId={classId} roster={roster} />
      </main>
    </div>
  );
}

// Keep these helpers exported for any future re-use but mark them as used
// by the moved content (originally from [id]/page.tsx).
export { one, formatDateTime };
