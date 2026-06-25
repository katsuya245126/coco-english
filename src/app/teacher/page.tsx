import { requireTeacherProfile } from "@/server/auth/teacher-profile";

// Per-user authenticated page: never statically cache (Supabase SSR caching
// warning). The guard redirects unauthenticated users to /auth/login and
// users without a profile to /auth/profile.
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const profile = await requireTeacherProfile();

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
      </header>

      <main
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            Classes
          </h1>
          <button
            type="button"
            style={{
              padding: "10px 16px",
              background: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create class
          </button>
        </div>

        <section
          aria-label="Class list"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 48,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            No classes yet
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.5,
              color: "#4B5563",
              margin: "8px 0 0",
            }}
          >
            Create your first class to add students and share a join code.
          </p>
        </section>
      </main>
    </div>
  );
}
