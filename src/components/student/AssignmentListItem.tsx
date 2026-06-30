"use client";

import type { StudentAssignmentListItem } from "@/server/student-access/assignment-list";
import {
  badgeStartStyle,
  badgeContinueStyle,
  badgeDoneStyle,
  badgeLateStyle,
  badgeRetryStyle,
  labelStyle,
} from "@/components/student/styles";
import type { CSSProperties } from "react";

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

const doneCardStyle: CSSProperties = {
  ...cardStyle,
  background: "#F9FAFB",
  border: "1px solid #E5E7EB",
  opacity: 0.75,
};

const linkCardStyle: CSSProperties = {
  ...cardStyle,
  display: "block",
  textDecoration: "none",
  color: "inherit",
};

const row1Style: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "#111827",
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

const row2Style: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 4,
};

const metaStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "#4B5563",
  margin: 0,
};

const BADGE_STYLES: Record<
  StudentAssignmentListItem["displayStatus"],
  CSSProperties
> = {
  start: badgeStartStyle,
  continue: badgeContinueStyle,
  retry: badgeRetryStyle,
  done: badgeDoneStyle,
  late: badgeLateStyle,
};

const BADGE_LABELS: Record<
  StudentAssignmentListItem["displayStatus"],
  string
> = {
  start: "Start",
  continue: "Continue",
  retry: "↻ Retry",
  done: "Done",
  late: "Late",
};

function formatDueDate(dueAt: string | null): string {
  if (!dueAt) return "No deadline";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "No deadline";
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function AssignmentListItem({
  item,
}: {
  item: StudentAssignmentListItem;
}) {
  const badge = (
    <span style={BADGE_STYLES[item.displayStatus]}>
      {BADGE_LABELS[item.displayStatus]}
    </span>
  );

  const meta = (
    <div style={row2Style}>
      <span style={metaStyle}>{item.turnCount} turns</span>
      <span style={metaStyle}>{formatDueDate(item.dueAt)}</span>
    </div>
  );

  const isLaunchable =
    item.displayStatus === "start" ||
    item.displayStatus === "continue" ||
    item.displayStatus === "retry" ||
    item.displayStatus === "late";

  if (isLaunchable) {
    return (
      <a
        href={`/student/missions/${item.assignmentStudentId}`}
        style={linkCardStyle}
      >
        <div style={row1Style}>
          <p style={titleStyle}>{item.title}</p>
          {badge}
        </div>
        {meta}
      </a>
    );
  }

  return (
    <div style={doneCardStyle}>
      <div style={row1Style}>
        <p style={titleStyle}>{item.title}</p>
        {badge}
      </div>
      {meta}
    </div>
  );
}
