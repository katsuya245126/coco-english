import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

const noRealtime = {
  realtime: {
    transport: class {
      constructor() {}
      close() {}
    } as unknown as never,
  },
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function createFixture(kind: "original_answer" | "repeat_attempt" = "original_answer") {
  const admin = await createAdminClient();
  const suffix = randomBytes(12).toString("hex");
  const password = "Test-Passw0rd!";
  const ownerUser = await admin.auth.admin.createUser({
    email: `pronunciation-owner-${suffix}@example.test`, password, email_confirm: true,
  });
  const otherUser = await admin.auth.admin.createUser({
    email: `pronunciation-other-${suffix}@example.test`, password, email_confirm: true,
  });
  expect(ownerUser.error).toBeNull();
  expect(otherUser.error).toBeNull();

  const owner = await admin.from("teacher_profiles").insert({
    auth_user_id: ownerUser.data.user!.id, display_name: "Owner",
  }).select("id").single();
  const other = await admin.from("teacher_profiles").insert({
    auth_user_id: otherUser.data.user!.id, display_name: "Other",
  }).select("id").single();
  expect(owner.error).toBeNull();
  expect(other.error).toBeNull();
  const classroom = await admin.from("classes").insert({
    teacher_id: owner.data!.id, name: `Class ${suffix}`, join_code: `P${suffix}`.slice(0, 12), data_mode: "real",
  }).select("id").single();
  const student = await admin.from("students").insert({
    class_id: classroom.data!.id, display_name: `Student ${suffix}`,
  }).select("id").single();
  const mission = await admin.from("missions").insert({
    teacher_id: owner.data!.id, title: "Mission", target_pattern: "I like cats.", topic: "pets", level: "elementary", required_turns: 1, character_id: "default-buddy",
  }).select("id").single();
  const assignment = await admin.from("assignments").insert({
    class_id: classroom.data!.id, mission_id: mission.data!.id, title: "Assignment", data_mode: "real", mission_snapshot: { turns: [] },
  }).select("id").single();
  const assignmentStudent = await admin.from("assignment_students").insert({
    assignment_id: assignment.data!.id, student_id: student.data!.id,
  }).select("id").single();
  const attempt = await admin.from("attempts").insert({
    assignment_student_id: assignmentStudent.data!.id,
  }).select("id").single();
  const turn = await admin.from("attempt_turns").insert({
    attempt_id: attempt.data!.id, turn_order: 1,
    original_transcript: " original transcript ", improved_sentence: " improved sentence ", repeat_transcript: " repeat transcript ",
  }).select("id").single();
  const clip = await admin.from("audio_clips").insert({
    attempt_turn_id: turn.data!.id, clip_kind: kind, object_key: `test/${suffix}.webm`, mime_type: "audio/webm", duration_ms: 900, processing_status: "uploaded",
  }).select("id").single();

  for (const result of [classroom, student, mission, assignment, assignmentStudent, attempt, turn, clip]) {
    expect(result.error).toBeNull();
  }

  return {
    admin,
    password,
    ownerUser: ownerUser.data.user!,
    otherUser: otherUser.data.user!,
    ownerId: owner.data!.id,
    otherId: other.data!.id,
    turnId: turn.data!.id,
    clipId: clip.data!.id,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await fixture.admin.from("teacher_profiles").delete().in("id", [
    fixture.ownerId,
    fixture.otherId,
  ]);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerUser.id);
  await fixture.admin.auth.admin.deleteUser(fixture.otherUser.id);
}

const beginArgs = (fixture: Fixture, teacherId = fixture.ownerId) => ({
  p_teacher_id: teacherId, p_audio_clip_id: fixture.clipId,
});

const completeArgs = (fixture: Fixture, teacherId = fixture.ownerId) => ({
  ...beginArgs(fixture, teacherId), p_accuracy_score: 91, p_fluency_score: 92,
  p_completeness_score: 93, p_pronunciation_score: 94, p_star_band: 3, p_word_scores: [],
});

const beginClarificationArgs = (
  fixture: Fixture,
  teacherConfirmedText: string,
  teacherId = fixture.ownerId,
) => ({
  p_teacher_id: teacherId,
  p_audio_clip_id: fixture.clipId,
  p_teacher_confirmed_text: teacherConfirmedText,
});

const completeClarificationArgs = (
  fixture: Fixture,
  clarificationToken: string,
  teacherConfirmedText: string,
  teacherId = fixture.ownerId,
) => ({
  p_teacher_id: teacherId,
  p_audio_clip_id: fixture.clipId,
  p_clarification_token: clarificationToken,
  p_teacher_confirmed_text: teacherConfirmedText,
  p_accuracy_score: 81,
  p_fluency_score: 82,
  p_completeness_score: 83,
  p_pronunciation_score: 84,
  p_star_band: 2,
  p_word_scores: [{ word: "confirmed" }],
});

const clearClarificationArgs = (
  fixture: Fixture,
  clarificationToken: string,
  teacherId = fixture.ownerId,
) => ({
  p_teacher_id: teacherId,
  p_audio_clip_id: fixture.clipId,
  p_clarification_token: clarificationToken,
});

describe("pronunciation reprocessing database seam", () => {
  it("serializes owned begins and hides clip values from unavailable calls", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const results = await Promise.all([
        fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture)),
        fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture)),
      ]);
      expect(results.map(({ error }) => error)).toEqual([null, null]);
      expect(results.map(({ data }) => data?.[0]?.outcome).sort()).toEqual(["ok", "unavailable"]);
      const unavailable = results.find(({ data }) => data?.[0]?.outcome === "unavailable")?.data?.[0];
      expect(unavailable).toMatchObject({ object_key: null, duration_ms: null, reference_text: null });
    } finally { await cleanupFixture(fixture); }
  }, 30_000);

  it("denies cross-owner lifecycle calls and preserves an owned active marker", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      expect((await fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture, fixture.otherId))).data?.[0]?.outcome).toBe("unauthorized");
      expect((await fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture))).data?.[0]?.outcome).toBe("ok");
      expect((await fixture.admin.rpc("complete_pronunciation_reprocessing", completeArgs(fixture, fixture.otherId))).data).toBe("not_found");
      expect((await fixture.admin.rpc("clear_pronunciation_reprocessing", beginArgs(fixture, fixture.otherId))).data).toBe("not_found");
      const clip = await fixture.admin.from("audio_clips").select("pronunciation_reprocessing_started_at").eq("id", fixture.clipId).single();
      expect(clip.data?.pronunciation_reprocessing_started_at).not.toBeNull();
    } finally { await cleanupFixture(fixture); }
  }, 30_000);

  it("clears an owned claim for retry and completes only one score", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      expect((await fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture))).data?.[0]?.outcome).toBe("ok");
      expect((await fixture.admin.rpc("clear_pronunciation_reprocessing", beginArgs(fixture))).data).toBe("ok");
      expect((await fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture))).data?.[0]?.outcome).toBe("ok");
      expect((await fixture.admin.rpc("complete_pronunciation_reprocessing", completeArgs(fixture))).data).toBe("ok");
      const score = await fixture.admin.from("pronunciation_scores").select("id").eq("audio_clip_id", fixture.clipId);
      expect(score.data).toHaveLength(1);
      const clip = await fixture.admin.from("audio_clips").select("pronunciation_reprocessing_started_at").eq("id", fixture.clipId).single();
      expect(clip.data?.pronunciation_reprocessing_started_at).toBeNull();
      expect((await fixture.admin.rpc("begin_pronunciation_reprocessing", beginArgs(fixture))).data?.[0]?.outcome).toBe("already_scored");
    } finally { await cleanupFixture(fixture); }
  }, 30_000);

  it("uses the transcript appropriate to each clip kind", async (context) => {
    if (!canRunLocally) return context.skip();
    const original = await createFixture("original_answer");
    const repeat = await createFixture("repeat_attempt");
    try {
      expect((await original.admin.rpc("begin_pronunciation_reprocessing", beginArgs(original))).data?.[0]?.reference_text).toBe("original transcript");
      expect((await repeat.admin.rpc("begin_pronunciation_reprocessing", beginArgs(repeat))).data?.[0]?.reference_text).toBe("improved sentence");
    } finally { await cleanupFixture(original); await cleanupFixture(repeat); }
  }, 30_000);

  it("serializes owned clarification begins and hides unavailable values", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const results = await Promise.all([
        fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "I wake up at eight."),
        ),
        fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "I wake up at nine."),
        ),
      ]);
      expect(results.map(({ error }) => error)).toEqual([null, null]);
      expect(results.map(({ data }) => data?.[0]?.outcome).sort()).toEqual([
        "ok",
        "unavailable",
      ]);
      const unavailable = results.find(
        ({ data }) => data?.[0]?.outcome === "unavailable",
      )?.data?.[0];
      expect(unavailable).toMatchObject({
        object_key: null,
        duration_ms: null,
        clarification_token: null,
      });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("publishes teacher wording and replaces only that clip's score", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const priorScore = await fixture.admin.from("pronunciation_scores").insert({
        audio_clip_id: fixture.clipId,
        provider: "azure_speech",
        reference_text: "old reference",
        accuracy_score: 11,
        fluency_score: 12,
        completeness_score: 13,
        pronunciation_score: 14,
        star_band: 1,
        word_scores: [{ word: "old" }],
      });
      expect(priorScore.error).toBeNull();

      const sourceClip = await fixture.admin
        .from("audio_clips")
        .select("attempt_turn_id")
        .eq("id", fixture.clipId)
        .single();
      expect(sourceClip.error).toBeNull();
      const turnId = sourceClip.data!.attempt_turn_id;
      const beforeTurn = await fixture.admin
        .from("attempt_turns")
        .select("original_transcript, improved_sentence, repeat_transcript, evaluation")
        .eq("id", turnId)
        .single();
      expect(beforeTurn.error).toBeNull();

      const begin = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "  I wake up at eight.  "),
      );
      expect(begin.error).toBeNull();
      expect(begin.data?.[0]).toMatchObject({
        outcome: "ok",
        object_key: expect.stringContaining("test/"),
      });
      const token = begin.data?.[0]?.clarification_token;
      expect(token).toEqual(expect.any(String));

      const completed = await fixture.admin.rpc(
        "complete_teacher_mission_audio_clarification",
        completeClarificationArgs(fixture, token!, "I wake up at eight."),
      );
      expect(completed.error).toBeNull();
      expect(completed.data).toBe("ok");

      const clip = await fixture.admin
        .from("audio_clips")
        .select(
          "teacher_confirmed_text, teacher_confirmed_by, teacher_confirmed_at, clarification_started_at, clarification_token",
        )
        .eq("id", fixture.clipId)
        .single();
      expect(clip.data).toMatchObject({
        teacher_confirmed_text: "I wake up at eight.",
        teacher_confirmed_by: fixture.ownerId,
        clarification_started_at: null,
        clarification_token: null,
      });
      expect(clip.data?.teacher_confirmed_at).toEqual(expect.any(String));

      const score = await fixture.admin
        .from("pronunciation_scores")
        .select("provider, reference_text, accuracy_score, star_band, word_scores")
        .eq("audio_clip_id", fixture.clipId)
        .single();
      expect(score.data).toMatchObject({
        provider: "azure_speech",
        reference_text: "I wake up at eight.",
        accuracy_score: 81,
        star_band: 2,
        word_scores: [{ word: "confirmed" }],
      });

      const afterTurn = await fixture.admin
        .from("attempt_turns")
        .select("original_transcript, improved_sentence, repeat_transcript, evaluation")
        .eq("id", turnId)
        .single();
      expect(afterTurn.data).toEqual(beforeTurn.data);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("preserves prior wording and score after persistence failure, then retries", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      expect((await fixture.admin.from("audio_clips").update({
        teacher_confirmed_text: "old wording",
        teacher_confirmed_by: fixture.ownerId,
        teacher_confirmed_at: "2026-08-30T00:00:00.000Z",
      }).eq("id", fixture.clipId)).error).toBeNull();
      expect((await fixture.admin.from("pronunciation_scores").insert({
        audio_clip_id: fixture.clipId,
        provider: "azure_speech",
        reference_text: "old wording",
        accuracy_score: 11,
        pronunciation_score: 12,
        star_band: 1,
        word_scores: [{ word: "old" }],
      })).error).toBeNull();

      const begin = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "new wording"),
      );
      const token = begin.data?.[0]?.clarification_token;
      expect(token).toEqual(expect.any(String));

      const failed = await fixture.admin.rpc(
        "complete_teacher_mission_audio_clarification",
        { ...completeClarificationArgs(fixture, token!, "new wording"), p_star_band: 4 },
      );
      expect(failed.error).not.toBeNull();

      const preservedClip = await fixture.admin.from("audio_clips")
        .select("teacher_confirmed_text, clarification_token")
        .eq("id", fixture.clipId).single();
      const preservedScore = await fixture.admin.from("pronunciation_scores")
        .select("reference_text, pronunciation_score, word_scores")
        .eq("audio_clip_id", fixture.clipId).single();
      expect(preservedClip.data).toMatchObject({
        teacher_confirmed_text: "old wording",
        clarification_token: token,
      });
      expect(preservedScore.data).toMatchObject({
        reference_text: "old wording",
        pronunciation_score: 12,
        word_scores: [{ word: "old" }],
      });

      expect((await fixture.admin.rpc(
        "clear_teacher_mission_audio_clarification",
        clearClarificationArgs(fixture, token!),
      )).data).toBe("ok");
      const retry = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "new wording"),
      );
      const retryToken = retry.data?.[0]?.clarification_token;
      expect(retryToken).toEqual(expect.any(String));
      expect((await fixture.admin.rpc(
        "complete_teacher_mission_audio_clarification",
        completeClarificationArgs(fixture, retryToken!, "new wording"),
      )).data).toBe("ok");
      expect((await fixture.admin.from("pronunciation_scores")
        .select("reference_text").eq("audio_clip_id", fixture.clipId).single())
        .data?.reference_text).toBe("new wording");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("publishes confirmed wording for repeat-attempt audio", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture("repeat_attempt");
    try {
      const begin = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "the confirmed repeat"),
      );
      expect(begin.data?.[0]?.outcome).toBe("ok");
      const token = begin.data?.[0]?.clarification_token;
      expect(token).toEqual(expect.any(String));
      expect(
        (await fixture.admin.rpc(
          "complete_teacher_mission_audio_clarification",
          completeClarificationArgs(fixture, token!, "the confirmed repeat"),
        )).data,
      ).toBe("ok");
      const score = await fixture.admin
        .from("pronunciation_scores")
        .select("reference_text")
        .eq("audio_clip_id", fixture.clipId)
        .single();
      expect(score.data?.reference_text).toBe("the confirmed repeat");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("recovers an abandoned claim and rejects its stale token", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      expect(
        (await fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "foreign wording", fixture.otherId),
        )).data?.[0]?.outcome,
      ).toBe("unauthorized");

      const first = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "first wording"),
      );
      const firstToken = first.data?.[0]?.clarification_token;
      expect(first.data?.[0]?.outcome).toBe("ok");
      expect(firstToken).toEqual(expect.any(String));
      expect(
        (await fixture.admin
          .from("audio_clips")
          .update({ clarification_started_at: "2000-01-01T00:00:00.000Z" })
          .eq("id", fixture.clipId)).error,
      ).toBeNull();

      const second = await fixture.admin.rpc(
        "begin_teacher_mission_audio_clarification",
        beginClarificationArgs(fixture, "second wording"),
      );
      const secondToken = second.data?.[0]?.clarification_token;
      expect(second.data?.[0]?.outcome).toBe("ok");
      expect(secondToken).toEqual(expect.any(String));
      expect(secondToken).not.toBe(firstToken);

      expect(
        (await fixture.admin.rpc(
          "complete_teacher_mission_audio_clarification",
          completeClarificationArgs(
            fixture,
            secondToken!,
            "second wording",
            fixture.otherId,
          ),
        )).data,
      ).toBe("not_found");
      expect(
        (await fixture.admin.rpc(
          "clear_teacher_mission_audio_clarification",
          clearClarificationArgs(fixture, secondToken!, fixture.otherId),
        )).data,
      ).toBe("not_found");

      expect(
        (await fixture.admin.rpc(
          "complete_teacher_mission_audio_clarification",
          completeClarificationArgs(fixture, firstToken!, "first wording"),
        )).data,
      ).toBe("not_found");
      expect(
        (await fixture.admin.rpc(
          "clear_teacher_mission_audio_clarification",
          clearClarificationArgs(fixture, firstToken!),
        )).data,
      ).toBe("not_found");

      const active = await fixture.admin
        .from("audio_clips")
        .select("clarification_started_at, clarification_token")
        .eq("id", fixture.clipId)
        .single();
      expect(active.data?.clarification_started_at).not.toBeNull();
      expect(active.data?.clarification_token).toBe(secondToken);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("rejects expired and unplayable clips before claiming them", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      expect(
        (await fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "   "),
        )).data?.[0]?.outcome,
      ).toBe("invalid_input");

      expect(
        (await fixture.admin
          .from("audio_clips")
          .update({ audio_expires_at: "2000-01-01T00:00:00.000Z" })
          .eq("id", fixture.clipId)).error,
      ).toBeNull();
      expect(
        (await fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "expired wording"),
        )).data?.[0]?.outcome,
      ).toBe("unavailable");

      expect(
        (await fixture.admin
          .from("audio_clips")
          .update({
            audio_expires_at: "2099-01-01T00:00:00.000Z",
            processing_status: "failed",
          })
          .eq("id", fixture.clipId)).error,
      ).toBeNull();
      expect(
        (await fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "failed wording"),
        )).data?.[0]?.outcome,
      ).toBe("unavailable");

      expect(
        (await fixture.admin
          .from("audio_clips")
          .update({
            processing_status: "uploaded",
            object_key: null,
          })
          .eq("id", fixture.clipId)).error,
      ).toBeNull();
      expect(
        (await fixture.admin.rpc(
          "begin_teacher_mission_audio_clarification",
          beginClarificationArgs(fixture, "keyless wording"),
        )).data?.[0]?.outcome,
      ).toBe("unavailable");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("allows only service role RPCs and RLS-filtered authenticated audio reads", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime });
    const owner = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime });
    const other = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime });
    try {
      expect((await owner.auth.signInWithPassword({ email: fixture.ownerUser.email!, password: fixture.password })).error).toBeNull();
      expect((await other.auth.signInWithPassword({ email: fixture.otherUser.email!, password: fixture.password })).error).toBeNull();
      for (const client of [anon, owner]) {
        expect((await client.rpc("begin_pronunciation_reprocessing", beginArgs(fixture))).error).not.toBeNull();
        expect((await client.rpc("complete_pronunciation_reprocessing", completeArgs(fixture))).error).not.toBeNull();
        expect((await client.rpc("clear_pronunciation_reprocessing", beginArgs(fixture))).error).not.toBeNull();
        expect((await client.rpc("begin_teacher_mission_audio_clarification", beginClarificationArgs(fixture, "tampered wording"))).error).not.toBeNull();
        expect((await client.rpc("complete_teacher_mission_audio_clarification", completeClarificationArgs(fixture, "00000000-0000-0000-0000-000000000000", "tampered wording"))).error).not.toBeNull();
        expect((await client.rpc("clear_teacher_mission_audio_clarification", clearClarificationArgs(fixture, "00000000-0000-0000-0000-000000000000"))).error).not.toBeNull();
      }
      expect((await owner.from("audio_clips").select("id").eq("id", fixture.clipId)).data).toHaveLength(1);
      expect((await other.from("audio_clips").select("id").eq("id", fixture.clipId)).data).toHaveLength(0);
      expect((await owner.from("audio_clips").insert({ attempt_turn_id: "00000000-0000-0000-0000-000000000000", clip_kind: "original_answer" })).error).not.toBeNull();
      expect((await owner.from("audio_clips").update({ pronunciation_reprocessing_started_at: new Date().toISOString(), teacher_confirmed_text: "tampered" }).eq("id", fixture.clipId)).error).not.toBeNull();
      expect((await owner.from("attempt_turns").update({ original_transcript: "tampered" }).eq("id", fixture.turnId)).error).not.toBeNull();
      expect((await owner.from("pronunciation_scores").insert({
        audio_clip_id: fixture.clipId,
        reference_text: "tampered",
        accuracy_score: 1,
        pronunciation_score: 1,
        star_band: 1,
      })).error).not.toBeNull();
      expect((await owner.from("audio_clips").delete().eq("id", fixture.clipId)).error).not.toBeNull();
      const clip = await fixture.admin.from("audio_clips").select("pronunciation_reprocessing_started_at").eq("id", fixture.clipId).single();
      expect(clip.data?.pronunciation_reprocessing_started_at).toBeNull();
    } finally { await cleanupFixture(fixture); }
  }, 30_000);
});
