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

  it("carries stored ranked candidates into the profile evidence", () => {
    const rows = Array.from({ length: 5 }, () => ({
      reference_text: "fan",
      word_scores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [
            {
              phoneme: "f",
              accuracyScore: 20,
              candidates: [
                { phoneme: "p", score: 0.8 },
                { phoneme: "f", score: 0.2 },
              ],
            },
          ],
        },
      ],
    }));

    expect(buildStudentSoundProfile(rows)[0]).toMatchObject({
      candidate: {
        label: "p",
        ipa: "p",
        count: 5,
        exampleWords: ["fan"],
      },
    });
  });

  it("counts confirmed teacher-added samples with the same observation gate as mission clips", () => {
    const missionRows = Array.from({ length: 4 }, () => ({
      reference_text: "fan",
      word_scores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "f", accuracyScore: 20 }],
        },
      ],
    }));

    expect(
      buildStudentSoundProfile(missionRows, [
        {
          provisional_result: {
            referenceText: "fan",
            wordScores: [
              {
                word: "fan",
                accuracyScore: 20,
                errorType: "Mispronunciation",
                phonemes: [{ phoneme: "f", accuracyScore: 20 }],
              },
            ],
          },
        },
      ]),
    ).toMatchObject([
      {
        label: "f",
        weakCount: 5,
        totalCount: 5,
        evidenceSources: ["Mission", "Teacher-added pronunciation sample"],
      },
    ]);
  });

  it("attributes a teacher sample that contributes a strong observation to the gate", () => {
    const missionRows = Array.from({ length: 4 }, () => ({
      reference_text: "fan",
      word_scores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "f", accuracyScore: 20 }],
        },
      ],
    }));

    expect(
      buildStudentSoundProfile(missionRows, [
        {
          id: "sample-strong",
          provisional_result: {
            referenceText: "fan",
            wordScores: [
              {
                word: "fan",
                accuracyScore: 90,
                errorType: "None",
                phonemes: [{ phoneme: "f", accuracyScore: 90 }],
              },
            ],
          },
        },
      ]),
    ).toMatchObject([
      {
        label: "f",
        weakCount: 4,
        totalCount: 5,
        evidenceSources: ["Mission", "Teacher-added pronunciation sample"],
        teacherSampleIds: ["sample-strong"],
      },
    ]);
  });
});
