/**
 * Pure TTS domain contracts (VOICE-01, VOICE-03, D-05..D-11).
 *
 * Pure domain module — NO React, Supabase, OpenAI, route, or server-only
 * imports. Consumed by the server TTS adapter, the cache service, and the
 * student route to keep provider/voice/cache rules in one testable place.
 *
 * The default Coco voice is `marin`, the clarity-first OpenAI voice resolved in
 * 08-RESEARCH.md. Voice may only change through the bounded {@link TTS_VOICES}
 * enum or an explicit server/test override — never arbitrary client input.
 *
 * Line-kind rules (D-05..D-11) allow ONLY Coco-character content. Student
 * transcript / speech-recognition text can never become a TTS line: the
 * public request schema does not model those kinds, and
 * {@link isVoiceEligibleLineKind} rejects them.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

// ─── Provider / model / format constants (VOICE-01) ───

export const TTS_PROVIDER = "openai" as const;
export const TTS_MODEL = "gpt-4o-mini-tts" as const;
export const TTS_RESPONSE_FORMAT = "mp3" as const;

/**
 * Canonical cache-input schema version. Bump when the normalized cache-input
 * shape changes so that old and new hashes never collide (VOICE-03).
 */
export const TTS_CACHE_SCHEMA_VERSION = 1 as const;

// ─── Bounded voice enum (VOICE-01) ───

/**
 * Bounded set of allowed OpenAI voices. `marin` is the conservative,
 * clarity-first default for Coco. Additional voices are opt-in and only
 * selectable through server/test code — never arbitrary client input.
 */
export const TTS_VOICES = ["marin", "cedar"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

/**
 * Default Coco voice — the resolved `marin` OpenAI voice from 08-RESEARCH.md.
 */
export const DEFAULT_COCO_TTS_VOICE: TtsVoice = "marin";

export const ttsVoiceSchema = z.enum(TTS_VOICES);

// ─── Voice-eligible line kinds (D-05..D-11) ───

/**
 * The only line kinds Coco may voice. These are Coco-authored, app-owned lines
 * resolved from the assignment snapshot, the AI-produced improved sentence, or
 * bounded character-profile copy.
 *
 * - `mission_prompt`         D-06 — Coco asks the mission question.
 * - `improved_sentence`      D-07 — Coco reads the better target-form sentence.
 * - `coco_transition`        D-08 — "Good job! Ready for the next one?"
 * - `coco_feedback`          D-09 — bounded supportive feedback line.
 * - `completion_celebration` D-11 — mission-complete celebration line.
 * - `coco_dynamic_line`      Phase 11 CHAT-02 — Coco's dynamically-generated
 *   conversation-mode reply, resolved server-side from the moderated,
 *   already-persisted `attempt_turns.coco_line` for the given turnOrder
 *   (same "descriptor only, never client text" boundary as every other kind).
 *
 * Student transcript / original recognition text (D-10) is deliberately absent
 * and rejected by {@link isVoiceEligibleLineKind}.
 */
export const VOICE_ELIGIBLE_LINE_KINDS = [
  "mission_prompt",
  "improved_sentence",
  "coco_transition",
  "coco_feedback",
  "completion_celebration",
  "coco_dynamic_line",
] as const;

export type VoiceEligibleLineKind = (typeof VOICE_ELIGIBLE_LINE_KINDS)[number];

const VOICE_ELIGIBLE_LINE_KIND_SET: ReadonlySet<string> = new Set(
  VOICE_ELIGIBLE_LINE_KINDS,
);

/**
 * True only for Coco-authored, voice-eligible line kinds. Any student
 * transcript / speech-recognition kind (e.g. `student_transcript`,
 * `original_transcript`, `repeat_transcript`) returns false (D-10).
 */
export function isVoiceEligibleLineKind(
  lineKind: string,
): lineKind is VoiceEligibleLineKind {
  return VOICE_ELIGIBLE_LINE_KIND_SET.has(lineKind);
}

export const voiceEligibleLineKindSchema = z.enum(VOICE_ELIGIBLE_LINE_KINDS);

// ─── Request schema for the student TTS route body (VOICE-01, D-10) ───

/**
 * Zod schema for the fields a student browser may send to the TTS route.
 *
 * The client selects a *descriptor* (which visible Coco line to speak), never
 * arbitrary spoken text: the server resolves the actual line text from owned
 * assignment/profile state. There is deliberately no `text`, `transcript`,
 * `originalTranscript`, `repeatTranscript`, or `contentHash` field — a student
 * transcript line kind is impossible to construct through this schema (D-10),
 * and a forged content hash can never enter the lookup (T-08-03).
 */
export const ttsRequestSchema = z.object({
  lineKind: voiceEligibleLineKindSchema,
  turnOrder: z.coerce.number().int().positive().optional(),
  feedbackVariant: z.string().trim().min(1).max(64).optional(),
  characterId: z.string().trim().min(1).max(128).optional(),
});

export type TtsRequest = z.infer<typeof ttsRequestSchema>;

// ─── Canonical cache-input builder + hash helper (VOICE-03) ───

/**
 * Raw fields used to build a canonical cache input. `voice`/`provider`/`model`/
 * `responseFormat` are typically the bounded defaults but may be overridden by
 * server code so cache keys stay correct if the provider config evolves.
 */
export type TtsCacheHashInputParams = {
  text: string;
  characterId: string;
  voice: string;
  provider: string;
  model: string;
  responseFormat: string;
};

/**
 * The normalized, canonical object that fully determines a cached line. Same
 * text (whitespace-insensitive) + character + voice + provider + model + format
 * + schema version ⇒ identical cache input ⇒ identical hash ⇒ cache hit
 * (VOICE-03).
 */
export type TtsCacheHashInput = {
  schemaVersion: typeof TTS_CACHE_SCHEMA_VERSION;
  provider: string;
  model: string;
  voice: string;
  responseFormat: string;
  characterId: string;
  text: string;
};

/**
 * Collapse all runs of whitespace (spaces, tabs, newlines) to a single space
 * and trim the ends, so cosmetically different but semantically identical text
 * hashes to the same cache key.
 */
export function normalizeTtsText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Build the canonical cache input. Deterministic and order-independent — the
 * returned object always has the same keys so equivalent inputs are deep-equal.
 */
export function buildTtsCacheHashInput(
  params: TtsCacheHashInputParams,
): TtsCacheHashInput {
  return {
    schemaVersion: TTS_CACHE_SCHEMA_VERSION,
    provider: params.provider,
    model: params.model,
    voice: params.voice,
    responseFormat: params.responseFormat,
    characterId: params.characterId,
    text: normalizeTtsText(params.text),
  };
}

/**
 * Stable SHA-256 hex digest of the canonical cache input. Server-computed only:
 * the route/service never accepts a client-supplied hash as lookup truth
 * (T-08-03). Field order is fixed so the digest is deterministic.
 */
export function computeTtsContentHash(
  params: TtsCacheHashInputParams,
): string {
  const canonical = buildTtsCacheHashInput(params);
  const serialized = JSON.stringify([
    canonical.schemaVersion,
    canonical.provider,
    canonical.model,
    canonical.voice,
    canonical.responseFormat,
    canonical.characterId,
    canonical.text,
  ]);
  return createHash("sha256").update(serialized).digest("hex");
}
