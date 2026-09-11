import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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

describe("mission picture storage integration", () => {
  it("keeps pictures private while service-authorized signed access works", async (context) => {
    if (!canRunLocally) {
      context.skip();
      return;
    }

    const admin = createClient<Database>(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
    );
    const email = `mission-picture-${randomUUID()}@example.test`;
    const password = "Test-Passw0rd!";
    const user = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(user.error).toBeNull();

    const objectKey = `teachers/${randomUUID()}/${randomUUID()}.png`;
    try {
      const bucket = await admin.storage.getBucket("mission-images");
      expect(bucket.error).toBeNull();
      expect(bucket.data?.public).toBe(false);

      const upload = await admin.storage
        .from("mission-images")
        .upload(objectKey, new Blob(["picture"], { type: "image/png" }), {
          contentType: "image/png",
          upsert: false,
        });
      expect(upload.error).toBeNull();

      const otherTeacher = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const signIn = await otherTeacher.auth.signInWithPassword({ email, password });
      expect(signIn.error).toBeNull();

      const directDownload = await otherTeacher.storage
        .from("mission-images")
        .download(objectKey);
      expect(directDownload.error).not.toBeNull();
      expect(directDownload.data).toBeNull();

      const signed = await admin.storage
        .from("mission-images")
        .createSignedUrl(objectKey, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toBeTruthy();
      const response = await fetch(signed.data!.signedUrl);
      expect(response.ok).toBe(true);
      expect(await response.text()).toBe("picture");
    } finally {
      await admin.storage.from("mission-images").remove([objectKey]);
      if (user.data.user) {
        await admin.auth.admin.deleteUser(user.data.user.id);
      }
    }
  });
});
