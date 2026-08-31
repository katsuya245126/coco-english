/**
 * Teacher-owned pronunciation sample upload and read seams.
 *
 * Sample rows are not mission audio. The service-role lifecycle RPCs prove the
 * teacher owns the selected student before allocating an object key or
 * publishing any transcript/score.
 */

import { z } from "zod";
import type { Database, Json } from "@/lib/db/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
} from "@/server/student-access/audio-upload";
import {
  readPcmWavDurationMs,
  transcodeToWav,
  type TranscodeResult,
} from "@/server/audio/audio-transcode";
import {
  hasEnglishTranscript,
  normalizeEnglishTranscript,
  transcribeAudioFile,
  type TranscriptionResult,
} from "@/server/audio/transcription";
import {
  scorePronunciation,
  type PronunciationScoreDetail,
  type PronunciationScoreResult,
} from "@/server/audio/pronunciation-scorer";
import { consumeRequestBudget } from "@/server/security/request-budget";
import { log } from "@/server/logging/logger";

export const MAX_PRONUNCIATION_SAMPLE_DURATION_MS = 30_000;
export const PRONUNCIATION_SAMPLE_DURATION_ERROR =
  "This recording is longer than 30 seconds. Trim it, then upload it again.";
const DEFAULT_AUDIO_BUCKET = "student-audio";
const SIGNED_AUDIO_URL_TTL_SECONDS = 300;

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type SampleStatus = Database["public"]["Enums"]["pronunciation_sample_status"];

export type PronunciationSample = {
  id: string;
  studentId: string;
  status: Exclude<SampleStatus, "processing">;
  automaticTranscript: string;
  teacherConfirmedText: string | null;
  provisionalResult: PronunciationScoreDetail | null;
  durationMs: number;
  byteSize: number;
  mimeType: string;
  audioExpiresAt: string;
  audioAvailable: boolean;
  createdAt: string;
};

export type PronunciationSampleUploadInput = {
  teacherId: string;
  studentId: string;
  file: Blob;
  mimeType?: string;
};

export type PronunciationSampleUploadResult =
  | { ok: true; sample: PronunciationSample }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "invalid_audio"
        | "duration_too_long"
        | "rate_limited"
        | "upload_failed_retryable"
        | "transcription_failed_retryable"
        | "scoring_failed_retryable"
        | "failed";
      message?: string;
      retryAfterSeconds?: number;
    };

export type PronunciationSampleDeps = {
  client?: ServiceClient;
  transcodeToWav?: (blob: Blob) => Promise<TranscodeResult>;
  transcribeAudioFile?: typeof transcribeAudioFile;
  scorePronunciation?: typeof scorePronunciation;
  consumeRequestBudget?: typeof consumeRequestBudget;
  now?: () => Date;
};

const scoreRowSchema = z.object({
  accuracyScore: z.number().finite().min(0).max(100),
  fluencyScore: z.number().finite().min(0).max(100).nullable(),
  completenessScore: z.number().finite().min(0).max(100).nullable(),
  pronunciationScore: z.number().finite().min(0).max(100),
  starBand: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  referenceText: z.string(),
  wordScores: z.array(z.unknown()),
});

const sampleRowSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  object_key: z.string().nullable(),
  mime_type: z.string(),
  duration_ms: z.number().int().nonnegative(),
  byte_size: z.number().int().positive(),
  status: z.enum(["pending", "confirmed"]),
  automatic_transcript: z.string(),
  teacher_confirmed_text: z.string().nullable(),
  provisional_result: z.unknown().nullable(),
  audio_expires_at: z.string(),
  created_at: z.string(),
});

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function normalizedMimeType(input: PronunciationSampleUploadInput) {
  const declared = (input.mimeType ?? input.file.type).toLowerCase();
  return declared.split(";")[0]?.trim() ?? "";
}

function parseScore(value: unknown): PronunciationScoreDetail | null {
  const parsed = scoreRowSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as PronunciationScoreDetail;
}

function mapSample(
  value: unknown,
  now: Date,
): PronunciationSample | null {
  const parsed = sampleRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  const expiresAt = new Date(row.audio_expires_at);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return {
    id: row.id,
    studentId: row.student_id,
    status: row.status,
    automaticTranscript: row.automatic_transcript,
    teacherConfirmedText: row.teacher_confirmed_text,
    provisionalResult: parseScore(row.provisional_result),
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    mimeType: row.mime_type,
    audioExpiresAt: row.audio_expires_at,
    audioAvailable: Boolean(row.object_key) && expiresAt > now,
    createdAt: row.created_at,
  };
}

