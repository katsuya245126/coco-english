import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

let mockSupabase: { from: (table: never) => unknown };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

import { getCompletedMissionRecap } from "@/server/student-access/student-history";

const hintLadder = {
  tier1: "Use the target pattern.",
  tier2: "Choose helpful words.",
  tier3: "Say the complete example.",
};

const presetSnapshot = {
  missionId: "00000000-0000-4000-8000-000000000001",
  title: "Weekend plans",
  level: "beginner",
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: false,
  turns: [
    { turnOrder: 1, prompt: "What will you do?", targetPattern: "I like ___.", targetExample: "I like playing soccer.", hintLadder },
    { turnOrder: 2, prompt: "Who will go?", targetPattern: "I will ___.", targetExample: "I will go with my friend.", hintLadder },
    { turnOrder: 3, prompt: "What else?", targetPattern: "I can ___.", targetExample: "I can eat lunch.", hintLadder },
  ],
};

const historicalPresetSnapshot = {
  ...presetSnapshot,
  targetPattern: "I am going to...",
  turns: presetSnapshot.turns.map(({ targetPattern: _targetPattern, ...turn }) => turn),
};

const conversationSnapshot = {
  missionId: "00000000-0000-4000-8000-000000000002",
  title: "Weekend conversation",
  targetPattern: "I am going to...",
  level: "beginner",
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: true,
  turns: [{
    turnOrder: 1,
    prompt: "Where are you going?",
    targetExample: "I am going to school.",
    hintLadder,
  }],
};

const legacySnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [{
    order: 1,
    prompt: "What are you going to do this weekend?",
    targetExample: "I am going to play soccer.",
  }],
};

function createMockSupabase() {
  const rows = {
    assignment_students: {
      data: {
        id: "assignment-student-1",
        latest_attempt_id: "attempt-1",
        submitted_at: "2026-07-14T00:00:00.000Z",
        assignments: {
          title: "Weekend plans",
          canceled_at: null,
          mission_snapshot: presetSnapshot,
        },
      },
      error: null,
    },
    attempts: {
      data: { id: "attempt-1", status: "completed", completed_at: "2026-07-14T00:00:00.000Z" },
      error: null,
    },
    attempt_turns: {
      data: [
        { id: "turn-original", turn_order: 1, original_transcript: "I play soccer with funny friends today", repeat_transcript: null, repeat_accepted: false },
        { id: "turn-repeat", turn_order: 2, original_transcript: "My original answer", repeat_transcript: "Ramen tastes better", repeat_accepted: true },
        { id: "turn-clear", turn_order: 3, original_transcript: "I feel ready", repeat_transcript: null, repeat_accepted: false },
      ],
      error: null,
    },
    audio_clips: {
      data: [
        { id: "clip-original", attempt_turn_id: "turn-original", clip_kind: "original_answer", object_key: "original.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-repeat", attempt_turn_id: "turn-repeat", clip_kind: "repeat_attempt", object_key: "repeat.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-clear", attempt_turn_id: "turn-clear", clip_kind: "original_answer", object_key: "clear.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
      ],
      error: null,
    },
    pronunciation_scores: {
      data: [
        {
          audio_clip_id: "clip-original",
          star_band: 2,
          word_scores: [
            { word: "going", accuracyScore: 0, errorType: "Omission" },
            { word: "um", accuracyScore: 0, errorType: "Insertion" },
            { word: "play", accuracyScore: 30, errorType: "Mispronunciation" },
            { word: "soccer", accuracyScore: 40, errorType: "Monotone" },
            { word: "friends", accuracyScore: 35, errorType: "Mispronunciation" },
            { word: "today", accuracyScore: 20, errorType: "Mispronunciation" },
            { word: "phantom", accuracyScore: 10, errorType: "Mispronunciation" },
          ],
        },
        {
          audio_clip_id: "clip-repeat",
          star_band: 1,
          word_scores: [
            { word: "original", accuracyScore: 20, errorType: "Mispronunciation" },
            { word: "Ramen", accuracyScore: 25, errorType: "Mispronunciation" },
            { word: "better", accuracyScore: 45, errorType: "Monotone" },
            { word: "tastes", accuracyScore: 0, errorType: "UnexpectedBreak" },
          ],
        },
        {
          audio_clip_id: "clip-clear",
          star_band: 3,
          word_scores: [
            { word: "ready", accuracyScore: 100, errorType: "None" },
            { word: "tomorrow", accuracyScore: 0, errorType: "Omission" },
          ],
        },
      ],
      error: null,
    },
  };

  return {
    from(table: keyof typeof rows) {
      const result = rows[table];
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(result),
        order: () => Promise.resolve(result),
        in: () => table === "pronunciation_scores" ? Promise.resolve(result) : query,
      };
      return query;
    },
  };
}

