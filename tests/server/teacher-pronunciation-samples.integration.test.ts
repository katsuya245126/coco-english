import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { createSignedPronunciationSampleUrlForTeacher } from "@/server/teacher/pronunciation-samples";

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

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function createFixture() {
  const admin = await createAdminClient();
  const suffix = randomBytes(12).toString("hex");
  const password = "Test-Passw0rd!";
  const ownerUser = await admin.auth.admin.createUser({
    email: `sample-owner-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  const otherUser = await admin.auth.admin.createUser({
    email: `sample-other-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  expect(ownerUser.error).toBeNull();
  expect(otherUser.error).toBeNull();

  const owner = await admin
    .from("teacher_profiles")
    .insert({
      auth_user_id: ownerUser.data.user!.id,
      display_name: "Owner",
    })
    .select("id")
    .single();
  const other = await admin
    .from("teacher_profiles")
    .insert({
      auth_user_id: otherUser.data.user!.id,
      display_name: "Other",
    })
    .select("id")
    .single();
  const classroom = await admin
    .from("classes")
    .insert({
      teacher_id: owner.data!.id,
      name: `Class ${suffix}`,
      join_code: `S${suffix}`.slice(0, 12),
      data_mode: "real",
    })
    .select("id")
    .single();
  const student = await admin
    .from("students")
    .insert({ class_id: classroom.data!.id, display_name: `Student ${suffix}` })
    .select("id")
    .single();

  for (const result of [owner, other, classroom, student]) {
    expect(result.error).toBeNull();
  }

  return {
    admin,
    password,
    ownerUser: ownerUser.data.user!,
    otherUser: otherUser.data.user!,
    ownerId: owner.data!.id,
    otherId: other.data!.id,
    studentId: student.data!.id,
  };
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await fixture.admin
    .from("teacher_profiles")
    .delete()
    .in("id", [fixture.ownerId, fixture.otherId]);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerUser.id);
  await fixture.admin.auth.admin.deleteUser(fixture.otherUser.id);
}

function beginArgs(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  teacherId = fixture.ownerId,
) {
  return {
    p_teacher_id: teacherId,
    p_student_id: fixture.studentId,
    p_mime_type: "audio/webm",
    p_duration_ms: 2_000,
    p_byte_size: 100,
  };
}

describe("teacher pronunciation sample database seam", () => {
  it("serializes owned begins and hides foreign sample data", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const results = await Promise.all([
        fixture.admin.rpc(
          "begin_teacher_pronunciation_sample",
          beginArgs(fixture),
        ),
        fixture.admin.rpc(
          "begin_teacher_pronunciation_sample",
          beginArgs(fixture),
        ),
      ]);
      expect(results.map(({ error }) => error)).toEqual([null, null]);
      expect(results.map(({ data }) => data?.[0]?.outcome)).toEqual([
        "ok",
        "ok",
      ]);

      const rows = await fixture.admin
        .from("pronunciation_samples")
        .select("id, student_id, status, object_key")
        .eq("student_id", fixture.studentId);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(2);

      const sampleId = rows.data![0]!.id;
      const complete = await fixture.admin.rpc(
        "complete_teacher_pronunciation_sample",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sampleId,
          p_automatic_transcript: "fan",
          p_transcription_model: "test-transcriber",
          p_transcription_confidence: null,
          p_provisional_result: {
            accuracyScore: 70,
            fluencyScore: 80,
            completenessScore: 90,
            pronunciationScore: 75,
            starBand: 2,
            referenceText: "fan",
            wordScores: [],
          },
        },
      );
      expect(complete.error).toBeNull();
      expect(complete.data).toBe("ok");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("denies cross-teacher lifecycle calls and authenticated direct writes", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const foreignBegin = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample",
        beginArgs(fixture, fixture.otherId),
      );
      expect(foreignBegin.error).toBeNull();
      expect(foreignBegin.data?.[0]?.outcome).toBe("unauthorized");

      const owned = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample",
        beginArgs(fixture),
      );
      expect(owned.data?.[0]?.outcome).toBe("ok");
      const sampleId = owned.data![0]!.sample_id!;
      objectKey = owned.data![0]!.object_key!;

      expect(
        (
          await fixture.admin.rpc(
            "complete_teacher_pronunciation_sample",
            {
              p_teacher_id: fixture.otherId,
              p_sample_id: sampleId,
              p_automatic_transcript: "fan",
              p_transcription_model: "test",
              p_transcription_confidence: null,
              p_provisional_result: {},
            },
          )
        ).data,
      ).toBe("not_found");
      expect(
        (
          await fixture.admin.rpc("clear_teacher_pronunciation_sample", {
            p_teacher_id: fixture.otherId,
            p_sample_id: sampleId,
          })
        ).data,
      ).toBe("not_found");

      const completed = await fixture.admin.rpc(
        "complete_teacher_pronunciation_sample",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sampleId,
          p_automatic_transcript: "fan",
          p_transcription_model: "test",
          p_transcription_confidence: null,
          p_provisional_result: {},
        },
      );
      expect(completed.data).toBe("ok");
      expect(
        (
          await fixture.admin.storage
            .from("student-audio")
            .upload(objectKey, new Blob(["voice"], { type: "audio/webm" }))
        ).error,
      ).toBeNull();
      await expect(
        createSignedPronunciationSampleUrlForTeacher(
          { teacherId: fixture.ownerId, sampleId },
          { client: fixture.admin },
        ),
      ).resolves.toEqual({ signedUrl: expect.any(String) });
      await expect(
        createSignedPronunciationSampleUrlForTeacher(
          { teacherId: fixture.otherId, sampleId },
          { client: fixture.admin },
        ),
      ).resolves.toBeNull();

      const { createClient } = await import("@supabase/supabase-js");
      const owner = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const other = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      expect(
        (
          await owner.auth.signInWithPassword({
            email: fixture.ownerUser.email!,
            password: fixture.password,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await other.auth.signInWithPassword({
            email: fixture.otherUser.email!,
            password: fixture.password,
          })
        ).error,
      ).toBeNull();

      expect(
        (await owner.rpc("clear_teacher_pronunciation_sample", {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sampleId,
        })).error,
      ).not.toBeNull();
      expect(
        (await owner.from("pronunciation_samples").select("id").eq("id", sampleId)).data,
      ).toHaveLength(1);
      expect(
        (await other.from("pronunciation_samples").select("id").eq("id", sampleId)).data,
      ).toHaveLength(0);
      expect(
        (
          await owner
            .from("pronunciation_samples")
            .update({ automatic_transcript: "tampered" })
            .eq("id", sampleId)
        ).error,
      ).not.toBeNull();
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);
});