function isValidInput(input: PronunciationSampleUploadInput, mimeType: string) {
  const fileMimeType = input.file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    input.file.size > 0 &&
    input.file.size <= MAX_AUDIO_BYTES &&
    !!mimeType &&
    ALLOWED_AUDIO_MIME_TYPES.has(mimeType) &&
    (!fileMimeType || fileMimeType === mimeType)
  );
}

async function clearProcessingSample(
  supabase: ServiceClient,
  teacherId: string,
  sampleId: string,
  objectKey: string,
) {
  try {
    const removed = await supabase.storage
      .from(getStudentAudioBucketId())
      .remove([objectKey]);
    if (removed.error) {
      log("warn", "teacher.pronunciation_sample_cleanup_failed", {
        sampleId,
        stage: "storage",
      });
    }
  } catch {
    log("warn", "teacher.pronunciation_sample_cleanup_failed", {
      sampleId,
      stage: "storage",
    });
  }

  try {
    const cleared = await supabase.rpc("clear_teacher_pronunciation_sample", {
      p_teacher_id: teacherId,
      p_sample_id: sampleId,
    });
    if (cleared.error || cleared.data !== "ok") {
      log("warn", "teacher.pronunciation_sample_cleanup_failed", {
        sampleId,
        stage: "database",
      });
    }
  } catch {
    log("warn", "teacher.pronunciation_sample_cleanup_failed", {
      sampleId,
      stage: "database",
    });
  }
}

/**
 * Upload one short teacher-added recording and leave it pending for later
 * confirmation. Duration comes from decoded server-side WAV bytes, not form
 * metadata supplied by the browser.
 */
export async function uploadPronunciationSample(
  input: PronunciationSampleUploadInput,
  deps: PronunciationSampleDeps = {},
): Promise<PronunciationSampleUploadResult> {
  const mimeType = normalizedMimeType(input);
  if (!isValidInput(input, mimeType)) {
    return { ok: false, error: "invalid_audio" };
  }

  let transcoded: TranscodeResult;
  try {
    transcoded = await (deps.transcodeToWav ?? transcodeToWav)(input.file);
  } catch {
    return { ok: false, error: "upload_failed_retryable" };
  }
  if (!transcoded.ok) {
    return { ok: false, error: "upload_failed_retryable" };
  }

  const actualDurationMs = readPcmWavDurationMs(transcoded.wav);
  if (actualDurationMs === null) {
    return { ok: false, error: "upload_failed_retryable" };
  }
  if (actualDurationMs > MAX_PRONUNCIATION_SAMPLE_DURATION_MS) {
    return {
      ok: false,
      error: "duration_too_long",
      message: PRONUNCIATION_SAMPLE_DURATION_ERROR,
    };
  }

  const supabase = deps.client ?? createSupabaseServiceClient();
  let begin;
  try {
    const result = await supabase.rpc("begin_teacher_pronunciation_sample", {
      p_teacher_id: input.teacherId,
      p_student_id: input.studentId,
      p_mime_type: mimeType,
      p_duration_ms: Math.ceil(actualDurationMs),
      p_byte_size: input.file.size,
    });
    begin = result.error ? null : result.data?.[0] ?? null;
  } catch {
    begin = null;
  }

  if (!begin) return { ok: false, error: "failed" };
  if (begin.outcome === "unauthorized") {
    return { ok: false, error: "unauthorized" };
  }
  if (begin.outcome === "invalid_input") {
    return { ok: false, error: "invalid_audio" };
  }
  if (
    begin.outcome !== "ok" ||
    typeof begin.sample_id !== "string" ||
    typeof begin.object_key !== "string"
  ) {
    return { ok: false, error: "failed" };
  }

  const sampleId = begin.sample_id;
  const objectKey = begin.object_key;
  const cleanup = () =>
    clearProcessingSample(supabase, input.teacherId, sampleId, objectKey);

  try {
    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: input.teacherId,
      operation: "teacher_provider",
    });
    if (!budget.allowed) {
      await cleanup();
      return {
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: budget.retryAfterSeconds,
      };
    }
  } catch {
    await cleanup();
    return { ok: false, error: "failed" };
  }

  try {
    const uploaded = await supabase.storage
      .from(getStudentAudioBucketId())
      .upload(objectKey, input.file, {
        contentType: mimeType,
        upsert: false,
      });
    if (uploaded.error) {
      await cleanup();
      return { ok: false, error: "upload_failed_retryable" };
    }
  } catch {
    await cleanup();
    return { ok: false, error: "upload_failed_retryable" };
  }

  let transcription: TranscriptionResult;
  try {
    transcription = await (deps.transcribeAudioFile ?? transcribeAudioFile)({
      file: input.file,
      mimeType,
    });
  } catch {
    await cleanup();
    return { ok: false, error: "transcription_failed_retryable" };
  }

  if (!transcription || !transcription.ok || typeof transcription.text !== "string") {
    await cleanup();
    return { ok: false, error: "transcription_failed_retryable" };
  }

  const normalized = normalizeEnglishTranscript(transcription.text);
  if (!normalized.text || !hasEnglishTranscript(normalized.text)) {
    await cleanup();
    return { ok: false, error: "transcription_failed_retryable" };
  }

  let scoring: PronunciationScoreResult;
  try {
    scoring = await (deps.scorePronunciation ?? scorePronunciation)({
      file: input.file,
      referenceText: normalized.text,
      durationMs: Math.ceil(actualDurationMs),
    });
  } catch {
    await cleanup();
    return { ok: false, error: "scoring_failed_retryable" };
  }

  if (!scoring || !scoring.ok || !scoring.score) {
    await cleanup();
    return { ok: false, error: "scoring_failed_retryable" };
  }

  let completed: string | null = null;
  try {
    const result = await supabase.rpc(
      "complete_teacher_pronunciation_sample",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: sampleId,
        p_automatic_transcript: normalized.text,
        p_transcription_model: transcription.model,
        p_transcription_confidence: transcription.confidence as Json,
        p_provisional_result: scoring.score satisfies Json,
      },
    );
    completed = result.error ? null : result.data;
  } catch {
    completed = null;
  }

  if (completed !== "ok") {
    await cleanup();
    return { ok: false, error: "failed" };
  }

  const now = deps.now?.() ?? new Date();
  const audioExpiresAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  return {
    ok: true,
    sample: {
      id: sampleId,
      studentId: input.studentId,
      status: "pending",
      automaticTranscript: normalized.text,
      teacherConfirmedText: null,
      provisionalResult: scoring.score,
      durationMs: Math.ceil(actualDurationMs),
      byteSize: input.file.size,
      mimeType,
      audioExpiresAt,
      audioAvailable: true,
      createdAt: now.toISOString(),
    },
  };
}

