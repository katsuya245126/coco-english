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
  const maxLevel = 3;
  const allRevealed = hintLevel >= maxLevel;
  const hints = TIER_LABELS.map((tier) => ({
    ...tier,
    content: hintLadder[tier.key],
  }));

  function handleReveal() {
    if (!allRevealed) {
      onReveal(hintLevel + 1);
    }
  }

  // Button text: D-07 strict order disclosure
  const buttonText =
    hintLevel === 0
      ? "💡 Hint"
      : hintLevel < maxLevel
        ? "More help"
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
          width: "100%",
          background: allRevealed ? "#F9FAFB" : "#EFF6FF",
          border: "none",
          borderRadius: 999,
          padding: "8px 12px",
          minHeight: 40,
          fontSize: 15,
          fontWeight: 600,
          color: allRevealed ? "#6B7280" : "#1D4ED8",
          cursor: allRevealed ? "default" : "pointer",
          textAlign: "center",
        }}
      >
        {buttonText}
      </button>

      {/* Hint tiers — revealed in strict order */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hints.map((hint, index) => {
          const tierNumber = index + 1;
          const isRevealed = hintLevel >= tierNumber;

          return (
            <div
              key={hint.key}
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
                {hint.label}
              </p>
              <p
                style={{
                  fontSize: 16,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {hint.content}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
