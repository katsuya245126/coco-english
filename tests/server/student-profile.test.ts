import { describe, expect, it } from "vitest";
import { buildStudentSoundProfile } from "@/server/teacher/student-profile";

describe("buildStudentSoundProfile", () => {
  it("scopes to original_answer clips and aggregates weak phonemes", () => {
    const rows = Array.from({ length: 5 }, () => ({
      reference_text: "red",
      word_scores: [
        {
          word: "red",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 20 }],
        },
      ],
    }));

    const result = buildStudentSoundProfile(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "r", weakCount: 5, totalCount: 5 });
  });

  it("treats a null reference_text as an empty transcript (nothing scoped in)", () => {
    const rows = [
      {
        reference_text: null,
        word_scores: [
          {
            word: "red",
            accuracyScore: 20,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: "r", accuracyScore: 20 }],
          },
        ],
      },
    ];
    expect(buildStudentSoundProfile(rows)).toEqual([]);
  });

  it("returns [] for no rows", () => {
    expect(buildStudentSoundProfile([])).toEqual([]);
  });
});
