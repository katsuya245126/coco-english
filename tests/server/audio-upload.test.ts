import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202606270001_student_audio_storage.sql",
);

type Operation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createMockSupabase(options: {
  assignmentFound?: boolean;
  attemptFound?: boolean;
  uploadError?: Error | null;
} = {}) {
  const operations: Operation[] = [];
  const upload = vi.fn(async () => ({
    error: options.uploadError ?? null,
  }));

  function createQuery(table: string) {
    const operation: Operation = {
      table,
      action: "select",
      filters: [],
    };

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
            data: options.assignmentFound === false ? null : { id: "as-1" },
            error: null,
          };
        }
        if (table === "attempts") {
          return {
            data:
              options.attemptFound === false
                ? null
                : { id: "attempt-1", assignment_student_id: "as-1" },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (!operations.includes(operation)) operations.push(operation);
        if (table === "attempt_turns") {
          return { data: { id: "turn-1" }, error: null };
        }
        if (table === "audio_clips") {
          return { data: { id: "clip-1" }, error: null };
        }
        return { data: null, error: null };
      }),
    };

    return query;
  }

  return {
    operations,
    storage: {
      from: vi.fn(() => ({ upload })),
    },
    upload,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

describe("student audio storage migration", () => {
  it("creates the private student-audio bucket", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("student-audio");
    expect(migration).toMatch(/public\s*=\s*false/i);
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });
});

describe("Phase 5 audio database types", () => {
  it("exposes attempt, turn, and audio clip table types", () => {
    type Tables = Database["public"]["Tables"];

    const attempt: Tables["attempts"]["Insert"] = {
      assignment_student_id: "assignment-student-id",
    };
    const turn: Tables["attempt_turns"]["Insert"] = {
      attempt_id: "attempt-id",
      turn_order: 1,
    };
    const clip: Tables["audio_clips"]["Insert"] = {
      attempt_turn_id: "attempt-turn-id",
      clip_kind: "original_answer",
    };

    expect(attempt.assignment_student_id).toBe("assignment-student-id");
    expect(turn.turn_order).toBe(1);
    expect(clip.clip_kind).toBe("original_answer");
  });
});

describe("uploadAttemptAudioClip", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("filters assignment ownership by assignment_students.student_id before upload", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      clipKind: "original_answer",
      file: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });

    expect(result).toEqual({
      ok: true,
      audioClipId: "clip-1",
      processingStatus: "uploaded",
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
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("student-audio");
  });

  it("writes pending and uploaded processing_status metadata", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    await uploadAttemptAudioClip({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 2,
      clipKind: "repeat_attempt",
      file: new Blob(["repeat"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationMs: 900,
      byteSize: 6,
    });

    const clipInsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" && operation.action === "insert",
    );
    const clipUpdate = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" && operation.action === "update",
    );

    expect(clipInsert?.payload).toMatchObject({
      attempt_turn_id: "turn-1",
      clip_kind: "repeat_attempt",
      processing_status: "pending_upload",
    });
    expect(clipUpdate?.payload).toMatchObject({
      object_key: expect.stringContaining("as-1/attempt-1/2/repeat_attempt-clip-1"),
      mime_type: "audio/webm",
      duration_ms: 900,
      byte_size: 6,
      processing_status: "uploaded",
    });
  });

  it("marks the clip failed and returns retryable when storage upload fails", async () => {
    mockSupabase = createMockSupabase({
      uploadError: new Error("storage unavailable"),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      clipKind: "original_answer",
      file: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: "upload_failed_retryable",
      retryable: true,
    });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "audio_clips" &&
          operation.action === "update" &&
          (operation.payload as { processing_status?: string }).processing_status ===
            "failed",
      ),
    ).toBe(true);
  });

  it("does not upload when assignment ownership does not match", async () => {
    mockSupabase = createMockSupabase({ assignmentFound: false });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip({
      studentId: "other-student",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      clipKind: "original_answer",
      file: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("keeps upload route behind readStudentUnlock and avoids public URLs", () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain("readStudentUnlock");
    expect(routeSource).not.toContain("getPublicUrl");
    expect(routeSource).not.toContain("publicUrl");
  });
});
