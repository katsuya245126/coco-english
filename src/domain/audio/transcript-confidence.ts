/**
 * Confidence check for a transcript, used to reject transcriber hallucinations.
 *
 * Whisper-family models decode unintelligible audio into clean, plausible
 * English. A deliberate mumble produced "All right, guys"; a retry produced
 * "I am ready to start". Neither is a canned phrase, so the
 * `KNOWN_HALLUCINATIONS` list in `./no-speech-detection` cannot catch them, and
 * neither can anything downstream: the transcript reads as an ordinary answer,
 * so the evaluator accepts it and Coco replies about a detail the child never
 * said.
 *
 * A blocklist was measured and rejected — eight observed hallucinations, zero
 * repeats, two of them in Korean. There is no enumerable set. What every
 * hallucination did share was token-level uncertainty.
 *
 * ## Why the minimum, not the mean
 *
 * Measured 2026-07-24 across 18 runs (6 real recordings x 3):
 *
 *   worst-token logprob   genuine answers  -0.000 on all 9 runs
 *                         mumbles          -0.174 .. -4.362 on all 9 runs
 *
 * Average logprob does NOT separate them. One mumble averaged -0.041, better
 * than some genuine speech, and produced "I don't like to survive to 2005
 * slaughter." Its confident tokens buried the one uncertain token that gave it
 * away. A hallucination is a guess stitched between confident-sounding words,
 * so it is the single worst token that carries the signal.
 *
 * ## What this number is not
 *
 * The threshold rests on six clips, one adult speaker, one device, one quiet
 * room. No child voices, no classroom noise, and — the known gap — no
 * quiet-but-real answer recorded far from the microphone, which is the most
 * likely source of a false positive. The gap between the two classes is wide,
 * but treat the constant as provisional until the logged production
 * distribution says otherwise.
 */

/**
 * One provider token entry. `logprob` is optional because the OpenAI SDK
 * declares it so — entries without a usable number are skipped rather than
 * counted as confident.
 */
export type TranscriptLogprob = { logprob?: number };

export type TranscriptConfidence = {
  /** Logprob of the least confident single token in the transcript. */
  minLogprob: number;
  /** Tokens that carried a usable logprob. */
  tokenCount: number;
};

/**
 * Sits inside the measured gap between genuine speech (-0.000) and the
 * tightest mumble (-0.174). Chosen nearer the confident end so a genuine
 * answer with mild uncertainty still passes; a mumble has to clear the whole
 * gap to slip through.
 */
export const LOW_CONFIDENCE_LOGPROB_THRESHOLD = -0.1;

/**
 * Reduce provider logprobs to the worst single token.
 *
 * Returns null when the provider sent nothing usable. Absence of logprobs is
 * not evidence of a hallucination — some models and response shapes omit the
 * field — so the caller must treat null as "do not run this check" rather than
 * as a failure.
 */
export function summarizeTranscriptConfidence(
  logprobs: readonly TranscriptLogprob[] | null | undefined,
): TranscriptConfidence | null {
  if (!Array.isArray(logprobs) || logprobs.length === 0) return null;

  const values = logprobs
    .map((entry) => entry?.logprob)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;

  return { minLogprob: Math.min(...values), tokenCount: values.length };
}

/**
 * True when the transcript is too uncertain to treat as something the student
 * actually said.
 */
export function isLowConfidenceTranscript(
  confidence: TranscriptConfidence | null,
): boolean {
  if (!confidence) return false;
  return confidence.minLogprob < LOW_CONFIDENCE_LOGPROB_THRESHOLD;
}
