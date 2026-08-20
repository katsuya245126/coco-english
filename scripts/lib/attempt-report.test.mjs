import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAssignmentPolicy,
  formatAttemptTurn,
  formatInspectionFilters,
  formatInspectionSampling,
  fetchAllPages,
  isTestClass,
  parseConfiguredTestClassIds,
  resolveAttemptPrompt,
} from "./attempt-report.mjs";

test("fetches 0..999, 1000..1999, and 2000..2999 for 2002 rows", async () => {
  const ranges = [];
  const rows = await fetchAllPages(
    async (from, to) => {
      ranges.push([from, to]);
      const length = Math.max(0, Math.min(to, 2001) - from + 1);
      return Array.from({ length }, (_, index) => from + index);
    },
    { pageSize: 1000 },
  );

  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  assert.equal(rows.length, 2002);
  assert.equal(rows.at(-1), 2001);
});

test("requests an empty page after an exact final page", async () => {
  const ranges = [];
  const rows = await fetchAllPages(
    async (from, to) => {
      ranges.push([from, to]);
      return from < 3000 ? Array.from({ length: 1000 }, () => from) : [];
    },
    { pageSize: 1000 },
  );

  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
    [3000, 3999],
  ]);
  assert.equal(rows.length, 3000);
});

test("resolves each preset turn from its authored snapshot prompt", () => {
  const snapshotTurnsByOrder = new Map([
    [1, { turnOrder: 1, prompt: "What do you do after school?" }],
    [2, { turnOrder: 2, prompt: "Where do you play?" }],
  ]);

  const first = resolveAttemptPrompt({
    turn: { turn_order: 1, coco_line: "What is your favorite game?" },
    snapshotTurnsByOrder,
    conversationMode: false,
  });
  const second = resolveAttemptPrompt({
    turn: { turn_order: 2, coco_line: "What do you eat?" },
    snapshotTurnsByOrder,
    conversationMode: false,
  });

  assert.equal(first.promptAnswered, "What do you do after school?");
  assert.equal(second.promptAnswered, "Where do you play?");
});

test("links conversation opener to prior Coco lines and labels legacy gaps", () => {
  const snapshotTurnsByOrder = new Map([
    [1, { turnOrder: 1, prompt: "What do you like to do?" }],
    [2, { turnOrder: 2, prompt: "Snapshot text must not replace Coco's line" }],
  ]);

  const opener = resolveAttemptPrompt({
    turn: { turn_order: 1 },
    snapshotTurnsByOrder,
    conversationMode: true,
  });
  const followUp = resolveAttemptPrompt({
    turn: { turn_order: 2 },
    snapshotTurnsByOrder,
    conversationMode: true,
    previousCocoLine: "Where do you play that game?",
  });
  const legacyGap = resolveAttemptPrompt({
    turn: { turn_order: 3 },
    snapshotTurnsByOrder,
    conversationMode: true,
  });

  assert.equal(opener.promptAnswered, "What do you like to do?");
  assert.equal(followUp.promptAnswered, "Where do you play that game?");
  assert.equal(legacyGap.promptAnswered, "unavailable (legacy linkage)");
});

test("filters fixture names and configured class IDs unless explicitly included", () => {
  const configuredIds = parseConfiguredTestClassIds(
    "test-class-a, , test-class-b",
  );
  const defaultOptions = { configuredTestClassIds: configuredIds };

  assert.equal(configuredIds.size, 2);
  assert.equal(
    isTestClass({ id: "test-class-a", name: "Ordinary Class" }, defaultOptions),
    true,
  );
  assert.equal(
    isTestClass({ id: "unconfigured", name: "MissionE2E Class" }, defaultOptions),
    true,
  );
  assert.equal(
    isTestClass({ id: "real-class", name: "Ordinary Class" }, defaultOptions),
    false,
  );
  assert.equal(
    isTestClass(
      { id: "test-class-a", name: "MissionE2E Class" },
      { ...defaultOptions, includeTest: true },
    ),
    false,
  );
});

