import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Soccer chat",
  targetPattern: "How often do you _____?",
  level: "elementary",
  requiredTurns: 5,
  characterId: "default-buddy",
  conversationMode: true,
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
    },
  ],
};

type Options = {
  assignmentFound?: boolean;
  canceledAt?: string | null;
  snapshot?: unknown;
  dynamicLine?: string | null;
  assignmentError?: Error | null;
  turnError?: Error | null;
};

let options: Options;
let operations: Array<{ table: string; filters: Array<[string, unknown]> }>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    from: vi.fn((table: string) => {
      const operation = { table, filters: [] as Array<[string, unknown]> };
      operations.push(operation);
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          operation.filters.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "assignment_students") {
            return {
              data:
                options.assignmentFound === false
                  ? null
                  : {
                      id: "as-1",
                      student_id: "student-1",
                      latest_attempt_id: "attempt-latest",
                      assignments: {
                        mission_snapshot: options.snapshot ?? snapshot,
                        canceled_at: options.canceledAt ?? null,
                      },
                    },
              error: options.assignmentError ?? null,
            };
          }
          return {
            data:
              options.dynamicLine === null
                ? null
                : { coco_line: options.dynamicLine ?? "What do you like to do instead?" },
            error: options.turnError ?? null,
          };
        }),
      };
      return query;
    }),
  }),
}));

describe("resolveOwnedTranslationSource", () => {
  beforeEach(() => {
    vi.resetModules();
    options = {};
    operations = [];
  });

  it("resolves an authored prompt from the immutable owned snapshot", async () => {
    const { resolveOwnedTranslationSource } = await import(
      "@/server/student-access/translation-source"
    );

    expect(
      await resolveOwnedTranslationSource({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        line: { lineKind: "mission_prompt", turnOrder: 1 },
      }),
    ).toEqual({
      ok: true,
      source: {
        sourceText: "How often do you play soccer?",
        studentLevel: "elementary",
      },
    });
  });

  it("resolves a dynamic prompt only from the latest owned attempt", async () => {
    const { resolveOwnedTranslationSource } = await import(
      "@/server/student-access/translation-source"
    );

    expect(
      await resolveOwnedTranslationSource({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
      }),
    ).toEqual({
      ok: true,
      source: {
        sourceText: "What do you like to do instead?",
        studentLevel: "elementary",
      },
    });

    const turnLookup = operations.find(
      (operation) => operation.table === "attempt_turns",
    );
    expect(turnLookup?.filters).toEqual(
      expect.arrayContaining([
        ["attempt_id", "attempt-latest"],
        ["turn_order", 1],
      ]),
    );
  });

  it("rejects wrong ownership, canceled assignments, and invalid snapshots", async () => {
    const { resolveOwnedTranslationSource } = await import(
      "@/server/student-access/translation-source"
    );
    const input = {
      studentId: "student-1",
      assignmentStudentId: "as-1",
      line: { lineKind: "mission_prompt" as const, turnOrder: 1 },
    };

    options.assignmentFound = false;
    expect(await resolveOwnedTranslationSource(input)).toEqual({
      ok: false,
      error: "not_found",
    });

    options = { canceledAt: "2026-07-15T00:00:00Z" };
    expect(await resolveOwnedTranslationSource(input)).toEqual({
      ok: false,
      error: "not_found",
    });

    options = { snapshot: { invalid: true } };
    expect(await resolveOwnedTranslationSource(input)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("returns not_found for missing authored or dynamic lines", async () => {
    const { resolveOwnedTranslationSource } = await import(
      "@/server/student-access/translation-source"
    );

    expect(
      await resolveOwnedTranslationSource({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        line: { lineKind: "mission_prompt", turnOrder: 2 },
      }),
    ).toEqual({ ok: false, error: "not_found" });

    options.dynamicLine = null;
    expect(
      await resolveOwnedTranslationSource({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("distinguishes database errors from missing data", async () => {
    const { resolveOwnedTranslationSource } = await import(
      "@/server/student-access/translation-source"
    );
    options.assignmentError = new Error("db down");

    expect(
      await resolveOwnedTranslationSource({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        line: { lineKind: "mission_prompt", turnOrder: 1 },
      }),
    ).toEqual({ ok: false, error: "db_error" });
  });
});
