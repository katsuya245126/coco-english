import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listArchivedMissionsForTeacher } from "@/server/mission/mission-service";
import { ArchivedMissionList } from "@/components/teacher/ArchivedMissionList";
import { HoverButton } from "@/components/ui/HoverButton";
import { HoverLink } from "@/components/ui/HoverLink";
import { secondaryHover, subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function ArchivedMissionsPage() {
  const profile = await requireTeacherProfile();
  const missions = await listArchivedMissionsForTeacher({ teacherId: profile.id });

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
        <div style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Archived Missions</h1>
            <p style={subtitleStyle}>Restore mission templates you want to use again.</p>
          </div>
          <HoverLink href="/teacher/missions" style={secondaryLinkStyle} hoverStyle={subtleHover}>
            Active missions
          </HoverLink>
        </div>
        <ArchivedMissionList missions={missions} />
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

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 32,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: "4px 0 0",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "8px 12px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  transition: "background 0.15s ease, border-color 0.15s ease",
};
