import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listAssignableClassesForTeacher } from "@/server/mission/assign-service";
import { listMissionsForTeacher } from "@/server/mission/mission-service";
import { MissionList } from "@/components/teacher/MissionList";
import { HoverButton } from "@/components/ui/HoverButton";
import { HoverLink } from "@/components/ui/HoverLink";
import { secondaryHover, subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const profile = await requireTeacherProfile();
  const [missions, assignableClasses] = await Promise.all([
    listMissionsForTeacher({ teacherId: profile.id }),
    listAssignableClassesForTeacher({ teacherId: profile.id }),
  ]);

  return (
    <div style={shellStyle}>
      <header style={topBarStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#4B5563" }}>
          {profile.display_name ?? "Teacher"}
        </span>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <HoverLink href="/teacher" style={navLinkStyle} hoverStyle={subtleHover}>
            Classes
          </HoverLink>
          <HoverLink href="/teacher/missions" style={navLinkStyle} hoverStyle={subtleHover}>
            Missions
          </HoverLink>
          <form action="/auth/logout" method="post">
            <HoverButton type="submit" style={logoutButtonStyle} hoverStyle={secondaryHover}>
              Log out
            </HoverButton>
          </form>
        </nav>
      </header>
      <main style={mainStyle}>
        <MissionList missions={missions} assignableClasses={assignableClasses} />
      </main>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#F7F8FA",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: "#111827",
};

const topBarStyle: React.CSSProperties = {
  minHeight: 56,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "0 24px",
  background: "#FFFFFF",
  borderBottom: "1px solid #E5E7EB",
  flexWrap: "wrap",
};

const navLinkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 6,
  transition: "background 0.15s ease",
};

const logoutButtonStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 14,
  cursor: "pointer",
  color: "#111827",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: 32,
};