const source = fs.readFileSync(path.join(process.cwd(), "src/server/student-access/student-history.ts"), "utf8");

describe("student completed mission recap security contracts", () => {
  it("anchors lookup to assignment-student ownership, completion, and latest attempt", () => {
    expect(source).toContain('.eq("id", assignmentStudentId)');
    expect(source).toContain('.eq("student_id", studentId)');
    expect(source).toContain('.in("status", ["completed", "teacher_review"])');
    expect(source).toContain('row.latest_attempt_id');
    expect(source).toContain('.eq("assignment_student_id", row.id)');
    const attemptLookup = source.slice(source.indexOf('from("attempts")'), source.indexOf('from("attempt_turns")'));
    expect(attemptLookup).not.toContain(".order(");
  });

  it("does not expose signed URLs in the initial recap and degrades retained audio safely", () => {
    const recapType = source.slice(source.indexOf("export type StudentMissionRecap"), source.indexOf("function readInterpretations"));
    expect(recapType).not.toContain("signedUrl");
    expect(source).toContain('"expired"');
    expect(source).toContain('"unavailable"');
    expect(source).toContain("deleted_at");
    expect(source).toContain("audio_expires_at");
  });

  it("authorizes clips through the owned latest completed attempt and signs for 300 seconds", () => {
    expect(source).toContain("attempt.id !== assignmentStudent.latest_attempt_id");
    expect(source).toContain("AUDIO_TTL_SECONDS = 300");
    expect(source).toContain("createSignedUrl(row.object_key, AUDIO_TTL_SECONDS)");
  });
});

describe("student completed mission recap pronunciation", () => {
  it("uses the displayed transcript and shared practice-word rules", async () => {
    mockSupabase = createMockSupabase();

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap).not.toHaveProperty("targetPattern");
    expect(recap?.turns.map(({ turnOrder, targetPattern }) => ({ turnOrder, targetPattern }))).toEqual([
      { turnOrder: 1, targetPattern: "I like ___." },
      { turnOrder: 2, targetPattern: "I will ___." },
      { turnOrder: 3, targetPattern: "I can ___." },
    ]);
    expect(recap?.turns.map((turn) => ({ transcript: turn.transcript, pronunciation: turn.pronunciation }))).toEqual([
      {
        transcript: "I play soccer with funny friends today",
        pronunciation: {
          starBand: 2,
          words: [
            { word: "play", label: "Mispronounced" },
            { word: "soccer", label: "Flat tone" },
            { word: "friends", label: "Mispronounced" },
          ],
        },
      },
      {
        transcript: "Ramen tastes better",
        pronunciation: {
          starBand: 1,
          words: [
            { word: "Ramen", label: "Mispronounced" },
            { word: "better", label: "Flat tone" },
          ],
        },
      },
      {
        transcript: "I feel ready",
        pronunciation: { starBand: 3, words: [] },
      },
    ]);
  });
});

describe("student legacy mission recap", () => {
  it("shows known legacy questions and both speaking tries without a target pattern", async () => {
    mockSupabase = createDynamicMockSupabase(
      [{
        id: "turn-repeat",
        turn_order: 1,
        original_transcript: "I play soccer.",
        improved_sentence: "I am going to play soccer.",
        repeat_transcript: "I am going to play soccer.",
        repeat_accepted: true,
        evaluation: { outcome: "accepted_repeat", repeatCloseEnough: true },
        coco_line: "Stored line is not a legacy prompt.",
      }],
      legacySnapshot,
    );

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap).not.toHaveProperty("targetPattern");
    expect(recap).toMatchObject({
      conversationMode: false,
      characterId: "default-buddy",
      finalCocoLine: null,
      completedAt: "2026-07-14T00:00:00.000Z",
      turns: [{
        cocoPrompt: "What are you going to do this weekend?",
        targetPattern: null,
        reviewState: "repeat_accepted",
        original: { transcript: "I play soccer." },
        repeat: { transcript: "I am going to play soccer." },
      }],
    });
  });

  it("falls back historical complete preset patterns onto every turn", async () => {
    mockSupabase = createDynamicMockSupabase(undefined, historicalPresetSnapshot);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap).not.toHaveProperty("targetPattern");
    expect(recap?.turns.map(({ turnOrder, targetPattern }) => ({ turnOrder, targetPattern }))).toEqual([
      { turnOrder: 1, targetPattern: "I am going to..." },
      { turnOrder: 2, targetPattern: "I am going to..." },
      { turnOrder: 3, targetPattern: "I am going to..." },
    ]);
  });

  it("keeps unknown partial snapshot data as not found", async () => {
    mockSupabase = createDynamicMockSupabase(undefined, {
      targetPattern: "I am going to...",
      turns: [{ turnOrder: 1, prompt: "What will you do?" }],
    });

    await expect(
      getCompletedMissionRecap("student-1", "assignment-student-1"),
    ).resolves.toBeNull();
  });
});

