import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type Operation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createMockSupabase(
  options: {
    assignmentFound?: boolean;
    studentId?: string;
    cacheRow?: unknown;
    uploadError?: Error | null;
    signedUrlError?: Error | null;
  } = {},
) {
  const operations: Operation[] = [];
  let cacheRow: unknown = options.cacheRow ?? null;
  let activeClaim: string | null = null;
  let claimSequence = 0;
  const upload = vi.fn(async () => ({
    error: options.uploadError ?? null,
  }));
  const createSignedUrl = vi.fn(async () => ({
    data: options.signedUrlError
      ? null
      : { signedUrl: "https://signed.example/tts-audio/object-key" },
    error: options.signedUrlError ?? null,
  }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_tts_audio_generation") {
      if (cacheRow || activeClaim) {
        return {
          data: [{ acquired: false, owner_token: null, lease_expires_at: null }],
          error: null,
        };
      }
      activeClaim = `token-${++claimSequence}`;
      return {
        data: [{ acquired: true, owner_token: activeClaim, lease_expires_at: new Date().toISOString() }],
        error: null,
      };
    }
    if (name === "finalize_tts_audio_generation") {
      const objectKey = String(args.p_object_key);
      const mimeType = String(args.p_mime_type);
      cacheRow = {
        id: "cache-1",
        object_key: objectKey,
        mime_type: mimeType,
      };
      activeClaim = null;
      return { data: [{ finalized: true, object_key: objectKey, mime_type: mimeType }], error: null };
    }
    if (name === "release_tts_audio_generation") {
      activeClaim = null;
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };

    const query = {
      select: vi.fn(() => query),
      insert: vi.fn((payload: unknown) => {
        operation.action = "insert";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
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
        if (table === "tts_audio_cache") {
          cacheRow = payload;
        }
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        operations.push(operation);
        if (table === "assignment_students") {
          return {
            data:
              options.assignmentFound === false
                ? null
                : {
                    id: "as-1",
                    student_id: options.studentId ?? "student-1",
                  },
            error: null,
          };
        }
        if (table === "tts_audio_cache") {
          return { data: cacheRow, error: null };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (!operations.includes(operation)) operations.push(operation);
        if (table === "tts_audio_cache") {
          return { data: cacheRow ?? { id: "cache-1" }, error: null };
        }
        return { data: null, error: null };
      }),
    };

    return query;
  }

  return {
    operations,
    rpc,
    storage: {
      from: vi.fn(() => ({ upload, createSignedUrl })),
    },
    upload,
    createSignedUrl,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

function baseInput() {
  return {
    studentId: "student-1",
    assignmentStudentId: "as-1",
    characterId: "default-buddy",
    voice: "marin",
    text: "Good job! Ready for the next one?",
  };
}

describe("getOrCreateTtsAudio (VOICE-03)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("returns cacheStatus miss on first request and calls the provider exactly once", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toMatchObject({ ok: true, cacheStatus: "miss" });
    expect(fakeGenerateTtsAudio).toHaveBeenCalledTimes(1);
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("tts-audio");
  });

  it("returns cacheStatus hit on the second identical request with exactly one provider call total", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const first = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });
    expect(first).toMatchObject({ ok: true, cacheStatus: "miss" });

    const second = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(second).toMatchObject({ ok: true, cacheStatus: "hit" });
    expect(fakeGenerateTtsAudio).toHaveBeenCalledTimes(1);
  });

  it("checks assignment_students.id and student_id ownership before generation", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    const assignmentLookup = mockSupabase.operations.find(
      (operation) => operation.table === "assignment_students",
    );
    expect(assignmentLookup?.filters).toEqual(
      expect.arrayContaining([
        ["id", "as-1"],
        ["student_id", "student-1"],
      ]),
    );
  });

  it("returns not_found and never calls the provider when assignment ownership does not match", async () => {
    mockSupabase = createMockSupabase({ assignmentFound: false });
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(fakeGenerateTtsAudio).not.toHaveBeenCalled();
  });

  it("returns a non-blocking failure and does not insert a cache row when provider generation fails (D-15)", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: false as const,
      error: "provider_failed" as const,
    }));

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: false, error: "generation_failed" });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "tts_audio_cache" &&
          (operation.action === "insert" || operation.action === "upsert"),
      ),
    ).toBe(false);
  });

  it("releases the claim when generation throws unexpectedly", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => {
      throw new Error("unexpected provider failure");
    });

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: false, error: "generation_failed" });
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "release_tts_audio_generation",
      expect.objectContaining({ p_owner_token: expect.any(String) }),
    );
  });

  it("returns a non-blocking failure and does not insert a cache row when storage upload fails", async () => {
    mockSupabase = createMockSupabase({
      uploadError: new Error("storage unavailable"),
    });
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: false, error: "storage_failed" });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "tts_audio_cache" &&
          (operation.action === "insert" || operation.action === "upsert"),
      ),
    ).toBe(false);
  });

  it("never sends transcript fields to TTS and never trusts a client-supplied content hash", async () => {
    const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async (_input: unknown) => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    await getOrCreateTtsAudio(
      {
        ...baseInput(),
        // Even if a caller attempts to pass these fields, the service must not
        // forward them to the provider or trust a forged hash.
        contentHash: "forged-hash",
        transcript: "student said this",
      } as unknown as Parameters<typeof getOrCreateTtsAudio>[0],
      { generateTtsAudio: fakeGenerateTtsAudio },
    );

    const generateInput = fakeGenerateTtsAudio.mock.calls[0]?.[0];
    expect(generateInput).not.toHaveProperty("transcript");
    expect(generateInput).not.toHaveProperty("contentHash");

    const cacheUpsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "tts_audio_cache" &&
        (operation.action === "insert" || operation.action === "upsert"),
    );
    expect(cacheUpsert?.payload).not.toMatchObject({
      content_hash: "forged-hash",
    });
  });

  it("serves signed URLs from the private tts-audio bucket, not public URLs", async () => {
    const source = await import("@/server/audio/tts-cache");
    expect(typeof source.getOrCreateTtsAudio).toBe("function");

    const { getOrCreateTtsAudio } = source;
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await getOrCreateTtsAudio(baseInput(), {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.audioUrl).toContain("signed");
    }
    expect(mockSupabase.createSignedUrl).toHaveBeenCalled();
  });
});

