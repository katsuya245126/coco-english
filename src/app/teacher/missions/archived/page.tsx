import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listArchivedMissionsForTeacher } from "@/server/mission/mission-service";
import { ArchivedMissionList } from "@/components/teacher/ArchivedMissionList";
import { HoverLink } from "@/components/ui/HoverLink";
import { subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function ArchivedMissionsPage() {
  const profile = await requireTeacherProfile();
  const missions = await listArchivedMissionsForTeacher({ teacherId: profile.id });

  return (
    <div style={mainStyle}>
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
    </div>
  );
}

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
