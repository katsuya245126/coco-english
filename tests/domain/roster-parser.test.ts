import { describe, expect, it } from "vitest";
import {
  normalizeRosterName,
  parseRosterPaste,
} from "@/domain/classroom/roster-parser";

describe("normalizeRosterName", () => {
  it.each([
    ["  Min  Su ", "min su"],
    ["min su", "min su"],
    ["MIN SU", "min su"],
    ["\tMin\tSu\t", "min su"],
    ["Min   Su", "min su"],
  ] as const)("normalizes %j to %j", (input, expected) => {
    expect(normalizeRosterName(input)).toBe(expected);
  });

  it("treats spacing/case variants as equal", () => {
    expect(normalizeRosterName("  Min  Su ")).toBe(normalizeRosterName("min su"));
  });
});

describe("parseRosterPaste", () => {
  it("splits newline-separated names and keeps the saveable set", () => {
    const result = parseRosterPaste("Ava\nBen\nChloe");
    expect(result.names).toEqual(["Ava", "Ben", "Chloe"]);
  });

  it("handles CRLF newlines", () => {
    const result = parseRosterPaste("Ava\r\nBen");
    expect(result.names).toEqual(["Ava", "Ben"]);
  });

  it("reports blank lines instead of silently dropping them", () => {
    const result = parseRosterPaste("Ava\n\n   \nBen");
    // Saveable names exclude the blanks...
    expect(result.names).toEqual(["Ava", "Ben"]);
    // ...but the blanks are surfaced (count > 0), not silently discarded.
    expect(result.blankCount).toBeGreaterThan(0);
  });

  it("reports duplicate normalized names without discarding the information", () => {
    const result = parseRosterPaste("Min Su\nmin  su\nBen");
    expect(result.duplicates.length).toBeGreaterThan(0);
    // The duplicate is reported as the offending raw name.
    expect(result.duplicates).toContain("min  su");
  });

  it("reports no issues for a clean paste", () => {
    const result = parseRosterPaste("Ava\nBen\nChloe");
    expect(result.blankCount).toBe(0);
    expect(result.duplicates).toEqual([]);
  });
});