type DynamicAttemptTurnRow = {
  id: string;
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean;
  evaluation: unknown;
  coco_line: string;
};

function createDynamicMockSupabase(
  attemptTurnsOverride?: DynamicAttemptTurnRow[],
  missionSnapshot: unknown = conversationSnapshot,
) {
  const rows = {
    assignment_students: {
      data: {
        id: "assignment-student-1",
        latest_attempt_id: "attempt-1",
        submitted_at: "2026-07-14T00:00:00.000Z",
        assignments: {
          title: "Weekend plans",
          canceled_at: null,
          mission_snapshot: missionSnapshot,
        },
      },
      error: null,
    },
    attempts: {
      data: { id: "attempt-1", status: "completed", completed_at: "2026-07-14T00:00:00.000Z" },
      error: null,
    },
    attempt_turns: {
      data:
        attemptTurnsOverride ??
        [
          {
            id: "turn-correct",
            turn_order: 1,
            original_transcript: "I am going to school.",
            improved_sentence: null,
            repeat_transcript: null,
            repeat_accepted: false,
            evaluation: {
              outcome: "accepted_original",
              correctionSeverity: "none",
            },
            coco_line: "What do you do at school?",
          },
          {
            id: "turn-minor",
            turn_order: 2,
            original_transcript: "I go to library.",
            improved_sentence: "I go to the library.",
            repeat_transcript: null,
            repeat_accepted: false,
            evaluation: {
              outcome: "accepted_original",
              correctionSeverity: "minor",
            },
            coco_line: "What books do you read there?",
          },
          {
            id: "turn-repeat",
            turn_order: 3,
            original_transcript: "I want read cartoon.",
            improved_sentence: "I want to read cartoons.",
            repeat_transcript: "I want to read cartoons.",
            repeat_accepted: true,
            evaluation: { outcome: "accepted_repeat", repeatCloseEnough: true },
            coco_line:
              "That was fun! Thanks for talking with me. See you next time!",
          },
        ],
      error: null,
    },
    audio_clips: {
      data: [
        { id: "clip-correct-original", attempt_turn_id: "turn-correct", clip_kind: "original_answer", object_key: "correct.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-minor-original", attempt_turn_id: "turn-minor", clip_kind: "original_answer", object_key: "minor.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-repeat-original", attempt_turn_id: "turn-repeat", clip_kind: "original_answer", object_key: "repeat-original.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-repeat-repeat", attempt_turn_id: "turn-repeat", clip_kind: "repeat_attempt", object_key: "repeat-repeat.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-hangul-original", attempt_turn_id: "turn-loanword", clip_kind: "original_answer", object_key: "hangul.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
        { id: "clip-hidden-original", attempt_turn_id: "turn-hidden", clip_kind: "original_answer", object_key: "hidden.webm", processing_status: "transcribed", audio_expires_at: null, deleted_at: null },
      ],
      error: null,
    },
    pronunciation_scores: {
      data: [
        { audio_clip_id: "clip-correct-original", star_band: 3, word_scores: [] },
        { audio_clip_id: "clip-minor-original", star_band: 2, word_scores: [] },
        { audio_clip_id: "clip-repeat-original", star_band: 1, word_scores: [] },
        { audio_clip_id: "clip-repeat-repeat", star_band: 3, word_scores: [] },
        {
          audio_clip_id: "clip-hangul-original",
          star_band: 2,
          word_scores: [{ word: "vanilla", accuracyScore: 30, errorType: "Mispronunciation" }],
        },
        {
          audio_clip_id: "clip-hidden-original",
          star_band: 2,
          word_scores: [{ word: "soccer", accuracyScore: 30, errorType: "Mispronunciation" }],
        },
      ],
      error: null,
    },
  };

  return {
    from(table: keyof typeof rows) {
      const result = rows[table];
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(result),
        order: () => Promise.resolve(result),
        in: () => (table === "pronunciation_scores" ? Promise.resolve(result) : query),
      };
      return query;
    },
  };
}

