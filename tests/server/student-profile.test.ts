import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStudentSoundProfile } from "@/server/teacher/student-profile";

let profileClient: { from: ReturnType<typeof vi.fn> };

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerClient: () => profileClient,
}));

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

describe("getStudentSoundProfile", () => {
  let eqCalls: Array<{ table: string; column: string; value: unknown }>;

  beforeEach(() => {
    vi.resetModules();
    eqCalls = [];
    const rowsByTable = {
      pronunciation_scores: [
        {
          reference_text: "red",
          word_scores: [
            {
              word: "red",
              accuracyScore: 20,
              errorType: "Mispronunciation",
              phonemes: [{ phoneme: "r", accuracyScore: 20 }],
            },
          ],
        },
      ],
      pronunciation_word_tries: [
        {
          try_number: 1,
          transcript: "river",
          audio_clips: {
            pronunciation_scores: [
              {
                word_scores: [
                  {
                    word: "river",
                    accuracyScore: 20,
                    errorType: "Mispronunciation",
                    phonemes: [{ phoneme: "r", accuracyScore: 20 }],
                  },
                ],
              },
            ],
          },
        },
        {
          try_number: 1,
          transcript: "road",
          audio_clips: {
            pronunciation_scores: [
              {
                word_scores: [
                  {
                    word: "road",
                    accuracyScore: 20,
                    errorType: "Mispronunciation",
                    phonemes: [{ phoneme: "r", accuracyScore: 20 }],
                  },
                ],
              },
            ],
          },
        },
        {
          try_number: 1,
          transcript: "right",
          audio_clips: {
            pronunciation_scores: [
              {
                word_scores: [
                  {
                    word: "right",
                    accuracyScore: 20,
                    errorType: "Mispronunciation",
                    phonemes: [{ phoneme: "r", accuracyScore: 20 }],
                  },
                ],
              },
            ],
          },
        },
        {
          try_number: 1,
          transcript: "rain",
          audio_clips: {
            pronunciation_scores: [
              {
                word_scores: [
                  {
                    word: "rain",
                    accuracyScore: 20,
                    errorType: "Mispronunciation",
                    phonemes: [{ phoneme: "r", accuracyScore: 20 }],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    profileClient = {
      from: vi.fn((table: keyof typeof rowsByTable) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (column: string, value: unknown) => {
          eqCalls.push({ table, column, value });
          return chain;
        };
        chain.is = () => chain;
        chain.then = (resolve: (value: unknown) => void) =>
          Promise.resolve({ data: rowsByTable[table], error: null }).then(resolve);
        return chain;
      }),
    };
  });

  it("adds only pronunciation try one to the existing mission profile", async () => {
    const { getStudentSoundProfile } = await import("@/server/teacher/student-profile");

    const result = await getStudentSoundProfile("student-1", "teacher-1");

    expect(result[0]).toMatchObject({ label: "r", weakCount: 5, totalCount: 5 });
    expect(profileClient.from).toHaveBeenCalledWith("pronunciation_word_tries");
  });

  it("excludes mission clips marked as no speech in the score query", async () => {
    const { getStudentSoundProfile } = await import("@/server/teacher/student-profile");

    await getStudentSoundProfile("student-1", "teacher-1");

    expect(eqCalls).toContainEqual({
      table: "pronunciation_scores",
      column: "audio_clips.teacher_marked_no_speech",
      value: false,
    });
  });
});
