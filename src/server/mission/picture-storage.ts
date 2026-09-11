import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  missionPictureDescriptionSchema,
  type MissionPicture,
} from "@/domain/mission/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const MISSION_IMAGE_BUCKET = "mission-images";
export const MAX_MISSION_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MISSION_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const SIGNED_MISSION_IMAGE_URL_TTL_SECONDS = 300;

const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const IMAGE_FORMAT_BY_MIME_TYPE = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type MissionImageUploadInput = {
  teacherId: string;
  file: Blob;
  description: string;
  mimeType?: string;
};

export type MissionImageUploadResult =
  | {
      ok: true;
      picture: MissionPicture & { mimeType: string };
    }
  | {
      ok: false;
      error: "invalid_image" | "upload_failed";
    };

export type MissionImageUploadDeps = {
  client?: ServiceClient;
  createObjectKey?: (teacherId: string, mimeType: string) => string;
};

function normalizeMimeType(value: string | undefined): string {
  return value?.toLowerCase().split(";")[0]?.trim() ?? "";
}

function isSafeTeacherId(teacherId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(teacherId);
}

export function createMissionImageObjectKey(
  teacherId: string,
  mimeType: string,
): string {
  if (!isSafeTeacherId(teacherId)) {
    throw new Error("Invalid teacher identity.");
  }
  const extension = EXTENSION_BY_MIME_TYPE[mimeType as keyof typeof EXTENSION_BY_MIME_TYPE];
  if (!extension) {
    throw new Error("Invalid mission image type.");
  }
  return `teachers/${teacherId}/${randomUUID()}.${extension}`;
}

export function isMissionImageObjectKeyForTeacher(
  teacherId: string,
  objectKey: string,
): boolean {
  if (!isSafeTeacherId(teacherId)) return false;
  const escapedTeacherId = teacherId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^teachers/${escapedTeacherId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:jpg|png|webp)$`,
    "i",
  ).test(objectKey);
}

async function validInput(
  input: MissionImageUploadInput,
  mimeType: string,
): Promise<boolean> {
  const fileMimeType = normalizeMimeType(input.file.type);
  if (
    input.file.size <= 0 ||
    input.file.size > MAX_MISSION_IMAGE_BYTES ||
    !ALLOWED_MISSION_IMAGE_MIME_TYPES.has(mimeType) ||
    (fileMimeType !== "" && fileMimeType !== mimeType) ||
    !missionPictureDescriptionSchema.safeParse(input.description).success
  ) {
    return false;
  }

  try {
    const metadata = await sharp(
      Buffer.from(await input.file.arrayBuffer()),
      { failOn: "error" },
    ).metadata();
    return metadata.format === IMAGE_FORMAT_BY_MIME_TYPE[mimeType as keyof typeof IMAGE_FORMAT_BY_MIME_TYPE];
  } catch {
    return false;
  }
}

export async function uploadMissionImage(
  input: MissionImageUploadInput,
  deps: MissionImageUploadDeps = {},
): Promise<MissionImageUploadResult> {
  const mimeType = normalizeMimeType(input.mimeType ?? input.file.type);
  if (!isSafeTeacherId(input.teacherId) || !(await validInput(input, mimeType))) {
    return { ok: false, error: "invalid_image" };
  }

  const description = missionPictureDescriptionSchema.parse(input.description);
  const objectKey =
    deps.createObjectKey?.(input.teacherId, mimeType) ??
    createMissionImageObjectKey(input.teacherId, mimeType);
  const supabase = deps.client ?? createSupabaseServiceClient();

  try {
    const uploaded = await supabase.storage
      .from(MISSION_IMAGE_BUCKET)
      .upload(objectKey, input.file, {
        contentType: mimeType,
        upsert: false,
      });
    if (uploaded.error) {
      return { ok: false, error: "upload_failed" };
    }
  } catch {
    return { ok: false, error: "upload_failed" };
  }

  return {
    ok: true,
    picture: { objectKey, description, mimeType },
  };
}

export async function createMissionImageSignedUrl(input: {
  objectKey: string;
  teacherId: string;
}): Promise<string | null> {
  if (!isMissionImageObjectKeyForTeacher(input.teacherId, input.objectKey)) {
    return null;
  }
  const supabase = createSupabaseServiceClient();
  const signed = await supabase.storage
    .from(MISSION_IMAGE_BUCKET)
    .createSignedUrl(input.objectKey, SIGNED_MISSION_IMAGE_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}
