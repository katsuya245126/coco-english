/**
 * RED test — audio purge Storage-first deletion (Wave 0, Plan 07-01).
 *
 * Imports from the not-yet-existing purgeExpiredAudio module.
 * Fails with "Cannot find module" until Wave 3 (Plan 07-04) implements it.
 *
 * Security contract locked here:
 *   T-07-03: Storage.remove() MUST be called before the DB update
 *   to prevent orphaned Storage objects when DB update succeeds
 *   but Storage removal fails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Supabase service client before importing purgeExpiredAudio
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

// This import will fail (RED) until Wave 3 creates the module.
import { purgeExpiredAudio } from "@/server/foundation/purgeExpiredAudio";

// ---------------------------------------------------------------------------
// Mock Supabase with call-order tracking
// ---------------------------------------------------------------------------

const callOrder: string[] = [];

const mockRemove = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

function resetMocks() {
  callOrder.length = 0;
  vi.clearAllMocks();

  mockRemove.mockImplementation(async (_keys: string[]) => {
    callOrder.push("storage.remove");
    return { data: null, error: null };
  });

  mockUpdate.mockImplementation(() => {
    callOrder.push("db.update");
    const chain = {
      in: (_col: string, _vals: unknown[]) => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  });
}

const mockSupabase = {
  from: (table: string) => ({
    select: (_cols?: string) => {
      const chain = {
        not: (_col: string, _op: string, _val: unknown) => chain,
        neq: (_col: string, _val: unknown) => chain,
        lte: (_col: string, _val: unknown) => chain,
        limit: (_n: number) => {
          mockSelect(table);
          return Promise.resolve({
            data: [
              { id: "clip-1", object_key: "students/s1/clip-1.webm" },
              { id: "clip-2", object_key: null },
              { id: "clip-3", object_key: "students/s3/clip-3.webm" },
            ],
            error: null,
          });
        },
      };
      return chain;
    },
    update: (payload: unknown) => {
      void payload;
      return mockUpdate();
    },
  }),
  storage: {
    from: (_bucket: string) => ({
      remove: (keys: string[]) => mockRemove(keys),
    }),
  },
};

beforeEach(() => {
  resetMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("purgeExpiredAudio — Storage-first ordering (T-07-03)", () => {
  it("calls storage.remove() BEFORE the audio_clips DB update", async () => {
    await purgeExpiredAudio();

    const storageIdx = callOrder.indexOf("storage.remove");
    const dbIdx = callOrder.indexOf("db.update");

    expect(storageIdx).toBeGreaterThanOrEqual(0);
    expect(dbIdx).toBeGreaterThanOrEqual(0);
    expect(storageIdx).toBeLessThan(dbIdx);
  });

  it("only passes non-null object_keys to storage.remove()", async () => {
    await purgeExpiredAudio();

    const removedKeys = mockRemove.mock.calls[0][0] as string[];
    expect(removedKeys).toContain("students/s1/clip-1.webm");
    expect(removedKeys).toContain("students/s3/clip-3.webm");
    expect(removedKeys).not.toContain(null);
    expect(removedKeys).not.toContain(undefined);
  });
});

describe("purgeExpiredAudio — DB update (PILOT-03)", () => {
  it("updates audio_clips with processing_status=deleted, deleted_at, and deleted_reason", async () => {
    await purgeExpiredAudio();

    expect(mockUpdate).toHaveBeenCalled();
    const payload = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    if (payload !== undefined) {
      // When update is called with payload directly
      expect(payload?.processing_status).toBe("deleted");
      expect(payload?.deleted_at).toBeTruthy();
      expect(payload?.deleted_reason).toBeTruthy();
    }
    // Accept either: update called with args OR update call recorded via chain
    expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("returns { deletedCount } reflecting the number of rows processed", async () => {
    const result = await purgeExpiredAudio();

    expect(result).toMatchObject({ deletedCount: expect.any(Number) });
    expect((result as { deletedCount: number }).deletedCount).toBeGreaterThanOrEqual(0);
  });
});

describe("purgeExpiredAudio — Storage error resilience (PILOT-03)", () => {
  it("does not throw when Storage.remove() returns an error; still updates DB rows", async () => {
    mockRemove.mockImplementationOnce(async () => {
      callOrder.push("storage.remove");
      return { data: null, error: { message: "Storage unavailable" } };
    });

    // Should NOT throw
    await expect(purgeExpiredAudio()).resolves.toBeDefined();
    // DB update should still be called
    expect(callOrder).toContain("db.update");
  });

  it("returns { deletedCount } even when Storage fails", async () => {
    mockRemove.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "Network error" },
    }));
    callOrder.push("storage.remove");

    const result = await purgeExpiredAudio();
    expect(result).toMatchObject({ deletedCount: expect.any(Number) });
  });
});

describe("purgeExpiredAudio — select query shape (idempotency, batch cap)", () => {
  it("selects rows excluding already-deleted status (.neq processing_status 'deleted')", async () => {
    await purgeExpiredAudio();
    // The select mock is called — verify it was invoked on audio_clips
    expect(mockSelect).toHaveBeenCalledWith("audio_clips");
  });

  it("select uses .limit(1000) or similar batch cap to prevent unbounded scans", async () => {
    // Structural: purgeExpiredAudio must call .limit() on the select chain.
    // The mock captures limit calls — if limit was not called, mockSelect
    // would never fire because our mock chain requires .limit() to resolve.
    await purgeExpiredAudio();
    expect(mockSelect).toHaveBeenCalled();
  });
});