test("discloses filters before details and sampling after iteration", () => {
  const filters = formatInspectionFilters({
    scopeLabel: "All classes",
    includeTest: false,
    configuredTestClassCount: 2,
    showUnattempted: false,
    rowCap: 3,
  }).join("\n");
  const sampling = formatInspectionSampling({
    candidateRows: 8,
    scannedRows: 3,
    shownRows: 3,
  }).join("\n");

  assert.match(filters, /scope: all classes/i);
  assert.match(filters, /test traffic: excluded/i);
  assert.match(filters, /configured test class ids: 2/i);
  assert.match(filters, /values withheld/i);
  assert.match(filters, /unattempted .* excluded/i);
  assert.match(filters, /row cap: 3/i);
  assert.match(filters, /pagination: all pages fetched/i);
  assert.match(filters, /page size: 1000/i);
  assert.doesNotMatch(filters, /candidate rows|sampling:/i);
  assert.match(sampling, /candidate rows: 8/i);
  assert.match(sampling, /shown rows: 3/i);
  assert.match(sampling, /sampling: incomplete/i);
});

test("prints mission policy, correction, provenance, failed clips, and fallback evidence", () => {
  const policy = formatAssignmentPolicy({
    conversationMode: true,
    scenePremise: "A summer day in the valley",
    targetPattern: "I'm going to _____",
    requireCompleteSentenceAnswers: true,
    turns: [{ turnOrder: 1, answerShape: "open" }],
  }).join("\n");

  const turn = formatAttemptTurn(
    {
      turn_order: 1,
      original_transcript: "I",
      improved_sentence: null,
      repeat_transcript: null,
      created_at: "2026-07-26T00:00:00Z",
      updated_at: "2026-07-26T00:00:01Z",
      evaluation: {
        outcome: "retry_original",
        retryReason: "incomplete_recording",
        policyVersion: "natural-conversation-v1",
        evaluationModel: "gpt-4.1-mini",
        evaluationSource: "deterministic",
        transcriptionModel: "gpt-4o-mini-transcribe",
        transcriptionConfidence: { minLogprob: -0.2, tokenCount: 1 },
        runtimeVersion: "abc123",
      },
      moderation_event: {
        kind: "canned_fallback",
        cause: "reply_policy_failed",
        violations: ["question_format"],
      },
      audio_clips: [
        {
          clip_kind: "original_answer",
          processing_status: "failed",
          duration_ms: 6548,
          byte_size: 30460,
          mime_type: "audio/webm",
          created_at: "2026-07-26T00:00:00Z",
          updated_at: "2026-07-26T00:00:01Z",
          object_key: "must-not-print",
          pronunciation_scores: [],
        },
      ],
    },
    { answerShape: "open", prompt: "Why?", targetExample: "Because it is good." },
  ).join("\n");

  const output = `${policy}\n${turn}`;
  assert.match(output, /require complete sentence answers: true/i);
  assert.match(output, /answer shape: open/i);
  assert.match(output, /improved sentence: —/i);
  assert.match(output, /processing status: failed/i);
  assert.match(output, /duration: 6548 ms/i);
  assert.match(output, /byte size: 30460/i);
  assert.match(output, /moderation event: canned_fallback/i);
  assert.match(output, /fallback cause: reply_policy_failed/i);
  assert.match(output, /violations: question_format/i);
  assert.match(output, /policy version: natural-conversation-v1/i);
  assert.doesNotMatch(output, /must-not-print/);
  assert.doesNotMatch(output, /object_key/i);
});

test("labels missing repeat provenance instead of inventing it", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 1,
      evaluation: { outcome: "repeat_accepted", repeatCloseEnough: true },
      audio_clips: [],
    },
    {},
  ).join("\n");
  assert.match(
    output,
    /original evaluation unavailable \(legacy row or stale runtime\)/i,
  );
});

test("prints contract violations that explain a failed_schema fallback", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 2,
      evaluation: {
        outcome: "teacher_review",
        reviewReason: "failed_schema",
        contractViolations: [
          "fragment_ungrounded",
          "romanization_artifact",
        ],
        privatePayload: "must-not-print",
      },
      audio_clips: [],
    },
    {},
  ).join("\n");

  assert.match(
    output,
    /contract violations: fragment_ungrounded, romanization_artifact/i,
  );
  assert.doesNotMatch(output, /must-not-print|privatePayload/i);
});

