import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202606270001_student_audio_storage.sql",
);

describe("student audio storage migration", () => {
  it("creates the private student-audio bucket", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("student-audio");
    expect(migration).toMatch(/public\s*=\s*false/i);
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });
});

describe("student audio upload boundary", () => {
  it("keeps upload route behind readStudentUnlock and avoids public URLs", () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain("readStudentUnlock");
    expect(routeSource).toContain("MAX_AUDIO_BYTES");
    expect(routeSource).toContain("MAX_AUDIO_DURATION_MS");
    expect(routeSource).toContain("ALLOWED_AUDIO_MIME_TYPES");
    expect(routeSource).not.toContain("getPublicUrl");
    expect(routeSource).not.toContain("publicUrl");
  });

  it("does not expose the raw transcript through the student audio route", () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain("displayTranscript: result.displayTranscript");
    expect(routeSource).not.toContain("transcript: result.transcript");
    expect(routeSource).not.toContain("evaluation: result.evaluation");
    expect(routeSource).toContain("toStudentEvaluation");
  });

  it("projects stored evaluations to learner-safe fields", async () => {
    const { toStudentEvaluation } = await import(
      "@/server/student-access/audio-upload"
    );
    const canary = {
      version: "ai-eval-v1",
      outcome: "retry_original",
      improvedSentence: "I like vanilla ice cream.",
      retryReason: "minimal_effort",
      minimalEffortKind: "short_answer",
      retryExample: "I like vanilla.",
      confidence: "high",
      reviewReason: null,
      meaningUnderstood: true,
      targetPatternAttempted: true,
      englishLanguage: "english",
      correctionNeeded: false,
      correctionSeverity: null,
      correctionReason: "none",
      requireRepeat: false,
      policyVersion: "natural-conversation-v1",
      evaluationModel: "canary-evaluator",
      evaluationSource: "model",
      transcriptionModel: "canary-transcriber",
      transcriptionConfidence: null,
      runtimeVersion: "canary-runtime",
      contractViolations: ["hangul_interpretation_missing"],
      hangulInterpretations: [
        { hangul: "바닐라", kind: "accented_english", englishReading: "vanilla" },
      ],
      ambiguityHistory: [
        {
          transcript: "I like 바닐라 아이스크림.",
          audioClipId: "clip-canary",
          evaluation: { outcome: "teacher_review" },
        },
      ],
      originalEvaluation: {
        outcome: "accepted_original",
        hangulInterpretations: [
          { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
        ],
      },
    };

    const projected = toStudentEvaluation(
      canary as unknown as Parameters<typeof toStudentEvaluation>[0],
    );

    expect(projected).toEqual({
      kind: "original",
      outcome: "retry_original",
      improvedSentence: "I like vanilla ice cream.",
      retryReason: "minimal_effort",
      minimalEffortKind: "short_answer",
      retryExample: "I like vanilla.",
    });

    const serialized = JSON.stringify(projected);
    for (const forbidden of [
      "hangulInterpretations",
      "ambiguityHistory",
      "originalEvaluation",
      "contractViolations",
      "evaluationModel",
      "transcriptionModel",
      "runtimeVersion",
      "policyVersion",
      "바닐라",
      "축구",
      "I like 바닐라 아이스크림.",
      "clip-canary",
      "canary-evaluator",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    for (const [key, value] of Object.entries(projected ?? {})) {
      expect(value, `projection leaked a nested object at ${key}`).not.toBeTypeOf(
        "object",
      );
    }
  });

  it("projects repeat teacher-review evaluations without audit evidence", async () => {
    const { toStudentEvaluation } = await import(
      "@/server/student-access/audio-upload"
    );
    const repeat = {
      kind: "repeat",
      outcome: "teacher_review",
      status: "teacher_review",
      auditEvidence: { rawTranscript: "바닐라" },
      originalEvaluation: {
        hangulInterpretations: [
          { hangul: "바닐라", kind: "korean_vocabulary", englishReading: null },
        ],
      },
    } as unknown as Parameters<typeof toStudentEvaluation>[0];

    expect(toStudentEvaluation(repeat)).toEqual({
      kind: "repeat",
      outcome: "teacher_review",
    });
  });

  it("returns undefined when there is no stored evaluation", async () => {
    const { toStudentEvaluation } = await import(
      "@/server/student-access/audio-upload"
    );

    expect(toStudentEvaluation(undefined)).toBeUndefined();
  });
});
