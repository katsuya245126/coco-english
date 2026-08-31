import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { purgeExpiredPronunciationSamples } from "@/server/foundation/purgeExpiredAudio";
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

async function createCompletedSample(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  status: "pending" | "confirmed" = "pending",
) {
  const begun = await fixture.admin.rpc(
    "begin_teacher_pronunciation_sample",
    beginArgs(fixture),
  );
  expect(begun.error).toBeNull();
  expect(begun.data?.[0]?.outcome).toBe("ok");
  const sampleId = begun.data![0]!.sample_id!;
  const objectKey = begun.data![0]!.object_key!;
  const completed = await fixture.admin.rpc(
    "complete_teacher_pronunciation_sample",
    {
      p_teacher_id: fixture.ownerId,
      p_sample_id: sampleId,
      p_automatic_transcript: "fan",
      p_transcription_model: "test",
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
  expect(completed.error).toBeNull();
  expect(completed.data).toBe("ok");

  if (status === "confirmed") {
    const confirmation = await fixture.admin.rpc(
      "begin_teacher_pronunciation_sample_confirmation",
      { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
    );
    expect(confirmation.data?.[0]?.outcome).toBe("ok");
    const confirmed = await fixture.admin.rpc(
      "complete_teacher_pronunciation_sample_confirmation",
      {
        p_teacher_id: fixture.ownerId,
        p_sample_id: sampleId,
        p_confirmation_token: confirmation.data![0]!.confirmation_token!,
        p_teacher_confirmed_text: "fan",
        p_confirmed_result: confirmation.data![0]!.provisional_result!,
      },
    );
    expect(confirmed.error).toBeNull();
    expect(confirmed.data).toBe("ok");
  }

  expect(
    (
      await fixture.admin.storage
        .from("student-audio")
        .upload(objectKey, new Blob(["voice"], { type: "audio/webm" }))
    ).error,
  ).toBeNull();
  return { sampleId, objectKey };
}

describe("teacher pronunciation sample database seam", () => {
  it("cancels confirmation publication and removes only an owned sample", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const sample = await createCompletedSample(fixture);
      objectKey = sample.objectKey;
      const confirmation = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_confirmation",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(confirmation.data?.[0]?.outcome).toBe("ok");
      const token = confirmation.data![0]!.confirmation_token!;

      const foreign = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.otherId, p_sample_id: sample.sampleId },
      );
      expect(foreign.error).toBeNull();
      expect(foreign.data?.[0]?.outcome).toBe("not_found");

      const claimed = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(claimed.error).toBeNull();
      expect(claimed.data?.[0]?.outcome).toBe("ok");
      const deletionToken = claimed.data![0]!.deletion_token!;

      const staleConfirmation = await fixture.admin.rpc(
        "complete_teacher_pronunciation_sample_confirmation",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sample.sampleId,
          p_confirmation_token: token,
          p_teacher_confirmed_text: "fan",
          p_confirmed_result: {},
        },
      );
      expect(staleConfirmation.error).toBeNull();
      expect(staleConfirmation.data).toBe("not_found");

      expect(
        (
          await fixture.admin.storage.from("student-audio").remove([objectKey])
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "finalize_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: sample.sampleId,
              p_deletion_token: deletionToken,
            },
          )
        ).data,
      ).toBe("ok");

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .select("id")
            .eq("id", sample.sampleId)
        ).data,
      ).toHaveLength(0);
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("claims expired samples once, deletes pending rows, and retains confirmed evidence without audio", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const objectKeys: string[] = [];
    try {
      const pending = await createCompletedSample(fixture, "pending");
      const confirmed = await createCompletedSample(fixture, "confirmed");
      objectKeys.push(pending.objectKey, confirmed.objectKey);
      for (const sample of [pending, confirmed]) {
        expect(
          (
            await fixture.admin
              .from("pronunciation_samples")
              .update({ audio_expires_at: "2000-01-01T00:00:00.000Z" })
              .eq("id", sample.sampleId)
          ).error,
        ).toBeNull();
      }

      const [first, second] = await Promise.all([
        fixture.admin.rpc("claim_expired_teacher_pronunciation_samples", {
          p_limit: 1000,
        }),
        fixture.admin.rpc("claim_expired_teacher_pronunciation_samples", {
          p_limit: 1000,
        }),
      ]);
      const claims = [...(first.data ?? []), ...(second.data ?? [])];
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(claims.map((claim) => claim.sample_id).sort()).toEqual(
        [pending.sampleId, confirmed.sampleId].sort(),
      );
      expect(claims.every((claim) => claim.deletion_kind === "expiry")).toBe(true);
      expect(new Set(claims.map((claim) => claim.deletion_token)).size).toBe(2);

      for (const claim of claims) {
        expect(
          (
            await fixture.admin.storage
              .from("student-audio")
              .remove(claim.object_key ? [claim.object_key] : [])
          ).error,
        ).toBeNull();
        expect(
          (
            await fixture.admin.rpc(
              "finalize_expired_teacher_pronunciation_sample_deletion",
              {
                p_teacher_id: claim.teacher_id,
                p_sample_id: claim.sample_id,
                p_deletion_token: claim.deletion_token,
              },
            )
          ).data,
        ).toBe("ok");
      }

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .select("id")
            .eq("id", pending.sampleId)
        ).data,
      ).toHaveLength(0);
      const retained = await fixture.admin
        .from("pronunciation_samples")
        .select(
          "status, automatic_transcript, provisional_result, object_key, mime_type, duration_ms, byte_size, audio_expires_at, deletion_started_at, deletion_token",
        )
        .eq("id", confirmed.sampleId)
        .single();
      expect(retained.error).toBeNull();
      expect(retained.data).toMatchObject({
        status: "confirmed",
        automatic_transcript: "fan",
        provisional_result: { referenceText: "fan" },
        object_key: null,
        mime_type: "audio/webm",
        duration_ms: 2_000,
        byte_size: 100,
        deletion_started_at: null,
        deletion_token: null,
      });

      const again = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      expect(again.error).toBeNull();
      expect(again.data).toEqual([]);
    } finally {
      for (const objectKey of objectKeys) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("holds a playback lease against deletion until the lease expires", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const sample = await createCompletedSample(fixture);
      objectKey = sample.objectKey;
      const playback = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_playback",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(playback.error).toBeNull();
      expect(playback.data).toEqual([{
        outcome: "ok",
        object_key: sample.objectKey,
      }]);

      const repeatedPlayback = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_playback",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(repeatedPlayback.error).toBeNull();
      expect(repeatedPlayback.data?.[0]?.outcome).toBe("ok");

      const lease = await fixture.admin
        .from("pronunciation_samples")
        .select("playback_lease_until")
        .eq("id", sample.sampleId)
        .single();
      expect(lease.error).toBeNull();
      expect(lease.data?.playback_lease_until).not.toBeNull();

      const blockedDeletion = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(blockedDeletion.error).toBeNull();
      expect(blockedDeletion.data?.[0]?.outcome).toBe("unavailable");

      const blockedExpiry = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      expect(blockedExpiry.error).toBeNull();
      expect(blockedExpiry.data).toEqual([]);

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({
              audio_expires_at: "2000-01-01T00:00:00.000Z",
              playback_lease_until: "2000-01-01T00:00:00.000Z",
            })
            .eq("id", sample.sampleId)
        ).error,
      ).toBeNull();

      const claimedAfterLease = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(claimedAfterLease.error).toBeNull();
      expect(claimedAfterLease.data?.[0]?.outcome).toBe("ok");
      const deletionToken = claimedAfterLease.data![0]!.deletion_token!;

      expect(
        (
          await fixture.admin.storage.from("student-audio").remove([objectKey])
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "finalize_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: sample.sampleId,
              p_deletion_token: deletionToken,
            },
          )
        ).data,
      ).toBe("ok");
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("keeps a teacher claim fenced when finalization rejects after Storage succeeds", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const sample = await createCompletedSample(fixture);
      objectKey = sample.objectKey;
      const claimed = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(claimed.data?.[0]?.outcome).toBe("ok");
      const deletionToken = claimed.data![0]!.deletion_token!;

      expect(
        (
          await fixture.admin.storage.from("student-audio").remove([objectKey])
        ).error,
      ).toBeNull();
      const failedFinalize = await fixture.admin.rpc(
        "finalize_teacher_pronunciation_sample_deletion",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sample.sampleId,
          p_deletion_token: "00000000-0000-0000-0000-000000000000",
        },
      );
      expect(failedFinalize.error).toBeNull();
      expect(failedFinalize.data).toBe("not_found");

      const stillClaimed = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(stillClaimed.error).toBeNull();
      expect(stillClaimed.data?.[0]?.outcome).toBe("unavailable");
      const row = await fixture.admin
        .from("pronunciation_samples")
        .select("deletion_kind, deletion_token")
        .eq("id", sample.sampleId)
        .single();
      expect(row.error).toBeNull();
      expect(row.data).toMatchObject({
        deletion_kind: "teacher",
        deletion_token: deletionToken,
      });

      expect(
        (
          await fixture.admin.rpc(
            "finalize_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: sample.sampleId,
              p_deletion_token: deletionToken,
            },
          )
        ).data,
      ).toBe("ok");
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("purges a stale confirmed teacher-removal claim as a full row deletion", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const sample = await createCompletedSample(fixture, "confirmed");
      objectKey = sample.objectKey;
      const firstTeacherClaim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: sample.sampleId },
      );
      expect(firstTeacherClaim.data?.[0]?.outcome).toBe("ok");
      const oldToken = firstTeacherClaim.data![0]!.deletion_token!;

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({
              audio_expires_at: "2000-01-01T00:00:00.000Z",
              deletion_started_at: "2000-01-01T00:00:00.000Z",
            })
            .eq("id", sample.sampleId)
        ).error,
      ).toBeNull();

      const takeover = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      const recovered = takeover.data?.find(
        (claim) => claim.sample_id === sample.sampleId,
      );
      expect(recovered?.teacher_id).toBe(fixture.ownerId);
      expect(recovered?.deletion_kind).toBe("teacher");
      expect(recovered?.deletion_token).not.toBe(oldToken);

      const staleFinalize = await fixture.admin.rpc(
        "finalize_teacher_pronunciation_sample_deletion",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sample.sampleId,
          p_deletion_token: oldToken,
        },
      );
      expect(staleFinalize.error).toBeNull();
      expect(staleFinalize.data).toBe("not_found");

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ deletion_started_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", sample.sampleId)
        ).error,
      ).toBeNull();
      await expect(purgeExpiredPronunciationSamples(fixture.admin)).resolves.toBe(1);

      const deleted = await fixture.admin
        .from("pronunciation_samples")
        .select("id")
        .eq("id", sample.sampleId);
      expect(deleted.error).toBeNull();
      expect(deleted.data).toHaveLength(0);
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("reclaims only stale claims with ownership and token fencing", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const objectKeys: string[] = [];
    try {
      const staleTeacher = await createCompletedSample(fixture);
      objectKeys.push(staleTeacher.objectKey);
      const firstTeacherClaim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: staleTeacher.sampleId },
      );
      expect(firstTeacherClaim.data?.[0]?.outcome).toBe("ok");
      const oldTeacherToken = firstTeacherClaim.data![0]!.deletion_token!;

      const activeTeacherClaim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: staleTeacher.sampleId },
      );
      expect(activeTeacherClaim.data?.[0]?.outcome).toBe("unavailable");

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({
              audio_expires_at: "2000-01-01T00:00:00.000Z",
              deletion_started_at: "2000-01-01T00:00:00.000Z",
            })
            .eq("id", staleTeacher.sampleId)
        ).error,
      ).toBeNull();

      const expiryRecoversTeacherClaim = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      expect(
        expiryRecoversTeacherClaim.data?.some(
          (claim) => claim.sample_id === staleTeacher.sampleId,
        ),
      ).toBe(true);
      expect(
        expiryRecoversTeacherClaim.data?.find(
          (claim) => claim.sample_id === staleTeacher.sampleId,
        )?.deletion_kind,
      ).toBe("teacher");

      const activeOwnerTakeover = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: staleTeacher.sampleId },
      );
      expect(activeOwnerTakeover.data?.[0]?.outcome).toBe("unavailable");

      const foreignTeacherClaim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.otherId, p_sample_id: staleTeacher.sampleId },
      );
      expect(foreignTeacherClaim.data?.[0]?.outcome).toBe("not_found");

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ deletion_started_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", staleTeacher.sampleId)
        ).error,
      ).toBeNull();

      const reclaimedTeacherClaim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        { p_teacher_id: fixture.ownerId, p_sample_id: staleTeacher.sampleId },
      );
      expect(reclaimedTeacherClaim.data?.[0]?.outcome).toBe("ok");
      const newTeacherToken = reclaimedTeacherClaim.data![0]!.deletion_token!;
      expect(newTeacherToken).not.toBe(oldTeacherToken);

      const staleTeacherFinalize = await fixture.admin.rpc(
        "finalize_teacher_pronunciation_sample_deletion",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: staleTeacher.sampleId,
          p_deletion_token: oldTeacherToken,
        },
      );
      expect(staleTeacherFinalize.data).toBe("not_found");

      expect(
        (
          await fixture.admin.storage
            .from("student-audio")
            .remove([staleTeacher.objectKey])
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "finalize_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: staleTeacher.sampleId,
              p_deletion_token: newTeacherToken,
            },
          )
        ).data,
      ).toBe("ok");

      const staleExpiryForOwner = await createCompletedSample(fixture);
      objectKeys.push(staleExpiryForOwner.objectKey);
      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ audio_expires_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", staleExpiryForOwner.sampleId)
        ).error,
      ).toBeNull();
      const firstExpiryClaim = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      expect(firstExpiryClaim.data).toHaveLength(1);
      expect(firstExpiryClaim.data?.[0]?.teacher_id).toBe(fixture.ownerId);
      expect(firstExpiryClaim.data?.[0]?.deletion_kind).toBe("expiry");
      const oldExpiryToken = firstExpiryClaim.data![0]!.deletion_token!;

      const activeExpiryClaim = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      expect(activeExpiryClaim.data).toEqual([]);
      const blockedOwnerTakeover = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: staleExpiryForOwner.sampleId,
        },
      );
      expect(blockedOwnerTakeover.data?.[0]?.outcome).toBe("unavailable");

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ deletion_started_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", staleExpiryForOwner.sampleId)
        ).error,
      ).toBeNull();

      const reclaimedByOwner = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_deletion",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: staleExpiryForOwner.sampleId,
        },
      );
      expect(reclaimedByOwner.data?.[0]?.outcome).toBe("ok");
      const ownerToken = reclaimedByOwner.data![0]!.deletion_token!;
      expect(ownerToken).not.toBe(oldExpiryToken);
      expect(
        (
          await fixture.admin.rpc(
            "finalize_expired_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: staleExpiryForOwner.sampleId,
              p_deletion_token: oldExpiryToken,
            },
          )
        ).data,
      ).toBe("not_found");

      const staleExpiryForPurge = await createCompletedSample(fixture);
      objectKeys.push(staleExpiryForPurge.objectKey);
      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ audio_expires_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", staleExpiryForPurge.sampleId)
        ).error,
      ).toBeNull();
      const initialPurgeClaim = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      const purgeClaim = initialPurgeClaim.data?.find(
        (claim) => claim.sample_id === staleExpiryForPurge.sampleId,
      );
      expect(purgeClaim?.teacher_id).toBe(fixture.ownerId);
      expect(purgeClaim?.deletion_token).toBeTruthy();
      const oldPurgeToken = purgeClaim!.deletion_token;
      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ deletion_started_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", staleExpiryForPurge.sampleId)
        ).error,
      ).toBeNull();
      const reclaimedPurge = await fixture.admin.rpc(
        "claim_expired_teacher_pronunciation_samples",
        { p_limit: 1000 },
      );
      const newPurgeClaim = reclaimedPurge.data?.find(
        (claim) => claim.sample_id === staleExpiryForPurge.sampleId,
      );
      expect(newPurgeClaim?.teacher_id).toBe(fixture.ownerId);
      expect(newPurgeClaim?.deletion_kind).toBe("expiry");
      expect(newPurgeClaim?.deletion_token).not.toBe(oldPurgeToken);

      expect(
        (
          await fixture.admin.rpc(
            "finalize_expired_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.otherId,
              p_sample_id: staleExpiryForPurge.sampleId,
              p_deletion_token: newPurgeClaim!.deletion_token,
            },
          )
        ).data,
      ).toBe("not_found");

      expect(
        (
          await fixture.admin.storage
            .from("student-audio")
            .remove([staleExpiryForPurge.objectKey])
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "finalize_expired_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: staleExpiryForPurge.sampleId,
              p_deletion_token: newPurgeClaim!.deletion_token,
            },
          )
        ).data,
      ).toBe("ok");

      expect(
        (
          await fixture.admin.storage
            .from("student-audio")
            .remove([staleExpiryForOwner.objectKey])
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "finalize_teacher_pronunciation_sample_deletion",
            {
              p_teacher_id: fixture.ownerId,
              p_sample_id: staleExpiryForOwner.sampleId,
              p_deletion_token: ownerToken,
            },
          )
        ).data,
      ).toBe("ok");
    } finally {
      for (const objectKey of objectKeys) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("serializes confirmation and atomically retains automatic evidence", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    let objectKey: string | null = null;
    try {
      const begun = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample",
        beginArgs(fixture),
      );
      expect(begun.data?.[0]?.outcome).toBe("ok");
      const sampleId = begun.data![0]!.sample_id!;
      objectKey = begun.data![0]!.object_key!;
      expect(
        (
          await fixture.admin.rpc("complete_teacher_pronunciation_sample", {
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
          })
        ).data,
      ).toBe("ok");

      const [first, second] = await Promise.all([
        fixture.admin.rpc(
          "begin_teacher_pronunciation_sample_confirmation",
          { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
        ),
        fixture.admin.rpc(
          "begin_teacher_pronunciation_sample_confirmation",
          { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
        ),
      ]);
      expect([first.data?.[0]?.outcome, second.data?.[0]?.outcome].sort()).toEqual([
        "ok",
        "unavailable",
      ]);
      const claim = first.data?.[0]?.outcome === "ok" ? first : second;
      const token = claim.data![0]!.confirmation_token!;

      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ confirmation_started_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", sampleId)
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.admin.rpc(
            "begin_teacher_pronunciation_sample_confirmation",
            { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
          )
        ).data?.[0]?.outcome,
      ).toBe("unavailable");

      const confirmed = await fixture.admin.rpc(
        "complete_teacher_pronunciation_sample_confirmation",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sampleId,
          p_confirmation_token: token,
          p_teacher_confirmed_text: "pan",
          p_confirmed_result: {
            accuracyScore: 55,
            fluencyScore: 60,
            completenessScore: 70,
            pronunciationScore: 57,
            starBand: 1,
            referenceText: "pan",
            wordScores: [],
          },
        },
      );
      expect(confirmed.error).toBeNull();
      expect(confirmed.data).toBe("ok");

      const row = await fixture.admin
        .from("pronunciation_samples")
        .select(
          "status, automatic_transcript, teacher_confirmed_text, provisional_result, confirmed_by_teacher_id, confirmed_at, confirmation_token",
        )
        .eq("id", sampleId)
        .single();
      expect(row.error).toBeNull();
      expect(row.data).toMatchObject({
        status: "confirmed",
        automatic_transcript: "fan",
        teacher_confirmed_text: "pan",
        confirmed_by_teacher_id: fixture.ownerId,
        provisional_result: { referenceText: "pan" },
        confirmation_token: null,
      });
      expect(row.data?.confirmed_at).not.toBeNull();

      expect(
        (
          await fixture.admin.rpc(
            "read_teacher_pronunciation_sample_confirmation",
            { p_teacher_id: fixture.otherId, p_sample_id: sampleId },
          )
        ).data?.[0]?.outcome,
      ).toBe("not_found");
      expect(
        (
          await fixture.admin.rpc(
            "begin_teacher_pronunciation_sample_confirmation",
            { p_teacher_id: fixture.otherId, p_sample_id: sampleId },
          )
        ).data?.[0]?.outcome,
      ).toBe("not_found");
    } finally {
      if (objectKey) {
        await fixture.admin.storage.from("student-audio").remove([objectKey]);
      }
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("promotes unchanged confirmation after audio expiry", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const begun = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample",
        beginArgs(fixture),
      );
      const sampleId = begun.data![0]!.sample_id!;
      expect(
        (
          await fixture.admin.rpc("complete_teacher_pronunciation_sample", {
            p_teacher_id: fixture.ownerId,
            p_sample_id: sampleId,
            p_automatic_transcript: "fan",
            p_transcription_model: "test",
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
          })
        ).data,
      ).toBe("ok");
      expect(
        (
          await fixture.admin
            .from("pronunciation_samples")
            .update({ audio_expires_at: "2000-01-01T00:00:00.000Z" })
            .eq("id", sampleId)
        ).error,
      ).toBeNull();

      const preflight = await fixture.admin.rpc(
        "read_teacher_pronunciation_sample_confirmation",
        { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
      );
      expect(preflight.error).toBeNull();
      expect(preflight.data?.[0]?.outcome).toBe("ok");

      const claim = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_confirmation",
        { p_teacher_id: fixture.ownerId, p_sample_id: sampleId },
      );
      expect(claim.data?.[0]?.outcome).toBe("ok");
      const completed = await fixture.admin.rpc(
        "complete_teacher_pronunciation_sample_confirmation",
        {
          p_teacher_id: fixture.ownerId,
          p_sample_id: sampleId,
          p_confirmation_token: claim.data![0]!.confirmation_token!,
          p_teacher_confirmed_text: "fan",
          p_confirmed_result: claim.data![0]!.provisional_result!,
        },
      );
      expect(completed.error).toBeNull();
      expect(completed.data).toBe("ok");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

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
      const foreignPlayback = await fixture.admin.rpc(
        "begin_teacher_pronunciation_sample_playback",
        { p_teacher_id: fixture.otherId, p_sample_id: sampleId },
      );
      expect(foreignPlayback.error).toBeNull();
      expect(foreignPlayback.data?.[0]?.outcome).toBe("not_found");

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
        (
          await owner.rpc("begin_teacher_pronunciation_sample_confirmation", {
            p_teacher_id: fixture.ownerId,
            p_sample_id: sampleId,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc("complete_teacher_pronunciation_sample_confirmation", {
            p_teacher_id: fixture.ownerId,
            p_sample_id: sampleId,
            p_confirmation_token: "00000000-0000-0000-0000-000000000000",
            p_teacher_confirmed_text: "fan",
            p_confirmed_result: {},
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc("clear_teacher_pronunciation_sample_confirmation", {
            p_teacher_id: fixture.ownerId,
            p_sample_id: sampleId,
            p_confirmation_token: "00000000-0000-0000-0000-000000000000",
          })
        ).error,
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