test("prints a to-one pronunciation score returned by Supabase", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 1,
      evaluation: {
        outcome: "teacher_review",
        reviewReason: "ambiguous",
      },
      audio_clips: [
        {
          clip_kind: "original_answer",
          pronunciation_scores: {
            accuracy_score: 91,
            fluency_score: 82,
            completeness_score: 93,
            pronunciation_score: 88,
            star_band: 3,
          },
        },
      ],
    },
    {},
  ).join("\n");

  assert.match(output, /review reason: ambiguous/i);
  assert.match(
    output,
    /pronunciation: accuracy=91 fluency=82 completeness=93 overall=88 stars=3/i,
  );
});

test("separates the prompt answered from the next generated line", () => {
  const turn1 = {
    turn_order: 1,
    original_transcript: "I am going to the beach.",
    coco_line: "What will you do at the beach?",
    evaluation: {},
    audio_clips: [],
  };
  const turn2 = {
    turn_order: 2,
    original_transcript: "I will swim.",
    coco_line: "What food will you eat?",
    evaluation: {},
    audio_clips: [],
  };
  const output = [
    ...formatAttemptTurn(turn1, {
      promptAnswered: "What are you going to do this summer?",
      snapshotTurn: { answerShape: "open" },
      conversationMode: true,
      generatedTurn: false,
      targetPattern: "I'm going to _____.",
    }),
    ...formatAttemptTurn(turn2, {
      promptAnswered: "What will you do at the beach?",
      snapshotTurn: null,
      conversationMode: true,
      generatedTurn: true,
      targetPattern: "I'm going to _____.",
    }),
  ].join("\n");

  assert.match(
    output,
    /prompt answered: What are you going to do this summer/,
  );
  assert.match(output, /next Coco line: What will you do at the beach/);
  assert.match(output, /answer shape: open \(runtime default\)/);
  assert.match(output, /lesson context \(soft\): I'm going to _____/);
  assert.doesNotMatch(output, /coco said:/i);
});

test("prints the stored conversation reply hint frame", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 2,
      original_transcript: "At home.",
      coco_line: "Who do you play that game with?",
      reply_hint_frame: "I play that game at ____.",
      evaluation: {},
      audio_clips: [],
    },
    {
      promptAnswered: "Where do you play that game?",
      snapshotTurn: null,
      conversationMode: true,
      generatedTurn: true,
      targetPattern: "I'm going to _____.",
    },
  ).join("\n");

  assert.match(output, /prompt answered: Where do you play that game\?/);
  assert.match(output, /reply hint frame: I play that game at ____\./);
});

test("reports a missing reply hint frame as not recorded, not as absent", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 2,
      original_transcript: "At home.",
      coco_line: "Who do you play that game with?",
      evaluation: {},
      audio_clips: [],
    },
    {
      promptAnswered: "Where do you play that game?",
      snapshotTurn: null,
      conversationMode: true,
      generatedTurn: true,
      targetPattern: "I'm going to _____.",
    },
  ).join("\n");

  assert.match(output, /reply hint frame: not recorded/);
});

test("does not print a reply hint frame line for preset missions", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 1,
      original_transcript: "I am going to swim.",
      reply_hint_frame: null,
      evaluation: {},
      audio_clips: [],
    },
    {
      promptAnswered: "What are you going to do this summer?",
      snapshotTurn: { targetExample: "I am going to ____." },
      conversationMode: false,
      generatedTurn: false,
    },
  ).join("\n");

  assert.doesNotMatch(output, /reply hint frame:/);
});

test("prints only bounded rejected candidate evidence", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 2,
      evaluation: {},
      moderation_event: {
        kind: "canned_fallback",
        cause: "reply_policy_failed",
        violations: ["topic_drift"],
        rejectedAttempt: "corrected",
        rejectedCandidate: {
          reaction: "Nice!",
          focus: "family meal",
          question: "What food will you eat?",
          object_key: "must-not-print",
          access_value: "must-not-print",
        },
      },
      audio_clips: [],
    },
    {
      promptAnswered: null,
      snapshotTurn: null,
      conversationMode: true,
      generatedTurn: true,
    },
  ).join("\n");

  assert.match(output, /prompt answered: unavailable \(legacy linkage\)/);
  assert.match(output, /rejected attempt: corrected/);
  assert.match(output, /rejected reaction: Nice!/);
  assert.match(output, /rejected focus: family meal/);
  assert.match(output, /rejected question: What food will you eat\?/);
  assert.doesNotMatch(output, /must-not-print/);
  assert.doesNotMatch(output, /object_key|access_value/i);
});
