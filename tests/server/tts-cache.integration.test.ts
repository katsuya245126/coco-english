import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import {
  computeTtsContentHash,
  TTS_MODEL,
  TTS_PROVIDER,
  TTS_RESPONSE_FORMAT,
} from "@/domain/audio/tts";

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

const TTS_BUCKET = "tts-audio";

type AdminClient = SupabaseClient<Database>;

type TtsFixture = {
  teacherId: string;
  classId: string;
  missionId: string;
  assignmentId: string;
  assignmentStudentId: string;
  studentId: string;
};

async function createAdminClient(): Promise<AdminClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

function contentHash(text: string) {
  return computeTtsContentHash({
    text,
    characterId: "default-buddy",
    voice: "marin",
    provider: TTS_PROVIDER,
    model: TTS_MODEL,
    responseFormat: TTS_RESPONSE_FORMAT,
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function cleanupCache(
  admin: AdminClient,
  hash: string,
  extraObjectKeys: string[] = [],
): Promise<void> {
  const cached = await admin
    .from("tts_audio_cache")
    .select("object_key")
    .eq("content_hash", hash)
    .maybeSingle();
  const objectKeys = [
    ...extraObjectKeys,
    ...(cached.data?.object_key ? [cached.data.object_key] : []),
  ];
  if (objectKeys.length > 0) {
    await admin.storage.from(TTS_BUCKET).remove(objectKeys);
  }
  await admin.from("tts_audio_cache").delete().eq("content_hash", hash);
  await admin
    .from("tts_audio_generation_claims")
    .delete()
    .eq("content_hash", hash);
}

async function createFixture(
  admin: AdminClient,
  suffix: string,
): Promise<TtsFixture> {
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `TTS teacher ${suffix}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const classroom = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `TTS class ${suffix}`,
      join_code: `T${suffix}`.slice(0, 12),
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(classroom.error).toBeNull();

  const student = await admin
    .from("students")
    .insert({
      class_id: classroom.data!.id,
      display_name: `TTS student ${suffix}`,
    })
    .select("id")
    .single();
  expect(student.error).toBeNull();

  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `TTS mission ${suffix}`,
      target_pattern: "I like cats.",
      topic: "pets",
      level: "elementary",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const assignment = await admin
    .from("assignments")
    .insert({
      class_id: classroom.data!.id,
      mission_id: mission.data!.id,
      title: `TTS assignment ${suffix}`,
      mission_snapshot: { requiredTurns: 1, turns: [] },
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  const assignmentStudent = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: student.data!.id,
      status: "started",
    })
    .select("id")
    .single();
  expect(assignmentStudent.error).toBeNull();

  return {
    teacherId: teacher.data!.id,
    classId: classroom.data!.id,
    missionId: mission.data!.id,
    assignmentId: assignment.data!.id,
    assignmentStudentId: assignmentStudent.data!.id,
    studentId: student.data!.id,
  };
}

async function cleanupFixture(
  admin: AdminClient,
  fixture: TtsFixture,
): Promise<void> {
  await admin.from("assignments").delete().eq("id", fixture.assignmentId);
  await admin.from("missions").delete().eq("id", fixture.missionId);
  await admin.from("classes").delete().eq("id", fixture.classId);
  await admin.from("teacher_profiles").delete().eq("id", fixture.teacherId);
}

describe("TTS generation claims and publication fencing", () => {
  it(
    "keeps a stale owner from publishing after a newer owner finalizes",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const admin = await createAdminClient();
      const suffix = randomBytes(12).toString("hex");
      const hash = contentHash(`stale-owner-${suffix}`);
      const ownerAObjectKey = `openai/tmp/${hash}/owner-a-${suffix}.mp3`;
      const ownerBObjectKey = `openai/tmp/${hash}/owner-b-${suffix}.mp3`;
      let releaseOwnerAUpload: (() => void) | undefined;

      try {
        const claimA = await admin.rpc("claim_tts_audio_generation", {
          p_content_hash: hash,
          p_lease_seconds: 1,
        });
        expect(claimA.error).toBeNull();
        expect(claimA.data?.[0]?.acquired).toBe(true);
        const ownerAToken = claimA.data?.[0]?.owner_token;
        expect(ownerAToken).toBeTruthy();

        // Owner A has passed its claim check; this deferred upload represents
        // bytes still in flight while the one-second lease expires.
        const ownerAUpload = (async () => {
          await new Promise<void>((resolve) => {
            releaseOwnerAUpload = resolve;
          });
          const uploaded = await admin.storage
            .from(TTS_BUCKET)
            .upload(ownerAObjectKey, new Blob(["owner-a"]), {
              contentType: "audio/mpeg",
              upsert: false,
            });
          expect(uploaded.error).toBeNull();
        })();

        await delay(1_200);

        const claimB = await admin.rpc("claim_tts_audio_generation", {
          p_content_hash: hash,
          p_lease_seconds: 30,
        });
        expect(claimB.error).toBeNull();
        expect(claimB.data?.[0]?.acquired).toBe(true);
        const ownerBToken = claimB.data?.[0]?.owner_token;
        expect(ownerBToken).toBeTruthy();

        const ownerBUpload = await admin.storage
          .from(TTS_BUCKET)
          .upload(ownerBObjectKey, new Blob(["owner-b"]), {
            contentType: "audio/mpeg",
            upsert: false,
          });
        expect(ownerBUpload.error).toBeNull();

        const finalizedB = await admin.rpc("finalize_tts_audio_generation", {
          p_content_hash: hash,
          p_owner_token: ownerBToken!,
          p_object_key: ownerBObjectKey,
          p_mime_type: "audio/mpeg",
          p_byte_size: 7,
          p_provider: TTS_PROVIDER,
          p_model: TTS_MODEL,
          p_voice: "marin",
          p_response_format: TTS_RESPONSE_FORMAT,
          p_character_id: "default-buddy",
        });
        expect(finalizedB.error).toBeNull();
        expect(finalizedB.data?.[0]).toMatchObject({
          finalized: true,
          object_key: ownerBObjectKey,
        });

        releaseOwnerAUpload?.();
        await ownerAUpload;

        const staleFinalize = await admin.rpc("finalize_tts_audio_generation", {
          p_content_hash: hash,
          p_owner_token: ownerAToken!,
          p_object_key: ownerAObjectKey,
          p_mime_type: "audio/mpeg",
          p_byte_size: 7,
          p_provider: TTS_PROVIDER,
          p_model: TTS_MODEL,
          p_voice: "marin",
          p_response_format: TTS_RESPONSE_FORMAT,
          p_character_id: "default-buddy",
        });
        expect(staleFinalize.error).toBeNull();
        expect(staleFinalize.data?.[0]).toMatchObject({
          finalized: false,
          object_key: ownerBObjectKey,
        });

        const cache = await admin
          .from("tts_audio_cache")
          .select("object_key")
          .eq("content_hash", hash)
          .single();
        expect(cache.error).toBeNull();
        expect(cache.data?.object_key).toBe(ownerBObjectKey);
      } finally {
        if (releaseOwnerAUpload) releaseOwnerAUpload();
        await cleanupCache(admin, hash, [ownerAObjectKey, ownerBObjectKey]);
      }
    },
    30_000,
  );

  it(
    "generates one audio object for concurrent cold requests",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const admin = await createAdminClient();
      const fixture = await createFixture(
        admin,
        randomBytes(12).toString("hex"),
      );
      const text = `concurrent-tts-${randomBytes(12).toString("hex")}`;
      const hash = contentHash(text);

      try {
        const { getOrCreateTtsAudio } = await import("@/server/audio/tts-cache");
        const generate = vi.fn(async () => {
          await delay(100);
          return {
            ok: true as const,
            audio: new Blob([text], { type: "audio/mpeg" }),
            mimeType: "audio/mpeg" as const,
          };
        });
        const input = {
          studentId: fixture.studentId,
          assignmentStudentId: fixture.assignmentStudentId,
          characterId: "default-buddy",
          voice: "marin",
          text,
        };

        const results = await Promise.all([
          getOrCreateTtsAudio(input, { generateTtsAudio: generate }),
          getOrCreateTtsAudio(input, { generateTtsAudio: generate }),
        ]);

        expect(results.every((result) => result.ok)).toBe(true);
        expect(generate).toHaveBeenCalledTimes(1);
        expect(results.filter((result) => result.ok && result.cacheStatus === "miss")).toHaveLength(1);
        expect(results.filter((result) => result.ok && result.cacheStatus === "hit")).toHaveLength(1);
      } finally {
        await cleanupCache(admin, hash);
        await cleanupFixture(admin, fixture);
      }
    },
    30_000,
  );
});
