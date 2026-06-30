"use client";

/**
 * StatusBadge — semantic status pill for assignment_students rows (D-05).
 *
 * Covers all five D-05 bucket statuses including the NEW Phase 7 additions:
 *   - missed      (#FEE2E2 / #991B1B) — error semantic
 *   - needs_retry (#DBEAFE / #1D4ED8) — informational, matches in_progress palette
 *
 * Display only — not interactive (UI-SPEC interaction contract).
 * Uses inline React.CSSProperties only — no Tailwind, shadcn, or icon libraries.
 */

import React from "react";

type StatusBadgeProps = {
  status: string;
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  borderRadius: 9999,
  fontSize: 14,
  fontWeight: 600,
  padding: "4px 8px",
};

function getStatusStyle(status: string): {
  bg: string;
  color: string;
  label: string;
} {
  const s = status.toLowerCase();

  if (s === "completed") {
    return { bg: "#D1FAE5", color: "#065F46", label: "Completed" };
  }
  if (s === "not_started" || s === "assigned" || s === "started") {
    return { bg: "#F3F4F6", color: "#6B7280", label: "Not started" };
  }
  if (s === "missed") {
    return { bg: "#FEE2E2", color: "#991B1B", label: "Missed" };
  }
  if (s === "needs_retry") {
    return { bg: "#DBEAFE", color: "#1D4ED8", label: "Needs retry" };
  }
  if (s === "teacher_review") {
    return { bg: "#FEF3C7", color: "#92400E", label: "Needs your review" };
  }

  // Fallback for unknown statuses
  return { bg: "#F3F4F6", color: "#6B7280", label: status };
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { bg, color, label } = getStatusStyle(status);

  return (
    <span
      style={{
        ...badgeStyle,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}
