import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { MissionForm } from "@/components/teacher/MissionForm";
import { HoverButton } from "@/components/ui/HoverButton";
import { HoverLink } from "@/components/ui/HoverLink";
import { secondaryHover, subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function NewMissionPage() {
  const profile = await requireTeacherProfile();

  return (
    <MissionShell displayName={profile.display_name ?? "Teacher"}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>
            <HoverLink href="/teacher/missions" style={linkStyle} hoverStyle={subtleHover}>
              Missions
            </HoverLink>
          </p>
          <h1 style={titleStyle}>New mission</h1>
        </div>
      </div>
      <div style={{ maxWidth: 720 }}>
        <MissionForm mode="create" />
      </div>
    </MissionShell>
  );
}

function MissionShell(props: {
  displayName: string;
  children: React.ReactNode;
}) {
  return (
    <div style={shellStyle}>
      <header style={topBarStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#4B5563" }}>
          {props.displayName}
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
      <main style={mainStyle}>{props.children}</main>
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
  marginBottom: 32,
  gap: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  margin: 0,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 14,
  margin: "0 0 8px",
};

const linkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  borderRadius: 6,
  transition: "background 0.15s ease",
};
