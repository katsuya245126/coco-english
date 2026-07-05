"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveMissionAction } from "@/app/teacher/missions/actions";
import type { AssignableClass } from "@/server/mission/assign-service";
import type { TeacherMission } from "@/server/mission/mission-service";
import { AssignDialog } from "@/components/teacher/AssignDialog";
import { MissionAssignmentDialog } from "@/components/teacher/MissionAssignmentDialog";
import { HoverButton } from "@/components/ui/HoverButton";
import { HoverLink } from "@/components/ui/HoverLink";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

type MissionListProps = {
  missions: TeacherMission[];
  assignableClasses: AssignableClass[];
};

export function MissionList({ missions, assignableClasses }: MissionListProps) {
  const router = useRouter();
  const [assigningMission, setAssigningMission] = useState<TeacherMission | null>(
    null,
  );
  const [managingMission, setManagingMission] = useState<TeacherMission | null>(
    null,
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivingMissionId, setArchivingMissionId] = useState<string | null>(null);

  // Auto-dismiss success message after 5 seconds (UI-SPEC requirement)
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleArchiveMission(mission: TeacherMission) {
    const confirmed = window.confirm(`Archive mission "${mission.title}"?`);
    if (!confirmed) return;

    setError(null);
    setArchivingMissionId(mission.id);
    const result = await archiveMissionAction(mission.id);
    setArchivingMissionId(null);

    if (result.ok) {
      setSuccess("Mission archived.");
      router.refresh();
      return;
    }

    setError(result.error);
  }

  return (
    <div>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Missions</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <HoverLink
            href="/teacher/missions/archived"
            style={secondaryLinkStyle}
            hoverStyle={secondaryHover}
          >
            Archived missions
          </HoverLink>
          <HoverLink href="/teacher/missions/new" style={primaryLinkStyle} hoverStyle={primaryHover}>
            Create mission
          </HoverLink>
        </div>
      </div>

      {success ? (
        <p aria-live="polite" style={successStyle}>
          {success}
        </p>
      ) : null}
      {error ? (
        <p aria-live="polite" style={errorStyle}>
          {error}
        </p>
      ) : null}

      {missions.length === 0 ? (
        <section aria-label="Mission list" style={emptyStyle}>
          <h2 style={headingStyle}>No missions yet</h2>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: "#4B5563", margin: "8px 0 24px" }}>
            Create your first mission to assign speaking homework to a class.
          </p>
          <HoverLink href="/teacher/missions/new" style={primaryLinkStyle} hoverStyle={primaryHover}>
            Create mission
          </HoverLink>
        </section>
      ) : (
        <section aria-label="Mission list" style={listStyle}>
          {missions.map((mission, index) => (
            <div
              key={mission.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: 16,
                borderTop: index === 0 ? "none" : "1px solid #E5E7EB",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {mission.title}
                </p>
                <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
                  {mission.level} · {mission.turnCount} turn
                  {mission.turnCount === 1 ? "" : "s"} · {mission.assignmentCount} assignment
                  {mission.assignmentCount === 1 ? "" : "s"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <HoverLink
                  href={`/teacher/missions/${mission.id}`}
                  style={secondaryLinkStyle}
                  hoverStyle={secondaryHover}
                >
                  Edit
                </HoverLink>
                {assignableClasses.length > 0 ? (
                  <HoverButton
                    type="button"
                    onClick={() => setAssigningMission(mission)}
                    style={primaryButtonStyle}
                    hoverStyle={primaryHover}
                  >
                    Assign to class
                  </HoverButton>
                ) : (
                  <span style={{ fontSize: 14, color: "#6B7280", alignSelf: "center" }}>
                    You have no classes with active students. Create a class and add students first.
                  </span>
                )}
                {mission.assignmentCount > 0 ? (
                  <HoverButton
                    type="button"
                    onClick={() => setManagingMission(mission)}
                    style={secondaryButtonStyle}
                    hoverStyle={secondaryHover}
                  >
                    Manage assignments
                  </HoverButton>
                ) : null}
                <HoverButton
                  type="button"
                  onClick={() => handleArchiveMission(mission)}
                  style={secondaryButtonStyle}
                  hoverStyle={secondaryHover}
                  disabled={archivingMissionId === mission.id}
                  aria-label={`Archive mission ${mission.title}`}
                >
                  {archivingMissionId === mission.id ? "Archiving..." : "Archive mission"}
                </HoverButton>
              </div>
            </div>
          ))}
        </section>
      )}

      {assigningMission ? (
        <AssignDialog
          missionId={assigningMission.id}
          missionTitle={assigningMission.title}
          classes={assignableClasses}
          onClose={() => setAssigningMission(null)}
          onAssigned={(message) => setSuccess(message)}
        />
      ) : null}

      {managingMission ? (
        <MissionAssignmentDialog
          missionId={managingMission.id}
          missionTitle={managingMission.title}
          onClose={() => setManagingMission(null)}
          onChanged={(message) => {
            setSuccess(message);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

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

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const emptyStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 48,
  textAlign: "center",
};

const listStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  overflow: "visible",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  textDecoration: "none",
  transition: "background 0.15s ease, border-color 0.15s ease",
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
  textDecoration: "none",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const successStyle: React.CSSProperties = {
  color: "#177245",
  fontSize: 14,
  margin: "0 0 16px",
};

const errorStyle: React.CSSProperties = {
  color: "#B42318",
  fontSize: 14,
  margin: "0 0 16px",
};
