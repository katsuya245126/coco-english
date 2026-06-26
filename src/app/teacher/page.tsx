import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listClassesForTeacher } from "@/server/classroom/class-service";
import { ClassList } from "@/components/teacher/ClassList";
import Link from "next/link";

// Per-user authenticated page: never statically cache (Supabase SSR caching
// warning). The guard redirects unauthenticated users to /auth/login and
// users without a profile to /auth/profile.
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const profile = await requireTeacherProfile();
  const classes = await listClassesForTeacher({ teacherId: profile.id });

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
        <span style={{ fontSize: 14, fontWeight: 600, color: "#4B5563" }}>
          {profile.display_name ?? "Teacher"}
        </span>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/teacher"
            style={{ color: "#2563EB", textDecoration: "none", fontSize: 14, fontWeight: 600 }}
          >
            Classes
          </Link>
          <Link
            href="/teacher/missions"
            style={{ color: "#2563EB", textDecoration: "none", fontSize: 14, fontWeight: 600 }}
          >
            Missions
          </Link>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              style={{
                background: "none",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 14,
                cursor: "pointer",
                color: "#111827",
              }}
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <main
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: 32,
        }}
      >
        <ClassList classes={classes} />
      </main>
    </div>
  );
}