describe("warmTtsAudioCache", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("warms trusted server-resolved text without assignment ownership lookup or signed URL creation", async () => {
    const { warmTtsAudioCache } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await warmTtsAudioCache({
      characterId: "default-buddy",
      voice: "marin",
      texts: ["What food do you like?"],
    }, {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: true, warmed: 1, skipped: 0, failed: 0 });
    expect(fakeGenerateTtsAudio).toHaveBeenCalledWith({
      text: "What food do you like?",
      voice: "marin",
    });
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "assignment_students",
      ),
    ).toBe(false);
    expect(mockSupabase.createSignedUrl).not.toHaveBeenCalled();
  });

  it("deduplicates blank and repeated warming text so identical lines generate once", async () => {
    const { warmTtsAudioCache } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: true as const,
      audio: new Blob(["fake-mp3-bytes"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg" as const,
    }));

    const result = await warmTtsAudioCache({
      characterId: "default-buddy",
      voice: "marin",
      texts: ["Good job!", " ", "Good job!"],
    }, {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: true, warmed: 1, skipped: 0, failed: 0 });
    expect(fakeGenerateTtsAudio).toHaveBeenCalledTimes(1);
  });

  it("reports provider failures without throwing or writing cache rows", async () => {
    const { warmTtsAudioCache } = await import("@/server/audio/tts-cache");
    const fakeGenerateTtsAudio = vi.fn(async () => ({
      ok: false as const,
      error: "provider_failed" as const,
    }));

    const result = await warmTtsAudioCache({
      characterId: "default-buddy",
      voice: "marin",
      texts: ["What food do you like?"],
    }, {
      generateTtsAudio: fakeGenerateTtsAudio,
    });

    expect(result).toEqual({ ok: true, warmed: 0, skipped: 0, failed: 1 });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "tts_audio_cache" &&
          operation.action === "upsert",
      ),
    ).toBe(false);
  });
});
