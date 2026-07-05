"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreMissionAction } from "@/app/teacher/missions/actions";
import type { TeacherMission } from "@/server/mission/mission-service";
import { HoverButton } from "@/components/ui/HoverButton";
import { secondaryHover } from "@/components/ui/hover-styles";

type ArchivedMissionListProps = {
  missions: TeacherMission[];
};

export function ArchivedMissionList({ missions }: ArchivedMissionListProps) {
  const router = useRouter();
  const [restoringMissionId, setRestoringMissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(mission: TeacherMission) {
    setError(null);
    setRestoringMissionId(mission.id);
    const result = await restoreMissionAction(mission.id);
    setRestoringMissionId(null);

    if (result.ok) {
      router.refresh();
      return;
    }

    setError(result.error);
  }

  return (
    <div>
      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}

      {missions.length === 0 ? (
        <section aria-label="Archived mission list" style={emptyStyle}>
          <h2 style={headingStyle}>No archived missions</h2>
          <p style={emptyTextStyle}>Archived mission templates will appear here.</p>
        </section>
      ) : (
        <section aria-label="Archived mission list" style={listStyle}>
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
                <p style={missionTitleStyle}>{mission.title}</p>
                <p style={metaStyle}>
                  {mission.level} · {mission.turnCount} turn
                  {mission.turnCount === 1 ? "" : "s"} · {mission.assignmentCount} active assignment
                  {mission.assignmentCount === 1 ? "" : "s"}
                </p>
              </div>
              <HoverButton
                type="button"
                onClick={() => handleRestore(mission)}
                disabled={restoringMissionId === mission.id}
                style={secondaryButtonStyle}
                hoverStyle={secondaryHover}
              >
                {restoringMissionId === mission.id ? "Restoring..." : "Restore"}
              </HoverButton>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

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

const emptyTextStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
  margin: "8px 0 0",
};

const listStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  overflow: "hidden",
};

const missionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
};

const metaStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: "4px 0 0",
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
};

const errorStyle: React.CSSProperties = {
  color: "#B42318",
  fontSize: 14,
  margin: "0 0 16px",
};