/** List pending/confirmed samples after proving student ownership in the query. */
export async function getPronunciationSamplesForTeacher(input: {
  teacherId: string;
  studentId: string;
  now?: Date;
}, deps: { client?: ServiceClient } = {}): Promise<PronunciationSample[]> {
  const supabase = deps.client ?? createSupabaseServiceClient();
  const result = await supabase
    .from("pronunciation_samples")
    .select(
      `id, student_id, object_key, mime_type, duration_ms, byte_size, status,
       automatic_transcript, teacher_confirmed_text, provisional_result,
       audio_expires_at, created_at,
       students!inner(classes!inner(teacher_id))`,
    )
    .eq("student_id", input.studentId)
    .eq("students.classes.teacher_id", input.teacherId)
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(
      `Unable to load pronunciation samples: ${result.error.message}`,
    );
  }

  const now = input.now ?? new Date();
  return (result.data ?? [])
    .map((row) => mapSample(row, now))
    .filter((row): row is PronunciationSample => row !== null);
}

/** Create a short-lived signed URL only after the sample/class ownership query. */
export async function createSignedPronunciationSampleUrlForTeacher(input: {
  teacherId: string;
  sampleId: string;
  now?: Date;
}, deps: { client?: ServiceClient } = {}): Promise<{ signedUrl: string } | null> {
  const supabase = deps.client ?? createSupabaseServiceClient();
  const result = await supabase
    .from("pronunciation_samples")
    .select(
      `id, object_key, status, audio_expires_at,
       students!inner(classes!inner(teacher_id))`,
    )
    .eq("id", input.sampleId)
    .eq("students.classes.teacher_id", input.teacherId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Unable to load pronunciation sample: ${result.error.message}`,
    );
  }
  const row = result.data as
    | {
        object_key?: string | null;
        status?: string;
        audio_expires_at?: string;
      }
    | null;
  const expiresAt = row?.audio_expires_at
    ? new Date(row.audio_expires_at)
    : null;
  if (
    !row?.object_key ||
    (row.status !== "pending" && row.status !== "confirmed") ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= (input.now ?? new Date())
  ) {
    return null;
  }

  const signed = await supabase.storage
    .from(getStudentAudioBucketId())
    .createSignedUrl(row.object_key, SIGNED_AUDIO_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(
      `Unable to create pronunciation sample URL: ${
        signed.error?.message ?? "missing signed URL"
      }`,
    );
  }
  return { signedUrl: signed.data.signedUrl };
}
