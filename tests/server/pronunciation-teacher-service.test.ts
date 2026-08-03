import { describe, expect, it, vi } from "vitest";
import type { PronunciationWordBankEntry } from "@/domain/pronunciation/word-bank.generated";
import { PRONUNCIATION_WORD_BANK } from "@/domain/pronunciation/word-bank.generated";

const entry = (text: string, difficulty: "easy" | "medium" | "hard" = "easy") =>
  ({
    soundId: "s",
    difficulty,
    text,
    targetLetters: "s",
    highlightStart: 0,
    highlightLength: 1,
    targetArpabet: "S",
    phones: ["S", "AE1", "T"],
    targetPhoneIndex: 0,
    cmuVariant: 1,
  }) as PronunciationWordBankEntry;

describe("pronunciation teacher service", () => {
  it("puts weak supported sounds before other supported sounds and marks unsupported sounds unavailable", async () => {
    const { rankPronunciationSoundOptions } = await import(
      "@/server/pronunciation/teacher-service"
    );

    const options = rankPronunciationSoundOptions([
      {
        label: "r",
        ipa: "r",
        weakCount: 5,
        totalCount: 5,
        averageAccuracy: 30,
        exampleWord: "red",
      },
      {
        label: "s",
        ipa: "s",
        weakCount: 5,
        totalCount: 5,
        averageAccuracy: 35,
        exampleWord: "sun",
      },
    ]);

    expect(options.find((option) => option.ipa === "s")?.available).toBe(true);
    expect(options.find((option) => option.ipa === "r")?.available).toBe(false);
    expect(options.findIndex((option) => option.ipa === "s")).toBeLessThan(
      options.findIndex((option) => option.ipa === "f"),
    );
  });

  it("puts the newest weak verified word first and otherwise uses least-recent practice order", async () => {
    const { rankPronunciationWords } = await import(
      "@/server/pronunciation/teacher-service"
    );

    const ranked = rankPronunciationWords(
      [entry("apple"), entry("berry"), entry("cherry")],
      [
        {
          word: "apple",
          outcome: "passed",
          practicedAt: "2026-07-31T00:00:00Z",
        },
        {
          word: "berry",
          outcome: "word_weak",
          practicedAt: "2026-08-02T00:00:00Z",
        },
        {
          word: "cherry",
          outcome: "passed",
          practicedAt: "2026-07-30T00:00:00Z",
        },
      ],
    );

    expect(ranked.map((word) => word.text)).toEqual([
      "berry",
      "cherry",
      "apple",
    ]);
  });

  it("returns not_found before reading suggestions for a foreign student", async () => {
    const { suggestPronunciationWords } = await import(
      "@/server/pronunciation/teacher-service"
    );
    const from = vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return query;
    });

    const result = await suggestPronunciationWords(
      {
        teacherId: "teacher-1",
        studentId: "foreign-student",
        soundId: "s",
        difficulty: "easy",
      },
      {
        supabase: {
          from,
        } as never,
        getStudentSoundProfile: vi.fn(),
      },
    );

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("revalidates every verified word on the server before assigning", async () => {
    const { assignPronunciationPractice } = await import(
      "@/server/pronunciation/teacher-service"
    );
    const rpc = vi.fn();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "student-1",
          class_id: "class-1",
          display_name: "Mina",
          classes: { id: "class-1", name: "Class 1" },
        },
        error: null,
      })),
    };
    const words = PRONUNCIATION_WORD_BANK.filter(
      (word) => word.soundId === "light_l" && word.difficulty === "easy",
    )
      .slice(0, 5)
      .map((word) => ({
        text: word.text,
        source: "verified" as const,
        cmuVariant: word.cmuVariant + (word.text === "lake" ? 1 : 0),
        highlightStart: 99,
        highlightLength: 99,
      }));

    const result = await assignPronunciationPractice(
      {
        teacherId: "teacher-1",
        studentId: "student-1",
        soundId: "light_l",
        difficulty: "easy",
        dueAt: null,
        words,
      },
      {
        supabase: { from: vi.fn(() => query), rpc } as never,
        getOrCreatePronunciationWordAudio: vi.fn(),
      },
    );

    expect(result).toEqual({ ok: false, error: "invalid_word" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops before assignment when one word audio render fails", async () => {
    const { assignPronunciationPractice } = await import(
      "@/server/pronunciation/teacher-service"
    );
    const rpc = vi.fn();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "student-1",
          class_id: "class-1",
          display_name: "Mina",
          classes: { id: "class-1", name: "Class 1" },
        },
        error: null,
      })),
    };
    const words = PRONUNCIATION_WORD_BANK.filter(
      (word) => word.soundId === "light_l" && word.difficulty === "easy",
    )
      .slice(0, 5)
      .map((word) => ({
        text: word.text,
        source: "verified" as const,
        cmuVariant: word.cmuVariant,
        highlightStart: word.highlightStart,
        highlightLength: word.highlightLength,
      }));
    const render = vi.fn(async () => {
      if (render.mock.calls.length === 3) {
        return { ok: false as const, error: "provider_failed" as const };
      }
      return {
        ok: true as const,
        cacheStatus: "miss" as const,
        contentHash: `hash-${render.mock.calls.length}`,
        objectKey: "object.mp3",
        mimeType: "audio/mpeg",
      };
    });

    const result = await assignPronunciationPractice(
      {
        teacherId: "teacher-1",
        studentId: "student-1",
        soundId: "light_l",
        difficulty: "easy",
        dueAt: null,
        words,
      },
      {
        supabase: { from: vi.fn(() => query), rpc } as never,
        getOrCreatePronunciationWordAudio: render,
      },
    );

    expect(result).toEqual({ ok: false, error: "audio_failed" });
    expect(render).toHaveBeenCalledTimes(3);
    expect(rpc).not.toHaveBeenCalled();
  });
});
