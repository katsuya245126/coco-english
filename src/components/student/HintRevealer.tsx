"use client";

// Stub: replaced in Task 3. Exists only so Task 2 compiles.

import type { HintLadder } from "@/domain/mission/schemas";

type HintRevealerProps = {
  hintLadder: HintLadder;
  hintLevel: number;
  onReveal: (nextLevel: number) => void;
};

export function HintRevealer({ hintLevel, onReveal }: HintRevealerProps) {
  return (
    <button type="button" onClick={() => onReveal(hintLevel + 1)} disabled={hintLevel >= 3}>
      {hintLevel === 0 ? "Need a hint?" : hintLevel < 3 ? "More hints" : "All hints shown"}
    </button>
  );
}
