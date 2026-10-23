import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { TTS_PROVIDER } from "@/domain/audio/tts";
import { PRONUNCIATION_WORD_AUDIO } from "@/server/audio/pronunciation-word-audio";
import { TTS_AUDIO_BUCKET } from "@/server/audio/tts-cache";
import {
  purgeExpiredAudio,
  purgeExpiredTtsAudio,
} from "@/server/foundation/purgeExpiredAudio";

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

const DAY_MS = 24 * 60 * 60 * 1000;

type AdminClient = SupabaseClient<Database>;

async function createAdminClient(): Promise<AdminClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function seedCachedAudio(
  admin: AdminClient,
  input: { provider: string; characterId: string; ageDays: number },
): Promise<string> {
  const objectKey = `${input.provider}/test/${randomUUID()}.mp3`;
  const uploaded = await admin.storage
    .from(TTS_AUDIO_BUCKET)
    .upload(objectKey, new Blob(["voice"], { type: "audio/mpeg" }));
  expect(uploaded.error).toBeNull();

  const inserted = await admin.from("tts_audio_cache").insert({
    content_hash: randomBytes(32).toString("hex"),
    provider: input.provider,
    model: "test",
    voice: "test",
    response_format: "mp3",
    character_id: input.characterId,
    object_key: objectKey,
    mime_type: "audio/mpeg",
    byte_size: 5,
    created_at: new Date(Date.now() - input.ageDays * DAY_MS).toISOString(),
  });
  expect(inserted.error).toBeNull();
  return objectKey;
}

async function rowExists(admin: AdminClient, objectKey: string) {
  const row = await admin
    .from("tts_audio_cache")
    .select("id")
    .eq("object_key", objectKey)
    .maybeSingle();
  expect(row.error).toBeNull();
  return row.data !== null;
}

async function objectExists(admin: AdminClient, objectKey: string) {
  const signed = await admin.storage
    .from(TTS_AUDIO_BUCKET)
    .createSignedUrl(objectKey, 60);
  return !signed.error;
}

async function cleanup(admin: AdminClient, objectKeys: string[]) {
  await admin.storage.from(TTS_AUDIO_BUCKET).remove(objectKeys);
  await admin.from("tts_audio_cache").delete().in("object_key", objectKeys);
}

describe("TTS audio retention purge", () => {
  it("deletes Coco audio older than 30 days and keeps word audio and recent lines", async (context) => {
    if (!canRunLocally) return context.skip();
    const admin = await createAdminClient();
    const expiredCoco = await seedCachedAudio(admin, {
      provider: TTS_PROVIDER,
      characterId: "default-buddy",
      ageDays: 31,
    });
    const expiredWord = await seedCachedAudio(admin, {
      provider: PRONUNCIATION_WORD_AUDIO.provider,
      characterId: PRONUNCIATION_WORD_AUDIO.characterId,
      ageDays: 31,
    });
    const recentCoco = await seedCachedAudio(admin, {
      provider: TTS_PROVIDER,
      characterId: "default-buddy",
      ageDays: 1,
    });

    try {
      await purgeExpiredAudio();

      expect(await rowExists(admin, expiredCoco)).toBe(false);
      expect(await objectExists(admin, expiredCoco)).toBe(false);
      for (const kept of [expiredWord, recentCoco]) {
        expect(await rowExists(admin, kept)).toBe(true);
        expect(await objectExists(admin, kept)).toBe(true);
      }
    } finally {
      await cleanup(admin, [expiredCoco, expiredWord, recentCoco]);
    }
  });

  it("keeps expired rows for the next run when Storage removal fails", async (context) => {
    if (!canRunLocally) return context.skip();
    const admin = await createAdminClient();
    const expiredCoco = await seedCachedAudio(admin, {
      provider: TTS_PROVIDER,
      characterId: "default-buddy",
      ageDays: 31,
    });
    const failingStorage = new Proxy(admin, {
      get(target, property, receiver) {
        if (property !== "storage") return Reflect.get(target, property, receiver);
        return {
          from: () => ({
            remove: async () => ({ data: null, error: new Error("storage down") }),
          }),
        };
      },
    });

    try {
      await purgeExpiredTtsAudio(failingStorage);

      expect(await rowExists(admin, expiredCoco)).toBe(true);

      await purgeExpiredTtsAudio(admin);

      expect(await rowExists(admin, expiredCoco)).toBe(false);
      expect(await objectExists(admin, expiredCoco)).toBe(false);
    } finally {
      await cleanup(admin, [expiredCoco]);
    }
  });
});
