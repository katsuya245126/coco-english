import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getMissionForTeacher } from "@/server/mission/mission-service";
import { MissionForm } from "@/components/teacher/MissionForm";
import { HoverLink } from "@/components/ui/HoverLink";
import { subtleHover } from "@/components/ui/hover-styles";

export const dynamic = "force-dynamic";

export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, profile] = await Promise.all([
    params,
    requireTeacherProfile(),
  ]);
  const mission = await getMissionForTeacher({
    teacherId: profile.id,
    missionId: id,
  });

  if (!mission) {
    notFound();
  }

  return (
    <div style={mainStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>
            <HoverLink href="/teacher/missions" style={linkStyle} hoverStyle={subtleHover}>
              Missions
            </HoverLink>
          </p>
          <h1 style={titleStyle}>Edit mission</h1>
        </div>
      </div>
      <div style={{ maxWidth: 720 }}>
        <MissionForm
          mode="edit"
          mission={mission}
          activeAssignmentCount={mission.activeAssignmentCount}
        />
      </div>
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