describe("student completed mission recap dynamic homework review", () => {
  it("maps severity and repeat state into a per-turn review state with separated original/repeat evidence", async () => {
    mockSupabase = createDynamicMockSupabase();

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap).toMatchObject({
      conversationMode: true,
      characterId: "default-buddy",
      finalCocoLine:
        "That was fun! Thanks for talking with me. See you next time!",
      turns: [
        {
          cocoPrompt: "Where are you going?",
          reviewState: "accepted",
          original: { transcript: "I am going to school." },
          repeat: null,
        },
        {
          cocoPrompt: "What do you do at school?",
          reviewState: "accepted_minor",
          original: { transcript: "I go to library." },
          improvedSentence: "I go to the library.",
          repeat: null,
        },
        {
          cocoPrompt: "What books do you read there?",
          reviewState: "repeat_accepted",
          original: { transcript: "I want read cartoon." },
          repeat: { transcript: "I want to read cartoons." },
        },
      ],
    });
    expect(recap?.turns.map((turn) => turn.targetPattern)).toEqual([null, null, null]);

    expect(recap?.turns[2]?.original.audio?.id).toBe("clip-repeat-original");
    expect(recap?.turns[2]?.repeat?.audio?.id).toBe("clip-repeat-repeat");
    expect(recap?.turns[2]?.original.pronunciation?.starBand).toBe(1);
    expect(recap?.turns[2]?.repeat?.pronunciation?.starBand).toBe(3);
  });

  it("marks a teacher-reviewed turn as neutral with no review reason exposed", async () => {
    mockSupabase = createDynamicMockSupabase([
      {
        id: "turn-neutral",
        turn_order: 1,
        original_transcript: "Something unclear.",
        improved_sentence: null,
        repeat_transcript: null,
        repeat_accepted: false,
        evaluation: {
          kind: "original",
          outcome: "teacher_review",
          reviewReason: "ambiguous",
        },
        coco_line: "Let's try again.",
      },
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.reviewState).toBe("neutral");
    expect(JSON.stringify(recap)).not.toContain("ambiguous");
    expect(JSON.stringify(recap)).not.toContain("evaluation");
  });

  it("labels an accepted completed recovery with its persisted recovery question", async () => {
    mockSupabase = createDynamicMockSupabase([
      {
        id: "turn-opening",
        turn_order: 1,
        original_transcript: "I am going to school.",
        improved_sentence: null,
        repeat_transcript: null,
        repeat_accepted: false,
        evaluation: { kind: "original", outcome: "accepted_original" },
        coco_line: "Who do you go with?",
      },
      {
        id: "turn-recovery",
        turn_order: 2,
        original_transcript: "I go with my friend.",
        improved_sentence: null,
        repeat_transcript: null,
        repeat_accepted: false,
        evaluation: {
          kind: "original",
          outcome: "accepted_original",
          ambiguityHistory: [
            { recoveryQuestion: "Can you say that another way?" },
          ],
        },
        coco_line: "That was fun! See you next time!",
      },
    ]);

    const recap = await getCompletedMissionRecap(
      "student-1",
      "assignment-student-1",
    );

    expect(recap?.turns.map(({ turnOrder, cocoPrompt }) => ({
      turnOrder,
      cocoPrompt,
    }))).toEqual([
      { turnOrder: 1, cocoPrompt: "Where are you going?" },
      { turnOrder: 2, cocoPrompt: "Can you say that another way?" },
    ]);
  });

  it("fails closed instead of carrying a stale question across missing Conversation history", async () => {
    mockSupabase = createDynamicMockSupabase([
      {
        id: "turn-first",
        turn_order: 1,
        original_transcript: "I am going to school.",
        improved_sentence: null,
        repeat_transcript: null,
        repeat_accepted: false,
        evaluation: { outcome: "accepted_original" },
        coco_line: "What do you do at school?",
      },
      {
        id: "turn-third",
        turn_order: 3,
        original_transcript: "I read books.",
        improved_sentence: null,
        repeat_transcript: null,
        repeat_accepted: false,
        evaluation: { outcome: "accepted_original" },
        coco_line: "That was fun! See you next time!",
      },
    ]);

    const recap = await getCompletedMissionRecap(
      "student-1",
      "assignment-student-1",
    );

    expect(recap?.turns.map(({ turnOrder, cocoPrompt }) => ({
      turnOrder,
      cocoPrompt,
    }))).toEqual([
      { turnOrder: 1, cocoPrompt: "Where are you going?" },
      { turnOrder: 3, cocoPrompt: "Coco's question" },
    ]);
  });
});

