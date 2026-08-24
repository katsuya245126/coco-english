import type {
  AI_EVALUATION_VERSION,
  OriginalTurnDecision,
  OriginalTurnEvaluation,
  RepeatTurnDecision,
  RepeatTurnEvaluation,
} from "@/domain/ai/turn-evaluation";
import type { OriginalEvaluationViolation } from "@/domain/ai/original-evaluation-contract";
import type { HangulInterpretation } from "@/domain/audio/transcript-interpretation";
import type { MinimalEffortKind } from "@/domain/ai/minimal-effort-feedback";

/**
 * The one place that knows which shapes `attempt_turns.evaluation` holds
 * (issue #74), extending ADR-0002's interpret-by-use principle from mission
 * snapshots to stored evaluations.
 *
 * Rows written before the discriminant existed carry no `kind`; the parser
 * falls back to the historical field rule exactly once, here. Readers must
 * never re-implement discrimination: an unrecognized row stays unrecognized
 * instead of being guessed into either kind.
 */

export type StoredEvaluationProvenance = Pick<
  OriginalTurnEvaluation,
  | "policyVersion"
  | "evaluationModel"
  | "evaluationSource"
  | "transcriptionModel"
  | "transcriptionConfidence"
  | "runtimeVersion"
>;

export type StoredOriginalTurnEvaluation = StoredEvaluationProvenance & {
  kind: "original";
  version: typeof AI_EVALUATION_VERSION;
  outcome: OriginalTurnDecision["kind"];
  confidence: OriginalTurnEvaluation["confidence"];
  reviewReason: OriginalTurnEvaluation["reviewReason"];
  meaningUnderstood: OriginalTurnEvaluation["meaningUnderstood"];
  targetPatternAttempted: OriginalTurnEvaluation["targetPatternAttempted"];
  englishLanguage: OriginalTurnEvaluation["englishLanguage"];
  correctionNeeded: OriginalTurnEvaluation["correctionNeeded"];
  correctionSeverity: OriginalTurnEvaluation["correctionSeverity"] | null;
  correctionReason: OriginalTurnEvaluation["correctionReason"];
  improvedSentence: string | null;
  requireRepeat: boolean;
  retryReason?: "minimal_effort" | "incomplete_recording" | "unclear_meaning";
  minimalEffortBlocks?: number;
  minimalEffortKind?: MinimalEffortKind;
  retryExample?: string | null;
  ambiguityRetries?: number;
  /**
   * Free say-it-again retries granted because the transcript itself decoded
   * with low confidence (issue #64). Deliberately separate from
   * `ambiguityRetries`: audio problems must not consume the meaningful-
   * answer recovery budget nor escalate toward review on their own.
   */
  lowConfidenceAudioRetries?: number;
  ambiguityHistory?: Array<{
    transcript: string;
    audioClipId: string;
    evaluation: OriginalTurnEvaluation;
    question?: string;
    recoveryQuestion?: string;
  }>;
  contractViolations?: OriginalEvaluationViolation[];
  hangulInterpretations: HangulInterpretation[];
};

export type StoredRepeatTurnEvaluation = {
  kind: "repeat";
  version: typeof AI_EVALUATION_VERSION;
  outcome: RepeatTurnDecision["kind"];
  confidence: RepeatTurnEvaluation["confidence"];
  reviewReason: RepeatTurnEvaluation["reviewReason"];
  englishLanguage: RepeatTurnEvaluation["englishLanguage"];
  repeatCloseEnough: RepeatTurnEvaluation["repeatCloseEnough"];
  repeatAccepted: RepeatTurnDecision["repeatAccepted"];
  requireRepeat: boolean;
  originalEvaluation?: StoredOriginalTurnEvaluation;
  hangulInterpretations: HangulInterpretation[];
};

/** The shared review outcome literal, single-sourced beside the shapes. */
export const TEACHER_REVIEW_OUTCOME = "teacher_review" as const;

export type ParsedStoredEvaluation =
  | {
      ok: true;
      kind: "original";
      evaluation: StoredOriginalTurnEvaluation;
    }
  | { ok: true; kind: "repeat"; evaluation: StoredRepeatTurnEvaluation }
  | { ok: false; reason: "unrecognized" | "malformed" };

/**
 * Classify one persisted evaluation row. Fresh rows are trusted by their
 * writer-stamped `kind`; older rows fall through the historical sniff rule
 * (`correctionSeverity` only on originals, `repeatCloseEnough` only on
 * repeats). Anything else is reported, never guessed.
 *
 * Trust boundary: a stamped match is believed without field validation
 * because the answer-evaluation module is the only writer and its suites
 * pin the exact persisted shape; downstream surfaces that interpret
 * untrusted fields (Hangul spans, transcripts) still schema-validate at
 * their own boundary. Placeholder rows ("placeholder-v1") carry no kind on
 * purpose — they are not original or repeat evidence, so they report as
 * unrecognized.
 */
