import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";
import {
  createOwnedSpeakingTryContext,
  type OwnedSpeakingTryContextInput,
} from "@/server/student-access/speaking-try-context";

type Operation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  filters: Array<[string, unknown]>;
  payload?: unknown;
};

let attemptStatuses: Array<Database["public"]["Enums"]["attempt_status"]>;
let attemptLookupCount: number;
let operations: Operation[];
let upload: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      const operation: Operation = { table, action: "select", filters: [] };
      operations.push(operation);
      const query: Record<string, unknown> & PromiseLike<{ error: unknown }> = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          operation.filters.push([column, value]);
          return query;
        }),
        lt: vi.fn((column: string, value: unknown) => {
          operation.filters.push([`${column}<`, value]);
          return query;
        }),
        order: vi.fn(async () => ({ data: [], error: null })),
        insert: vi.fn((payload: unknown) => {
          operation.action = "insert";
          operation.payload = payload;
          return query;
        }),
        update: vi.fn((payload: unknown) => {
          operation.action = "update";
          operation.payload = payload;
          return query;
        }),
        upsert: vi.fn((payload: unknown) => {
          operation.action = "upsert";
          operation.payload = payload;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "assignment_students") {
            return {
              data: {
                id: "as-1",
                student_id: "student-1",
                status: "started",
                assignments: { canceled_at: null },
              },
              error: null,
            };
          }
          const status =
            attemptStatuses[attemptLookupCount++] ?? "in_progress";
          return {
            data:
              status === "in_progress"
                ? {
                    id: "attempt-1",
                    assignment_student_id: "as-1",
                    status,
                  }
                : null,
            error: null,
          };
        }),
        single: vi.fn(async () => ({
          data: table === "attempt_turns" ? { id: "turn-1" } : { id: "clip-1" },
          error: null,
        })),
        then: (<TResult1, TResult2 = never>(
          onFulfilled?:
            | ((value: { error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) =>
          Promise.resolve(
            table === "audio_clips"
              ? { count: 0, error: null }
              : { error: null },
          ).then(onFulfilled ?? undefined, onRejected ?? undefined)) as PromiseLike<{
          error: unknown;
          count?: number;
        }>["then"],
      };
      return query;
    },
    storage: {
      from: vi.fn(() => ({ upload })),
    },
  }),
}));

const snapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Soccer chat",
  targetPattern: "How often do you _____?",
  level: "elementary" as const,
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: true as const,
  requireCompleteSentenceAnswers: true,
  turns: [
    {
      turnOrder: 1,
      prompt: "How often do you play soccer?",
      targetExample: "I play soccer twice a week.",
      hintLadder: {
        tier1: "How often do you _____?",
        tier2: "once, twice, every day",
        tier3: "I play soccer twice a week.",
      },
      answerShape: "open" as const,
    },
  ],
};

const input: OwnedSpeakingTryContextInput = {
  studentId: "student-1",
  assignmentStudentId: "as-1",
  attemptId: "attempt-1",
  snapshot,
};

describe("owned speaking-try context", () => {
  beforeEach(() => {
    attemptStatuses = [];
    attemptLookupCount = 0;
    operations = [];
    upload = vi.fn(async () => ({ error: null }));
  });

  it("re-proves the active attempt before each operation and rejects a status flip", async () => {
    attemptStatuses = ["in_progress", "completed"];
    const context = createOwnedSpeakingTryContext(input);

    expect(await context.initializeTurn(1)).toEqual({
      ok: true,
      value: { id: "turn-1" },
    });

    const result = await context.loadConversationTurns(2);

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(
      operations.filter(({ table, action }) => table === "attempt_turns" && action === "select"),
    ).toHaveLength(0);
  });

  it("guards storage and failed-clip writes independently after admission", async () => {
    attemptStatuses = ["in_progress", "completed", "completed"];
    const context = createOwnedSpeakingTryContext(input);

    await context.initializeTurn(1);

    const storage = await context.uploadAudio({
      bucket: "student-audio",
      objectKey: "as-1/attempt-1/1/original_answer-clip-1.webm",
      blob: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    });
    const failed = await context.markClipFailed({
      audioClipId: "clip-1",
      attemptTurnId: "turn-1",
      objectKey: "as-1/attempt-1/1/original_answer-clip-1.webm",
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });

    expect(storage).toEqual({ ok: false, error: "not_found" });
    expect(failed).toEqual({ ok: false, error: "not_found" });
    expect(upload).not.toHaveBeenCalled();
    expect(
      operations.some(({ table, action }) => table === "audio_clips" && action === "update"),
    ).toBe(false);
  });

  it("uses both student and active-attempt filters on every proof", async () => {
    const context = createOwnedSpeakingTryContext(input);

    await context.loadConversationTurns(2);

    const assignmentProof = operations.find(
      ({ table }) => table === "assignment_students",
    );
    const attemptProof = operations.find(({ table }) => table === "attempts");
    expect(assignmentProof?.filters).toEqual(
      expect.arrayContaining([
        ["id", "as-1"],
        ["student_id", "student-1"],
      ]),
    );
    expect(attemptProof?.filters).toEqual(
      expect.arrayContaining([
        ["id", "attempt-1"],
        ["assignment_student_id", "as-1"],
        ["status", "in_progress"],
      ]),
    );
  });
});
