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
import { MAX_PRONUNCIATION_REFERENCE_CHARS } from "@/domain/pronunciation/scoring";

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
  confirmedByTeacherId: string | null;
  confirmedAt: string | null;
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

export type ConfirmPronunciationSampleInput = {
  teacherId: string;
  sampleId: string;
  teacherConfirmedText: string;
};

export type ConfirmPronunciationSampleResult =
  | { ok: true; sample: PronunciationSample }
  | {
      ok: false;
      error:
        | "not_found"
        | "unavailable"
        | "invalid_text"
        | "rate_limited"
        | "scoring_failed_retryable"
        | "failed";
      retryAfterSeconds?: number;
    };

export type ConfirmPronunciationSampleDeps = {
  client?: ServiceClient;
  scorePronunciation?: typeof scorePronunciation;
  consumeRequestBudget?: typeof consumeRequestBudget;
  now?: () => Date;
};

export type RemovePronunciationSampleInput = {
  teacherId: string;
  sampleId: string;
};

export type RemovePronunciationSampleResult =
  | { ok: true; studentId: string }
  | {
      ok: false;
      error:
        | "not_found"
        | "unavailable"
        | "storage_failed_retryable"
        | "failed";
    };

export type RemovePronunciationSampleDeps = {
  client?: ServiceClient;
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
  confirmed_by_teacher_id: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  deletion_started_at: z.string().nullable().optional(),
  audio_expires_at: z.string(),
  created_at: z.string(),
});

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function normalizeAudioMimeType(value: string) {
  const normalized = value.toLowerCase().split(";")[0]?.trim() ?? "";
  return normalized === "audio/x-m4a" ? "audio/mp4" : normalized;
}

function normalizedMimeType(input: PronunciationSampleUploadInput) {
  return normalizeAudioMimeType(input.mimeType ?? input.file.type);
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
  if (row.deletion_started_at) return null;
  const expiresAt = new Date(row.audio_expires_at);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return {
    id: row.id,
    studentId: row.student_id,
    status: row.status,
    automaticTranscript: row.automatic_transcript,
    teacherConfirmedText: row.teacher_confirmed_text,
    provisionalResult: parseScore(row.provisional_result),
    confirmedByTeacherId: row.confirmed_by_teacher_id,
    confirmedAt: row.confirmed_at,
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    mimeType: row.mime_type,
    audioExpiresAt: row.audio_expires_at,
    audioAvailable: Boolean(row.object_key) && expiresAt > now,
    createdAt: row.created_at,
  };
}

