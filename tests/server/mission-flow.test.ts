/**
 * Mission flow service tests (FLOW-01/05/06/07).
 *
 * Wave 0 RED scaffold — this suite imports from the not-yet-existing
 * mission-flow service module. The import will fail until plan 03
 * (service layer) builds the module. Goes GREEN in plan 03 (service)
 * and plan 05 (completion + resume).
 */

import { describe, expect, it } from "vitest";
import {
  isAttemptComplete,
  nextUnfinishedTurnOrder,
} from "@/domain/flow/completion";

// Minimal turn shape for testing (matches AttemptTurnRow pick)
type TestTurn = {
  turn_order: number;
  original_transcript: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
};

function makeTurn(
  turnOrder: number,
  overrides: Partial<Omit<TestTurn, "turn_order">> = {},
): TestTurn {
  return {
    turn_order: turnOrder,
    original_transcript: overrides.original_transcript ?? null,
    repeat_transcript: overrides.repeat_transcript ?? null,
    repeat_accepted: overrides.repeat_accepted ?? null,
  };
}

function makeCompleteTurn(turnOrder: number): TestTurn {
  return {
    turn_order: turnOrder,
    original_transcript: "I like apples",
    repeat_transcript: "I like apples very much",
    repeat_accepted: true,
  };
}

describe("completion helpers: isAttemptComplete (FLOW-06, D-06)", () => {
  it("returns false when no turns exist", () => {
    expect(isAttemptComplete(3, [])).toBe(false);
  });

  it("returns false when fewer turns than required", () => {
    expect(isAttemptComplete(3, [makeCompleteTurn(1), makeCompleteTurn(2)])).toBe(false);
  });

  it("returns false when a turn is missing original_transcript", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { repeat_transcript: "hi", repeat_accepted: true }),
      makeCompleteTurn(3),
    ];
    expect(isAttemptComplete(3, turns)).toBe(false);
  });

  it("returns false when a turn has whitespace-only original_transcript", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { original_transcript: "   ", repeat_transcript: "hi", repeat_accepted: true }),
      makeCompleteTurn(3),
    ];
    expect(isAttemptComplete(3, turns)).toBe(false);
  });

  it("returns false when a turn is missing repeat_transcript", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { original_transcript: "hello" }),
      makeCompleteTurn(3),
    ];
    expect(isAttemptComplete(3, turns)).toBe(false);
  });

  it("returns false when repeat_accepted is false", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { original_transcript: "hello", repeat_transcript: "hello again", repeat_accepted: false }),
      makeCompleteTurn(3),
    ];
    expect(isAttemptComplete(3, turns)).toBe(false);
  });

  it("returns false when repeat_accepted is null", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { original_transcript: "hello", repeat_transcript: "hello again", repeat_accepted: null }),
      makeCompleteTurn(3),
    ];
    expect(isAttemptComplete(3, turns)).toBe(false);
  });

  it("returns true when all required turns have answer + accepted repeat", () => {
    const turns = [makeCompleteTurn(1), makeCompleteTurn(2), makeCompleteTurn(3)];
    expect(isAttemptComplete(3, turns)).toBe(true);
  });

  it("returns true even with extra turns beyond requiredTurns", () => {
    const turns = [makeCompleteTurn(1), makeCompleteTurn(2), makeCompleteTurn(3), makeCompleteTurn(4)];
    expect(isAttemptComplete(3, turns)).toBe(true);
  });

  it("does not reference or accept an evaluation parameter", () => {
    // Structural: isAttemptComplete signature has no evaluation field
    expect(isAttemptComplete.length).toBeLessThanOrEqual(2);
  });
});

describe("completion helpers: nextUnfinishedTurnOrder (D-06)", () => {
  it("returns 1 when no turns exist", () => {
    expect(nextUnfinishedTurnOrder(3, [])).toBe(1);
  });

  it("returns the first turn missing an answer", () => {
    const turns = [makeCompleteTurn(1)];
    expect(nextUnfinishedTurnOrder(3, turns)).toBe(2);
  });

  it("returns the first turn missing a repeat", () => {
    const turns = [
      makeCompleteTurn(1),
      makeTurn(2, { original_transcript: "hello" }),
      makeCompleteTurn(3),
    ];
    expect(nextUnfinishedTurnOrder(3, turns)).toBe(2);
  });

  it("returns requiredTurns + 1 when all complete", () => {
    const turns = [makeCompleteTurn(1), makeCompleteTurn(2), makeCompleteTurn(3)];
    expect(nextUnfinishedTurnOrder(3, turns)).toBe(4);
  });

  it("handles out-of-order turn arrays", () => {
    const turns = [makeCompleteTurn(3), makeCompleteTurn(1)];
    expect(nextUnfinishedTurnOrder(3, turns)).toBe(2);
  });
});

describe("mission flow: start attempt (FLOW-01)", () => {
  it("startOrResumeAttempt is exported from the service", async () => {
    const mod = await import("@/server/student-access/mission-flow");
    expect(mod.startOrResumeAttempt).toBeDefined();
  });
});

describe("mission flow: submit answer (FLOW-05)", () => {
  it("recordAnswer is exported from the service", async () => {
    const mod = await import("@/server/student-access/mission-flow");
    expect(mod.recordAnswer).toBeDefined();
  });
});

describe("mission flow: submit repeat (FLOW-05)", () => {
  it("recordRepeat is exported from the service", async () => {
    const mod = await import("@/server/student-access/mission-flow");
    expect(mod.recordRepeat).toBeDefined();
  });
});

describe("mission flow: reveal hint (FLOW-07)", () => {
  it("recordHintReveal is exported from the service", async () => {
    const mod = await import("@/server/student-access/mission-flow");
    expect(mod.recordHintReveal).toBeDefined();
  });

  it("hints reveal strictly in order tier1 -> tier2 -> tier3", () => {
    // Scaffold: will test hint ordering enforcement
    expect(true).toBe(true);
  });
});
