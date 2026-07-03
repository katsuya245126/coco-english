"use client";

import { useEffect, useState } from "react";
import { deleteMissionAction } from "@/app/teacher/missions/actions";
import type { AssignableClass } from "@/server/mission/assign-service";
import type { TeacherMission } from "@/server/mission/mission-service";
import { AssignDialog } from "@/components/teacher/AssignDialog";
import { HoverButton } from "@/components/ui/HoverButton";
import { HoverLink } from "@/components/ui/HoverLink";
import {
  dangerHover,
  primaryHover,
  secondaryHover,
} from "@/components/ui/hover-styles";

type MissionListProps = {
  missions: TeacherMission[];
  assignableClasses: AssignableClass[];
};

export function MissionList({ missions, assignableClasses }: MissionListProps) {
  const [assigningMission, setAssigningMission] = useState<TeacherMission | null>(
    null,
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingMissionId, setDeletingMissionId] = useState<string | null>(null);
  const [disabledDeleteTooltipMissionId, setDisabledDeleteTooltipMissionId] =
    useState<string | null>(null);

  // Auto-dismiss success message after 5 seconds (UI-SPEC requirement)
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleDeleteMission(mission: TeacherMission) {
    if (mission.assignmentCount > 0) return;
    const confirmed = window.confirm(`Delete mission "${mission.title}"?`);
    if (!confirmed) return;

    setError(null);
    setDeletingMissionId(mission.id);
    const result = await deleteMissionAction(mission.id);
    setDeletingMissionId(null);

    if (result.ok) {
      setSuccess("Mission deleted.");
      return;
    }

    setError(result.error);
  }

  return (
    <div>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Missions</h1>
        <HoverLink href="/teacher/missions/new" style={primaryLinkStyle} hoverStyle={primaryHover}>
          Create mission
        </HoverLink>
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
                <span
                  style={deleteButtonWrapperStyle}
                  tabIndex={mission.assignmentCount > 0 ? 0 : undefined}
                  onMouseEnter={() => {
                    if (mission.assignmentCount > 0) {
                      setDisabledDeleteTooltipMissionId(mission.id);
                    }
                  }}
                  onMouseLeave={() => {
                    if (disabledDeleteTooltipMissionId === mission.id) {
                      setDisabledDeleteTooltipMissionId(null);
                    }
                  }}
                  onFocus={() => {
                    if (mission.assignmentCount > 0) {
                      setDisabledDeleteTooltipMissionId(mission.id);
                    }
                  }}
                  onBlur={() => {
                    if (disabledDeleteTooltipMissionId === mission.id) {
                      setDisabledDeleteTooltipMissionId(null);
                    }
                  }}
                >
                  <HoverButton
                    type="button"
                    onClick={() => handleDeleteMission(mission)}
                    style={
                      mission.assignmentCount > 0
                        ? disabledDangerButtonStyle
                        : dangerButtonStyle
                    }
                    hoverStyle={dangerHover}
                    disabled={
                      mission.assignmentCount > 0 || deletingMissionId === mission.id
                    }
                    aria-label={`Delete mission ${mission.title}`}
                    aria-describedby={
                      mission.assignmentCount > 0
                        ? `delete-mission-tooltip-${mission.id}`
                        : undefined
                    }
                  >
                    {deletingMissionId === mission.id ? "Deleting..." : "Delete"}
                  </HoverButton>
                  {disabledDeleteTooltipMissionId === mission.id ? (
                    <span
                      id={`delete-mission-tooltip-${mission.id}`}
                      role="tooltip"
                      style={disabledDeleteTooltipStyle}
                    >
                      Assigned missions cannot be deleted.
                    </span>
                  ) : null}
                </span>
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

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#B42318",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const deleteButtonWrapperStyle: React.CSSProperties = {
  display: "inline-flex",
  position: "relative",
};

const disabledDangerButtonStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  background: "#E5E7EB",
  color: "#6B7280",
  cursor: "default",
  pointerEvents: "none",
};

const disabledDeleteTooltipStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 8px)",
  zIndex: 20,
  padding: "6px 8px",
  background: "#111827",
  color: "#FFFFFF",
  borderRadius: 6,
  boxShadow: "0 8px 20px rgba(17, 24, 39, 0.18)",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
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