describe("completed homework review derives learner-safe transcripts", () => {
  function hangulTurn(overrides: Partial<DynamicAttemptTurnRow> = {}): DynamicAttemptTurnRow {
    return {
      id: "turn-loanword",
      turn_order: 1,
      original_transcript: "I like 바닐라 ice cream.",
      improved_sentence: null,
      repeat_transcript: null,
      repeat_accepted: false,
      evaluation: {
        outcome: "accepted_original",
        correctionSeverity: "none",
        hangulInterpretations: [
          { hangul: "바닐라", kind: "accented_english", englishReading: "vanilla" },
        ],
      },
      coco_line: "That was fun! Thanks for talking with me. See you next time!",
      ...overrides,
    };
  }

  it("replaces a validated accented-English span in the recap text", async () => {
    mockSupabase = createDynamicMockSupabase([hangulTurn()]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBe("I like vanilla ice cream.");
    expect(recap?.turns[0]?.original.transcript).toBe("I like vanilla ice cream.");
    expect(JSON.stringify(recap)).not.toContain("바닐라");
  });

  it("hides the whole transcript when a span is Korean vocabulary", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        id: "turn-hidden",
        original_transcript: "I like 축구.",
        evaluation: {
          outcome: "accepted_original",
          correctionSeverity: "none",
          hangulInterpretations: [
            { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
          ],
        },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBeNull();
    expect(recap?.turns[0]?.original.transcript).toBeNull();
    expect(recap?.turns[0]?.original.pronunciation?.words).toEqual([]);
    expect(recap?.turns[0]?.original.audio?.id).toBe("clip-hidden-original");
  });

  it("keeps a proper name exactly as spoken", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        original_transcript: "I ate 삼겹살 with my family.",
        evaluation: {
          outcome: "accepted_original",
          correctionSeverity: "none",
          hangulInterpretations: [
            { hangul: "삼겹살", kind: "name", englishReading: null },
          ],
        },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBe("I ate 삼겹살 with my family.");
  });

  it("reads repeat and original metadata from their own evaluation levels", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        original_transcript: "I like 축구.",
        repeat_transcript: "I like 사커.",
        repeat_accepted: true,
        evaluation: {
          outcome: "accepted_repeat",
          repeatCloseEnough: true,
          hangulInterpretations: [
            { hangul: "사커", kind: "accented_english", englishReading: "soccer" },
          ],
          originalEvaluation: {
            correctionSeverity: "none",
            hangulInterpretations: [
              { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
            ],
          },
        },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.repeat?.transcript).toBe("I like soccer.");
    expect(recap?.turns[0]?.transcript).toBe("I like soccer.");
    expect(recap?.turns[0]?.original.transcript).toBeNull();
  });

  it("fails closed for a legacy Hangul record with no interpretation metadata", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        evaluation: { outcome: "accepted_original", correctionSeverity: "none" },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBeNull();
  });

  it("fails closed for malformed interpretation metadata", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        evaluation: {
          outcome: "accepted_original",
          correctionSeverity: "none",
          hangulInterpretations: "바닐라 = vanilla",
        },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBeNull();
  });

  it("displays a legacy all-English record normally", async () => {
    mockSupabase = createDynamicMockSupabase([
      hangulTurn({
        original_transcript: "I like vanilla ice cream.",
        evaluation: { outcome: "accepted_original", correctionSeverity: "none" },
      }),
    ]);

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap?.turns[0]?.transcript).toBe("I like vanilla ice cream.");
  });
});