export function parseStoredEvaluation(value: unknown): ParsedStoredEvaluation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "malformed" };
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "original") {
    return { ok: true, kind: "original", evaluation: record as StoredOriginalTurnEvaluation };
  }
  if (record.kind === "repeat") {
    return { ok: true, kind: "repeat", evaluation: record as StoredRepeatTurnEvaluation };
  }
  if ("correctionSeverity" in record && !("repeatCloseEnough" in record)) {
    return { ok: true, kind: "original", evaluation: record as StoredOriginalTurnEvaluation };
  }
  if ("repeatCloseEnough" in record || "originalEvaluation" in record) {
    return { ok: true, kind: "repeat", evaluation: record as StoredRepeatTurnEvaluation };
  }
  return { ok: false, reason: "unrecognized" };
}

function readReviewReason(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const reviewReason = (value as Record<string, unknown>).reviewReason;
  return typeof reviewReason === "string" ? reviewReason : null;
}

/** The stored review reason, including from an unrecognized legacy row. */
export function storedReviewReasonOf(value: unknown): string | null {
  const parsed = parseStoredEvaluation(value);
  return readReviewReason(parsed.ok ? parsed.evaluation : value);
}

/**
 * Whether this turn routed to teacher review.
 *
 * Recognized rows: the outcome literal, or any string review reason (every
 * writer sets a non-null reviewReason only on review outcomes, so a lone
 * reason still means review). Unrecognized objects keep the pre-contract
 * evidence-reader rule — a string reviewReason flags review even when
 * nothing else about the row parses — so detection fails closed for exotic
 * legacy shapes instead of silently reading them as understood.
 */
export function isStoredTeacherReview(value: unknown): boolean {
  const parsed = parseStoredEvaluation(value);
  const reviewReason = readReviewReason(parsed.ok ? parsed.evaluation : value);
  if (!parsed.ok) {
    return reviewReason !== null;
  }
  return (
    parsed.evaluation.outcome === TEACHER_REVIEW_OUTCOME ||
    reviewReason !== null
  );
}

/**
 * Whether a prior turn's answer may ground later generation. Rows whose
 * evidence looks reviewed are withheld — including unrecognized objects
 * carrying only a review reason; every other unrecognized shape defaults to
 * understood so the '{}'::jsonb column default and pre-existing plain rows
 * keep behaving as they do today.
 */
export function storedTurnWasUnderstood(value: unknown): boolean {
  return !isStoredTeacherReview(value);
}

/** The original evaluation of a turn, or null for repeats/unrecognized/malformed. */
export function storedOriginalOf(
  value: unknown,
): StoredOriginalTurnEvaluation | null {
  const parsed = parseStoredEvaluation(value);
  return parsed.ok && parsed.kind === "original" ? parsed.evaluation : null;
}

/**
 * The record holding a turn's original-attempt metadata: one level down under
 * `originalEvaluation` once a repeat overwrote the top level, otherwise the
 * record itself. Null for unrecognized or malformed rows so readers fail safe.
 *
 * Deliberately loose return type: pre-discriminant rows are structurally
 * untrusted, so callers schema-validate whichever field they consume
 * (e.g. Hangul interpretations) rather than trusting this cast.
 */
export function originalMetadataOf(
  parsed: ParsedStoredEvaluation,
): Record<string, unknown> | null {
  if (!parsed.ok) return null;
  if (parsed.kind === "original") return parsed.evaluation;
  const nested = parsed.evaluation.originalEvaluation;
  return typeof nested === "object" &&
    nested !== null &&
    !Array.isArray(nested)
    ? nested
    : parsed.evaluation;
}

/** Convenience wrapper for callers holding the raw row value. */
export function storedOriginalMetadataOf(
  value: unknown,
): Record<string, unknown> | null {
  return originalMetadataOf(parseStoredEvaluation(value));
}

/**
 * The only evaluation shape a student is ever allowed to receive, projected
 * server-side from the stored record. Teacher evidence fields (raw Hangul
 * spans, full transcripts, provenance, nested originals) never cross the
 * network; these discriminated members are exactly what the mission-flow
 * shell consumes to pick a feedback card.
 */
export type StudentFacingEvaluation =
  | {
      kind: "original";
      outcome: OriginalTurnDecision["kind"];
      improvedSentence: string | null;
      retryReason?:
        | "minimal_effort"
        | "incomplete_recording"
        | "unclear_meaning";
      minimalEffortKind?: MinimalEffortKind;
      retryExample?: string | null;
    }
  | { kind: "repeat"; outcome: RepeatTurnDecision["kind"] };
