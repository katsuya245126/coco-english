import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAssignmentPolicy,
  formatAttemptTurn,
} from "./attempt-report.mjs";

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
