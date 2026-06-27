"use client";

import type { StudentAssignmentListItem } from "@/server/student-access/assignment-list";
import {
  badgeStartStyle,
  badgeContinueStyle,
  badgeDoneStyle,
  badgeClosedStyle,
  bodyStyle,
  labelStyle,
} from "@/components/student/styles";
import type { CSSProperties } from "react";

// UI-SPEC verbatim copy.
const CLOSED_EXPLANATION =
  "This homework is not open right now. Ask your teacher what to do next.";

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
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

const closedExplanationStyle: CSSProperties = {
  ...bodyStyle,
  fontSize: 14,
  color: "#6B7280",
  marginTop: 8,
  marginBottom: 0,
};

const BADGE_STYLES: Record<
  StudentAssignmentListItem["displayStatus"],
  CSSProperties
> = {
  start: badgeStartStyle,
  continue: badgeContinueStyle,
  done: badgeDoneStyle,
  closed: badgeClosedStyle,
};

const BADGE_LABELS: Record<
  StudentAssignmentListItem["displayStatus"],
  string
> = {
  start: "Start",
  continue: "Continue",
  done: "Done",
  closed: "Closed",
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
    item.displayStatus === "start" || item.displayStatus === "continue";

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
    <div style={cardStyle}>
      <div style={row1Style}>
        <p style={titleStyle}>{item.title}</p>
        {badge}
      </div>
      {meta}
      {item.displayStatus === "closed" && (
        <p style={closedExplanationStyle}>{CLOSED_EXPLANATION}</p>
      )}
    </div>
  );
}