function isValidInput(input: PronunciationSampleUploadInput, mimeType: string) {
  const fileMimeType = normalizeAudioMimeType(input.file.type);
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
      confirmedByTeacherId: null,
      confirmedAt: null,
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
       confirmed_by_teacher_id, confirmed_at, deletion_started_at,
       audio_expires_at, created_at,
       students!inner(classes!inner(teacher_id))`,
    )
    .eq("student_id", input.studentId)
    .eq("students.classes.teacher_id", input.teacherId)
    .is("deletion_started_at", null)
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

type ConfirmationBegin = {
  outcome: "ok" | "unavailable" | "not_found";
  sample_id?: string | null;
  student_id?: string | null;
  object_key?: string | null;
  duration_ms?: number | null;
  byte_size?: number | null;
  mime_type?: string | null;
  automatic_transcript?: string | null;
  provisional_result?: unknown;
  audio_expires_at?: string | null;
  created_at?: string | null;
  confirmation_token?: string | null;
};

type DeletionBegin = {
  outcome: "ok" | "unavailable" | "not_found";
  sample_id?: string | null;
  student_id?: string | null;
  object_key?: string | null;
  deletion_token?: string | null;
};

function confirmationSample(
  begin: ConfirmationBegin,
  input: ConfirmPronunciationSampleInput,
  confirmedText: string,
  result: PronunciationScoreDetail,
  now: Date,
): PronunciationSample | null {
  if (
    typeof begin.sample_id !== "string" ||
    typeof begin.student_id !== "string" ||
    typeof begin.duration_ms !== "number" ||
    typeof begin.byte_size !== "number" ||
    typeof begin.mime_type !== "string" ||
    typeof begin.automatic_transcript !== "string" ||
    typeof begin.audio_expires_at !== "string" ||
    typeof begin.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: begin.sample_id,
    studentId: begin.student_id,
    status: "confirmed",
    automaticTranscript: begin.automatic_transcript,
    teacherConfirmedText: confirmedText,
    provisionalResult: result,
    confirmedByTeacherId: input.teacherId,
    confirmedAt: now.toISOString(),
    durationMs: begin.duration_ms,
    byteSize: begin.byte_size,
    mimeType: begin.mime_type,
    audioExpiresAt: begin.audio_expires_at,
    audioAvailable:
      Boolean(begin.object_key) && new Date(begin.audio_expires_at) > now,
    createdAt: begin.created_at,
  };
}

/**
 * Confirm one pending sample. The database claim prevents concurrent
 * confirmations from publishing stale provider output; only the completion
 * RPC changes trusted wording/result/status together.
 */
export async function confirmPronunciationSample(
  input: ConfirmPronunciationSampleInput,
  deps: ConfirmPronunciationSampleDeps = {},
): Promise<ConfirmPronunciationSampleResult> {
  if (
    typeof input.sampleId !== "string" ||
    typeof input.teacherId !== "string" ||
    !input.sampleId.trim() ||
    !input.teacherId.trim()
  ) {
    return { ok: false, error: "not_found" };
  }
  if (typeof input.teacherConfirmedText !== "string") {
    return { ok: false, error: "invalid_text" };
  }
  const confirmedText = normalizeEnglishTranscript(
    input.teacherConfirmedText,
  ).text;
  if (
    !confirmedText ||
    confirmedText.length > MAX_PRONUNCIATION_REFERENCE_CHARS ||
    !hasEnglishTranscript(confirmedText)
  ) {
    return { ok: false, error: "invalid_text" };
  }

  const supabase = deps.client ?? createSupabaseServiceClient();
  let preflight: ConfirmationBegin | null = null;
  try {
    const result = await supabase.rpc(
      "read_teacher_pronunciation_sample_confirmation",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: input.sampleId,
      },
    );
    preflight = result.error
      ? null
      : (result.data?.[0] as ConfirmationBegin | undefined) ?? null;
  } catch {
    preflight = null;
  }

  if (!preflight) return { ok: false, error: "failed" };
  if (preflight.outcome === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (preflight.outcome === "unavailable") {
    return { ok: false, error: "unavailable" };
  }
  if (
    preflight.outcome !== "ok" ||
    typeof preflight.sample_id !== "string" ||
    typeof preflight.student_id !== "string" ||
    typeof preflight.automatic_transcript !== "string" ||
    typeof preflight.audio_expires_at !== "string" ||
    typeof preflight.created_at !== "string" ||
    typeof preflight.duration_ms !== "number" ||
    typeof preflight.byte_size !== "number" ||
    typeof preflight.mime_type !== "string"
  ) {
    return { ok: false, error: "failed" };
  }

  const now = deps.now?.() ?? new Date();
  const unchanged =
    confirmedText === normalizeEnglishTranscript(preflight.automatic_transcript).text;

  // Ownership and immutable sample metadata were proved by the read-only
  // preflight above. Edited wording needs live audio, so reject an expired or
  // missing object before admitting paid provider work.
  if (
    !unchanged &&
    (!preflight.object_key ||
      Number.isNaN(new Date(preflight.audio_expires_at).getTime()) ||
      new Date(preflight.audio_expires_at).getTime() <= now.getTime())
  ) {
    return { ok: false, error: "unavailable" };
  }

  if (!unchanged) {
    try {
      const budget = await (
        deps.consumeRequestBudget ?? consumeRequestBudget
      )({ actorId: input.teacherId, operation: "teacher_provider" });
      if (!budget.allowed) {
        return {
          ok: false,
          error: "rate_limited",
          retryAfterSeconds: budget.retryAfterSeconds,
        };
      }
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  let begin: ConfirmationBegin | null = null;
  try {
    const result = await supabase.rpc(
      "begin_teacher_pronunciation_sample_confirmation",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: input.sampleId,
      },
    );
    begin = result.error ? null : (result.data?.[0] as ConfirmationBegin | undefined) ?? null;
  } catch {
    begin = null;
  }

  if (!begin) return { ok: false, error: "failed" };
  if (begin.outcome === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (begin.outcome === "unavailable") {
    return { ok: false, error: "unavailable" };
  }
  const confirmationToken =
    typeof begin.confirmation_token === "string"
      ? begin.confirmation_token
      : null;
  const cleanup = async () => {
    if (!confirmationToken) return false;
    try {
      const result = await supabase.rpc(
        "clear_teacher_pronunciation_sample_confirmation",
        {
          p_teacher_id: input.teacherId,
          p_sample_id: input.sampleId,
          p_confirmation_token: confirmationToken,
        },
      );
      return !result.error && result.data === "ok";
    } catch {
      return false;
    }
  };
  const cleanupOrFailed = async (
    error: "unavailable" | "scoring_failed_retryable",
  ): Promise<ConfirmPronunciationSampleResult> => {
    return (await cleanup())
      ? { ok: false, error }
      : { ok: false, error: "failed" };
  };

  if (
    begin.outcome !== "ok" ||
    typeof begin.sample_id !== "string" ||
    typeof begin.student_id !== "string" ||
    typeof begin.confirmation_token !== "string" ||
    typeof begin.automatic_transcript !== "string" ||
    !begin.audio_expires_at ||
    !begin.created_at ||
    typeof begin.duration_ms !== "number" ||
    typeof begin.byte_size !== "number" ||
    typeof begin.mime_type !== "string"
  ) {
    await cleanup();
    return { ok: false, error: "failed" };
  }

  const provisional = parseScore(begin.provisional_result);
  if (!provisional) {
    await cleanup();
    return { ok: false, error: "failed" };
  }

  let result = provisional;
  if (!unchanged) {
    if (
      !begin.object_key ||
      !begin.audio_expires_at ||
      Number.isNaN(new Date(begin.audio_expires_at).getTime()) ||
      new Date(begin.audio_expires_at).getTime() <= now.getTime()
    ) {
      return cleanupOrFailed("unavailable");
    }

    let file: Blob;
    try {
      const downloaded = await supabase.storage
        .from(getStudentAudioBucketId())
        .download(begin.object_key);
      if (downloaded.error || !downloaded.data) {
        return cleanupOrFailed("scoring_failed_retryable");
      }
      file = downloaded.data;
    } catch {
      return cleanupOrFailed("scoring_failed_retryable");
    }

    let scoring: PronunciationScoreResult;
    try {
      scoring = await (deps.scorePronunciation ?? scorePronunciation)({
        file,
        referenceText: confirmedText,
        durationMs: begin.duration_ms,
      });
    } catch {
      return cleanupOrFailed("scoring_failed_retryable");
    }
    if (!scoring || !scoring.ok || !scoring.score) {
      return cleanupOrFailed("scoring_failed_retryable");
    }
    result = { ...scoring.score, referenceText: confirmedText };
  }

  let completed: string | null = null;
  try {
    const completion = await supabase.rpc(
      "complete_teacher_pronunciation_sample_confirmation",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: input.sampleId,
        p_confirmation_token: confirmationToken,
        p_teacher_confirmed_text: confirmedText,
        p_confirmed_result: result satisfies Json,
      },
    );
    completed = completion.error ? null : completion.data;
  } catch {
    completed = null;
  }

  if (completed !== "ok") {
    const cleared = await cleanup();
    if (!cleared) return { ok: false, error: "failed" };
    return {
      ok: false,
      error: completed === "not_found" ? "not_found" : "failed",
    };
  }

  const sample = confirmationSample(begin, input, confirmedText, result, now);
  return sample ? { ok: true, sample } : { ok: false, error: "failed" };
}

/** Remove one owned sample, deleting its private object before its row. */
export async function removePronunciationSample(
  input: RemovePronunciationSampleInput,
  deps: RemovePronunciationSampleDeps = {},
): Promise<RemovePronunciationSampleResult> {
  if (
    typeof input.teacherId !== "string" ||
    typeof input.sampleId !== "string" ||
    !input.teacherId.trim() ||
    !input.sampleId.trim()
  ) {
    return { ok: false, error: "not_found" };
  }

  const supabase = deps.client ?? createSupabaseServiceClient();
  let begin: DeletionBegin | null = null;
  try {
    const result = await supabase.rpc(
      "begin_teacher_pronunciation_sample_deletion",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: input.sampleId,
      },
    );
    begin = result.error
      ? null
      : (result.data?.[0] as DeletionBegin | undefined) ?? null;
  } catch {
    begin = null;
  }

  if (!begin) return { ok: false, error: "failed" };
  if (begin.outcome === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (begin.outcome === "unavailable") {
    return { ok: false, error: "unavailable" };
  }
  if (
    begin.outcome !== "ok" ||
    typeof begin.sample_id !== "string" ||
    typeof begin.student_id !== "string" ||
    typeof begin.deletion_token !== "string"
  ) {
    return { ok: false, error: "failed" };
  }

  const sampleId = begin.sample_id;
  const deletionToken = begin.deletion_token;

  if (begin.object_key) {
    try {
      const removed = await supabase.storage
        .from(getStudentAudioBucketId())
        .remove([begin.object_key]);
      if (removed.error) {
        return { ok: false, error: "storage_failed_retryable" };
      }
    } catch {
      return { ok: false, error: "storage_failed_retryable" };
    }
  }

  let finalized: string | null = null;
  try {
    const result = await supabase.rpc(
      "finalize_teacher_pronunciation_sample_deletion",
      {
        p_teacher_id: input.teacherId,
        p_sample_id: sampleId,
        p_deletion_token: deletionToken,
      },
    );
    finalized = result.error ? null : result.data;
  } catch {
    finalized = null;
  }

  if (finalized !== "ok") {
    return {
      ok: false,
      error: finalized === "not_found" ? "not_found" : "failed",
    };
  }

  return { ok: true, studentId: begin.student_id };
}

type PlaybackBegin = {
  outcome: "ok" | "unavailable" | "not_found";
  object_key?: string | null;
};

/** Create a short-lived signed URL after an ownership-checked playback lease. */
export async function createSignedPronunciationSampleUrlForTeacher(input: {
  teacherId: string;
  sampleId: string;
  now?: Date;
}, deps: { client?: ServiceClient } = {}): Promise<{ signedUrl: string } | null> {
  const supabase = deps.client ?? createSupabaseServiceClient();
  const result = await supabase.rpc(
    "begin_teacher_pronunciation_sample_playback",
    {
      p_teacher_id: input.teacherId,
      p_sample_id: input.sampleId,
    },
  );
  if (result.error) {
    throw new Error(
      `Unable to begin pronunciation sample playback: ${result.error.message}`,
    );
  }
  const begin = (result.data?.[0] as PlaybackBegin | undefined) ?? null;

  if (
    !begin ||
    begin.outcome !== "ok" ||
    typeof begin.object_key !== "string" ||
    !begin.object_key
  ) {
    return null;
  }

  const signed = await supabase.storage
    .from(getStudentAudioBucketId())
    .createSignedUrl(begin.object_key, SIGNED_AUDIO_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(
      `Unable to create pronunciation sample URL: ${
        signed.error?.message ?? "missing signed URL"
      }`,
    );
  }
  return { signedUrl: signed.data.signedUrl };
}
