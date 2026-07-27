import { beforeEach, describe, expect, it, vi } from "vitest";

type CacheRow = {
  phrases: unknown;
  source_digest: string;
  student_level: string;
  target_locale: string;
};

let cacheRows: CacheRow[];
let selectError: Error | null;
let upsertError: Error | null;
let filters: Array<[string, unknown]>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data:
            cacheRows.find((row) =>
              filters.every(
                ([column, value]) =>
                  row[column as keyof CacheRow] === value,
              ),
            ) ?? null,
          error: selectError,
        })),
        update: vi.fn(() => query),
        upsert: vi.fn(async (payload: CacheRow) => {
          if (!upsertError) cacheRows.push(payload);
          return { error: upsertError };
        }),
      };
      return query;
    }),
  }),
}));

const input = {
  sourceText: "How often do you play soccer?",
  studentLevel: "elementary" as const,
  targetLocale: "ko",
};

const validHint = {
  phrases: [
    {
      source: "How often",
      start: 0,
      end: 9,
      translation: "얼마나 자주",
    },
  ],
};

describe("getOrCreateTranslationHint", () => {
  beforeEach(() => {
    vi.resetModules();
    cacheRows = [];
    filters = [];
    selectError = null;
    upsertError = null;
  });

  it("generates once and hits cache for the same source, level, and locale", async () => {
    const { getOrCreateTranslationHint } = await import(
      "@/server/ai/translation-hint-cache"
    );
    const generate = vi.fn(async () => ({
      ok: true as const,
      hint: validHint,
    }));

    expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
      ok: true,
      cacheStatus: "miss",
    });
    filters = [];
    expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
      ok: true,
      cacheStatus: "hit",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keys lookups by digest, student level, and target locale", async () => {
    const { getOrCreateTranslationHint } = await import(
      "@/server/ai/translation-hint-cache"
    );
    const generate = vi.fn(async () => ({ ok: true as const, hint: validHint }));

    await getOrCreateTranslationHint(input, { generate });

    expect(filters).toEqual(
      expect.arrayContaining([
        ["student_level", "elementary"],
        ["target_locale", "ko"],
      ]),
    );
    expect(filters.find(([column]) => column === "source_digest")?.[1]).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("versions the source digest so short-chunk cached hints are missed", async () => {
    const { createHash } = await import("node:crypto");
    const {
      computeTranslationSourceDigest,
      TRANSLATION_HINT_POLICY_VERSION,
    } = await import("@/server/ai/translation-hint-cache");
    const legacyDigest = createHash("sha256")
      .update(input.sourceText, "utf8")
      .digest("hex");

    expect(TRANSLATION_HINT_POLICY_VERSION).toBe(
      "translation-hint-v4-chunked-full-coverage",
    );
    expect(computeTranslationSourceDigest(input.sourceText)).not.toBe(
      legacyDigest,
    );

    cacheRows.push({
      source_digest: legacyDigest,
      student_level: input.studentLevel,
      target_locale: input.targetLocale,
      phrases: validHint.phrases,
    });
    const generate = vi.fn(async () => ({ ok: true as const, hint: validHint }));
    const { getOrCreateTranslationHint } = await import(
      "@/server/ai/translation-hint-cache"
    );

    expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
      ok: true,
      cacheStatus: "miss",
    });
    filters = [];
    expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
      ok: true,
      cacheStatus: "hit",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("returns cache_failed for select and upsert errors", async () => {
    const { getOrCreateTranslationHint } = await import(
      "@/server/ai/translation-hint-cache"
    );
    const generate = vi.fn(async () => ({ ok: true as const, hint: validHint }));

    selectError = new Error("select failed");
    expect(await getOrCreateTranslationHint(input, { generate })).toEqual({
      ok: false,
      error: "cache_failed",
    });

    selectError = null;
    upsertError = new Error("upsert failed");
    filters = [];
    expect(await getOrCreateTranslationHint(input, { generate })).toEqual({
      ok: false,
      error: "cache_failed",
    });
  });

  it("returns generation_failed when the provider fails", async () => {
    const { getOrCreateTranslationHint } = await import(
      "@/server/ai/translation-hint-cache"
    );
    const generate = vi.fn(async () => ({
      ok: false as const,
      error: "provider_failed" as const,
    }));

    expect(await getOrCreateTranslationHint(input, { generate })).toEqual({
      ok: false,
      error: "generation_failed",
    });
  });

  it("never returns an invalid cached span", async () => {
    const { computeTranslationSourceDigest, getOrCreateTranslationHint } =
      await import("@/server/ai/translation-hint-cache");
    cacheRows.push({
      source_digest: computeTranslationSourceDigest(input.sourceText),
      student_level: input.studentLevel,
      target_locale: input.targetLocale,
      phrases: [
        {
          source: "How many",
          start: 0,
          end: 8,
          translation: "얼마나 많이",
        },
      ],
    });
    const generate = vi.fn(async () => ({ ok: true as const, hint: validHint }));

    expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
      ok: true,
      cacheStatus: "miss",
      hint: validHint,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
