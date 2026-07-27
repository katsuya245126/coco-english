import { describe, expect, it, vi } from "vitest";
import type { TranslationHintResponsesClient } from "@/server/ai/translation-hint-generator";

function createFakeClient(outputParsed: unknown): TranslationHintResponsesClient {
  return {
    responses: {
      parse: vi.fn(async () => ({ output_parsed: outputParsed })) as
        TranslationHintResponsesClient["responses"]["parse"],
    },
  };
}

describe("generateTranslationHint", () => {
  it("returns validated Korean semantic phrases from a fake client", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({
      phrases: [
        {
          source: "How often",
          start: 0,
          end: 9,
          translation: "얼마나 자주",
        },
      ],
    });

    const result = await generateTranslationHint(
      {
        sourceText: "How often do you play soccer?",
        studentLevel: "elementary",
        targetLocale: "ko",
      },
      { apiKey: "test-key", model: "test-model", client },
    );

    expect(result).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
        ],
      },
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );
  });

  it("instructs the selector to cover the full line in natural meaning chunks", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({ phrases: [] });

    await generateTranslationHint(
      {
        sourceText:
          "That sounds fun! What game do you like to play after school with Minju?",
        studentLevel: "elementary",
        targetLocale: "ko",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const user = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(user?.content ?? "{}") as {
      instructions?: string[];
    };
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Cover the full sourceText"),
        expect.stringContaining("natural meaning chunks"),
        expect.stringContaining("source order"),
        expect.stringContaining("question"),
        expect.stringContaining("exact substring"),
        expect.stringContaining("Do not translate word by word"),
        expect.stringContaining("2 to 4 chunks per sentence"),
        expect.stringContaining("Do not select a complete sentence"),
      ]),
    );
    expect(prompt.instructions?.join("\n")).not.toContain("zero to three");
    expect(prompt.instructions?.join("\n")).not.toContain(
      "Do not cover every word",
    );
  });

  it("keeps the full-coverage rules in the production prompt source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        process.cwd(),
        "src/server/ai/translation-hint-generator.ts",
      ),
      "utf8",
    );

    expect(source).toContain("Cover the full sourceText");
    expect(source).toContain("natural meaning chunks");
    expect(source).toContain("Do not translate word by word");
    expect(source).toContain("2 to 4 chunks per sentence");
    expect(source).toContain("Do not select a complete sentence");
    expect(source).not.toContain("Return zero to three");
    expect(source).not.toContain("Do not cover every word");
  });

  it("drops provider phrases that are not in the source text", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({
      phrases: [
        { source: "How many", translation: "얼마나 많이" },
        { source: "play soccer", translation: "축구를 하다" },
      ],
    });
    expect(
      await generateTranslationHint(
        {
          sourceText: "How often do you play soccer?",
          studentLevel: "elementary",
          targetLocale: "ko",
        },
        { apiKey: "test-key", client },
      ),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "play soccer",
            start: 17,
            end: 28,
            translation: "축구를 하다",
          },
        ],
      },
    });
  });

  it("returns missing_api_key without calling a provider", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    expect(
      await generateTranslationHint(
        {
          sourceText: "How often do you play soccer?",
          studentLevel: "elementary",
          targetLocale: "ko",
        },
        { apiKey: "" },
      ),
    ).toEqual({ ok: false, error: "missing_api_key" });
  });
});
