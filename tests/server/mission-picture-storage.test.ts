import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function createMockSupabase(options: { uploadError?: Error | null } = {}) {
  const upload = vi.fn(async () => ({ error: options.uploadError ?? null }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://signed.example/mission-images/object.jpg" },
    error: null,
  }));

  return {
    storage: {
      from: vi.fn(() => ({ upload, createSignedUrl })),
    },
    upload,
    createSignedUrl,
  };
}

async function actualImageBytes(
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 240, g: 120, b: 40 },
    },
  });
  if (mimeType === "image/jpeg") return image.jpeg().toBuffer();
  if (mimeType === "image/png") return image.png().toBuffer();
  return image.webp().toBuffer();
}

function imageBlob(bytes: Buffer, type = ""): Blob {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([arrayBuffer], { type });
}

describe("mission picture upload boundary", () => {
  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  it("refuses to sign a foreign image pointer even when a teacher stores it in their own mission", async () => {
    const { createMissionImageSignedUrl } = await import("@/server/mission/picture-storage");
    const objectKey = "teachers/teacher-b/11111111-1111-4111-8111-111111111111.png";
    expect(await createMissionImageSignedUrl({ teacherId: "teacher-a", objectKey })).toBeNull();
    expect(mockSupabase.createSignedUrl).not.toHaveBeenCalled();
    expect(await createMissionImageSignedUrl({ teacherId: "teacher-b", objectKey })).toBeTruthy();
    expect(mockSupabase.createSignedUrl).toHaveBeenCalledWith(objectKey, 300);
  });

  it("validates supported images, trims the description, and generates a teacher key", async () => {
    const { uploadMissionImage } = await import(
      "@/server/mission/picture-storage"
    );
    const bytes = await actualImageBytes("image/jpeg");
    const result = await uploadMissionImage({
      teacherId: "teacher-1",
      file: imageBlob(bytes, "image/jpeg"),
      description: "  A child choosing an apple.  ",
    });

    expect(result).toEqual({
      ok: true,
      picture: {
        objectKey: expect.stringMatching(
          /^teachers\/teacher-1\/[0-9a-f-]+\.jpg$/,
        ),
        description: "A child choosing an apple.",
        mimeType: "image/jpeg",
      },
    });
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("mission-images");
    expect(mockSupabase.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^teachers\/teacher-1\/[0-9a-f-]+\.jpg$/),
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: false },
    );
  });

  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts actual %s image bytes",
    async (mimeType) => {
      const { uploadMissionImage } = await import(
        "@/server/mission/picture-storage"
      );
      const bytes = await actualImageBytes(mimeType);

      await expect(
        uploadMissionImage({
          teacherId: "teacher-1",
          file: imageBlob(bytes, mimeType),
          description: "A small orange square.",
        }),
      ).resolves.toMatchObject({
        ok: true,
        picture: { mimeType },
      });
    },
  );

  it("rejects text mislabeled as an image and image bytes with a mismatched MIME", async () => {
    const { uploadMissionImage } = await import(
      "@/server/mission/picture-storage"
    );

    await expect(
      uploadMissionImage({
        teacherId: "teacher-1",
        file: new Blob(["not an image"], { type: "image/jpeg" }),
        description: "A picture.",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_image" });

    const pngBytes = await actualImageBytes("image/png");
    await expect(
      uploadMissionImage({
        teacherId: "teacher-1",
        file: imageBlob(pngBytes),
        mimeType: "image/jpeg",
        description: "A picture.",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_image" });

    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["image/gif", 1, "invalid_image"],
    ["image/png", 5 * 1024 * 1024 + 1, "invalid_image"],
  ])("rejects unsupported or oversized image input", async (mimeType, size, error) => {
    const { uploadMissionImage } = await import(
      "@/server/mission/picture-storage"
    );
    const result = await uploadMissionImage({
      teacherId: "teacher-1",
      file: new Blob([new Uint8Array(size)], { type: mimeType }),
      description: "An image.",
    });

    expect(result).toEqual({ ok: false, error });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("requires a non-empty bounded accessibility description", async () => {
    const { uploadMissionImage } = await import(
      "@/server/mission/picture-storage"
    );
    const file = new Blob(["image"], { type: "image/png" });

    await expect(
      uploadMissionImage({ teacherId: "teacher-1", file, description: "  " }),
    ).resolves.toEqual({ ok: false, error: "invalid_image" });
    await expect(
      uploadMissionImage({
        teacherId: "teacher-1",
        file,
        description: "x".repeat(301),
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_image" });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("uses no public URL and reports storage failure", async () => {
    mockSupabase = createMockSupabase({ uploadError: new Error("storage down") });
    const { uploadMissionImage } = await import(
      "@/server/mission/picture-storage"
    );
    const bytes = await actualImageBytes("image/webp");

    await expect(
      uploadMissionImage({
        teacherId: "teacher-1",
        file: imageBlob(bytes, "image/webp"),
        description: "An image.",
      }),
    ).resolves.toEqual({ ok: false, error: "upload_failed" });
    expect(mockSupabase.createSignedUrl).not.toHaveBeenCalled();
  });
});
