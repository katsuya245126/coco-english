import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type Operation = {
  table: string;
  action: "select" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createMockSupabase(options: { cacheRow?: unknown } = {}) {
  const operations: Operation[] = [];
  let cacheRow = options.cacheRow ?? null;
  const upload = vi.fn(async () => ({ error: null }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://signed.example/tts-audio/pronunciation.mp3" },
    error: null,
  }));

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };
    const query = {
      select: vi.fn(() => query),
      update: vi.fn((payload: unknown) => {
        operation.action = "update";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      upsert: vi.fn((payload: unknown) => {
        operation.action = "upsert";
        operation.payload = payload;
        operations.push(operation);
        cacheRow = {
          id: "cache-1",
          ...(payload as Record<string, unknown>),
        };
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        operations.push(operation);
        return { data: cacheRow, error: null };
      }),
    };
    return query;
  }

  return {
    operations,
    storage: {
      from: vi.fn(() => ({ upload, createSignedUrl })),
    },
    upload,
    createSignedUrl,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

const wordInput = {
  word: "fish",
  phones: ["F", "IH1", "SH"],
};

describe("pronunciation word audio", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
    process.env.AZURE_SPEECH_KEY = "test-key";
    process.env.AZURE_SPEECH_REGION = "test-region";
  });

  it("changes the server cache hash when phones or render metadata change", async () => {
    const {
      buildPronunciationWordAudioSpec,
      PRONUNCIATION_WORD_AUDIO,
    } = await import("@/server/audio/pronunciation-word-audio");

    const base = buildPronunciationWordAudioSpec(wordInput);
    expect(
      buildPronunciationWordAudioSpec({
        ...wordInput,
        phones: ["F", "IH0", "SH"],
      }).contentHash,
    ).not.toBe(base.contentHash);
    expect(
      buildPronunciationWordAudioSpec({
        ...wordInput,
        voice: "en-US-JennyNeural",
      }).contentHash,
    ).not.toBe(base.contentHash);
    expect(
      buildPronunciationWordAudioSpec({
        ...wordInput,
        format: "audio-24khz-96kbitrate-mono-mp3",
      }).contentHash,
    ).not.toBe(base.contentHash);
    expect(
      buildPronunciationWordAudioSpec({
        ...wordInput,
        schemaVersion: PRONUNCIATION_WORD_AUDIO.schemaVersion + 1,
      }).contentHash,
    ).not.toBe(base.contentHash);
  });

  it("renders bounded Azure SSML with the approved voice and output format", async () => {
    const { getOrCreatePronunciationWordAudio } = await import(
      "@/server/audio/pronunciation-word-audio"
    );
    const render = vi.fn(async (input: {
      ssml: string;
      voice: string;
      outputFormat: string;
    }) => {
      expect(input.voice).toBe("en-US-AvaNeural");
      expect(input.outputFormat).toBe("audio-24khz-48kbitrate-mono-mp3");
      expect(input.ssml).toContain('<voice name="en-US-AvaNeural">');
      expect(input.ssml).toContain('alphabet="sapi" ph="f ih1 sh"');
      expect(input.ssml).toContain(">fish</phoneme>");
      expect(input.ssml).not.toContain("student");
      return {
        ok: true as const,
        audio: new Blob(["fake-mp3"], { type: "audio/mpeg" }),
        mimeType: "audio/mpeg" as const,
      };
    });

    const result = await getOrCreatePronunciationWordAudio(wordInput, {
      render,
    });

    expect(result).toMatchObject({
      ok: true,
      cacheStatus: "miss",
      mimeType: "audio/mpeg",
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("tts-audio");
  });

  it("reuses the cache for identical word and pronunciation input", async () => {
    const { getOrCreatePronunciationWordAudio } = await import(
      "@/server/audio/pronunciation-word-audio"
    );
    const render = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const first = await getOrCreatePronunciationWordAudio(wordInput, { render });
    const second = await getOrCreatePronunciationWordAudio(wordInput, { render });

    expect(first).toMatchObject({ ok: true, cacheStatus: "miss" });
    expect(second).toMatchObject({ ok: true, cacheStatus: "hit" });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("warms unique words without counting duplicate inputs as failures", async () => {
    const { warmPronunciationWordAudio } = await import(
      "@/server/audio/pronunciation-word-audio"
    );
    const render = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await warmPronunciationWordAudio(
      { words: [wordInput, wordInput] },
      { render },
    );

    expect(result).toEqual({ ok: true, warmed: 1, skipped: 0, failed: 0 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not write a cache row when Azure rendering fails", async () => {
    const { getOrCreatePronunciationWordAudio } = await import(
      "@/server/audio/pronunciation-word-audio"
    );
    const render = vi.fn(async () => ({
      ok: false as const,
      error: "provider_failed" as const,
    }));

    const result = await getOrCreatePronunciationWordAudio(wordInput, { render });

    expect(result).toEqual({ ok: false, error: "provider_failed" });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "tts_audio_cache" && operation.action === "upsert",
      ),
    ).toBe(false);
  });

  it("signs only the cache row resolved from server-side word data", async () => {
    const {
      buildPronunciationWordAudioSpec,
      signPronunciationWordAudio,
    } = await import("@/server/audio/pronunciation-word-audio");
    const spec = buildPronunciationWordAudioSpec(wordInput);
    mockSupabase = createMockSupabase({
      cacheRow: {
        id: "cache-1",
        content_hash: spec.contentHash,
        object_key: "azure_speech/pronunciation-word-v1/hash.mp3",
        mime_type: "audio/mpeg",
      },
    });

    const result = await signPronunciationWordAudio({
      ...wordInput,
      contentHash: "forged-hash",
    });

    expect(result).toMatchObject({ ok: true, contentHash: spec.contentHash });
    const lookup = mockSupabase.operations.find(
      (operation) => operation.table === "tts_audio_cache",
    );
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([["content_hash", spec.contentHash]]),
    );
    expect(lookup?.filters).not.toEqual(
      expect.arrayContaining([["content_hash", "forged-hash"]]),
    );
    expect(mockSupabase.createSignedUrl).toHaveBeenCalledWith(
      "azure_speech/pronunciation-word-v1/hash.mp3",
      3600,
    );
  });
});
