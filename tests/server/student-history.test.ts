import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

import { getCompletedMissionRecap } from "@/server/student-access/student-history";

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
          mission_snapshot: {
            targetPattern: "I am going to...",
            turns: [
              { turnOrder: 0, prompt: "What will you do?" },
              { turnOrder: 1, prompt: "Who will go?" },
              { turnOrder: 2, prompt: "What else?" },
            ],
          },
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
        { id: "turn-original", turn_order: 0, original_transcript: "I play soccer with funny friends today", repeat_transcript: null, repeat_accepted: false },
        { id: "turn-repeat", turn_order: 1, original_transcript: "My original answer", repeat_transcript: "Ramen tastes better", repeat_accepted: true },
        { id: "turn-clear", turn_order: 2, original_transcript: "I feel ready", repeat_transcript: null, repeat_accepted: false },
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
    const recapType = source.slice(source.indexOf("export type StudentMissionRecap"), source.indexOf("type Snapshot"));
    expect(recapType).not.toContain("signedUrl");
    expect(source).toContain('"expired"');
    expect(source).toContain('"unavailable"');
    expect(source).toContain("deleted_at");
    expect(source).toContain("audio_expires_at");
  });

  it("authorizes clips through the owned latest completed attempt and signs for 300 seconds", () => {
    expect(source).toContain("attempt.id !== assignmentStudent.latest_attempt_id");
    expect(source).toContain("AUDIO_TTL_SECONDS = 300");
    expect(source).toContain("createSignedUrl(row.object_key!, AUDIO_TTL_SECONDS)");
  });
});

describe("student completed mission recap pronunciation", () => {
  it("uses the displayed transcript and shared practice-word rules", async () => {
    mockSupabase = createMockSupabase();

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

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
