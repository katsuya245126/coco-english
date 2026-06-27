"use client";

/**
 * Progressive in-order 3-tier hint disclosure (FLOW-07, D-07/D-08).
 *
 * Reveals hints strictly tier1 -> tier2 -> tier3. Each reveal calls
 * onReveal(nextLevel), whose parent handler invokes revealHintAction
 * to record the reveal (record-only, D-08 — never blocks completion).
 * The parent shell does NOT read hintLevel for step advancement.
 *
 * Disclosure a11y: button aria-expanded toggles, unrevealed tier
 * containers have aria-hidden="true". Button text always reflects
 * state alongside visible tier labels.
 */

import type { HintLadder } from "@/domain/mission/schemas";
import { hintCardStyle } from "@/components/student/styles";

type HintRevealerProps = {
  hintLadder: HintLadder;
  hintLevel: number;
  onReveal: (nextLevel: number) => void;
};

const TIER_LABELS = [
  { key: "tier1" as const, label: "Hint: Pattern" },
  { key: "tier2" as const, label: "Hint: Word bank" },
  { key: "tier3" as const, label: "Hint: Full example" },
];

export function HintRevealer({
  hintLadder,
  hintLevel,
  onReveal,
}: HintRevealerProps) {
  const allRevealed = hintLevel >= 3;

  function handleReveal() {
    if (!allRevealed) {
      onReveal(hintLevel + 1);
    }
  }

  // Button text: D-07 strict order disclosure
  const buttonText =
    hintLevel === 0
      ? "Need a hint?"
      : hintLevel < 3
        ? "More hints"
        : "All hints shown";

  return (
    <div>
      {/* Reveal button */}
      <button
        type="button"
        onClick={handleReveal}
        disabled={allRevealed}
        aria-expanded={hintLevel > 0}
        style={{
          background: "none",
          border: "none",
          padding: "10px 0",
          minHeight: 44,
          fontSize: 14,
          fontWeight: 600,
          color: allRevealed ? "#6B7280" : "#2563EB",
          cursor: allRevealed ? "default" : "pointer",
        }}
      >
        {buttonText}
      </button>

      {/* Hint tiers — revealed in strict order */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TIER_LABELS.map((tier, index) => {
          const tierNumber = index + 1;
          const isRevealed = hintLevel >= tierNumber;

          return (
            <div
              key={tier.key}
              aria-hidden={!isRevealed}
              style={{
                ...hintCardStyle,
                display: isRevealed ? "block" : "none",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#4B5563",
                  margin: "0 0 4px",
                  lineHeight: 1.4,
                }}
              >
                {tier.label}
              </p>
              <p
                style={{
                  fontSize: 16,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {hintLadder[tier.key]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
