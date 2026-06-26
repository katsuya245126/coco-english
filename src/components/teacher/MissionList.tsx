"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AssignableClass } from "@/server/mission/assign-service";
import type { TeacherMission } from "@/server/mission/mission-service";
import { AssignDialog } from "@/components/teacher/AssignDialog";

type MissionListProps = {
  missions: TeacherMission[];
  assignableClasses: AssignableClass[];
};

export function MissionList({ missions, assignableClasses }: MissionListProps) {
  const [assigningMission, setAssigningMission] = useState<TeacherMission | null>(
    null,
  );
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss success message after 5 seconds (UI-SPEC requirement)
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  return (
    <div>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Missions</h1>
        <Link href="/teacher/missions/new" style={primaryLinkStyle}>
          Create mission
        </Link>
      </div>

      {success ? (
        <p aria-live="polite" style={successStyle}>
          {success}
        </p>
      ) : null}

      {missions.length === 0 ? (
        <section aria-label="Mission list" style={emptyStyle}>
          <h2 style={headingStyle}>No missions yet</h2>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: "#4B5563", margin: "8px 0 24px" }}>
            Create your first mission to assign speaking homework to a class.
          </p>
          <Link href="/teacher/missions/new" style={primaryLinkStyle}>
            Create mission
          </Link>
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
                <Link href={`/teacher/missions/${mission.id}`} style={secondaryLinkStyle}>
                  Edit
                </Link>
                {assignableClasses.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAssigningMission(mission)}
                    style={primaryButtonStyle}
                  >
                    Assign to class
                  </button>
                ) : (
                  <span style={{ fontSize: 14, color: "#6B7280", alignSelf: "center" }}>
                    You have no classes with active students. Create a class and add students first.
                  </span>
                )}
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
  overflow: "hidden",
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
};

const successStyle: React.CSSProperties = {
  color: "#177245",
  fontSize: 14,
  margin: "0 0 16px",
};
