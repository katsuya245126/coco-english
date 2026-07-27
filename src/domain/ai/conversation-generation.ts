import { z } from "zod";
import {
  detectHangulSpans,
  findRomanizationArtifacts,
} from "@/domain/audio/hangul-romanization";

/**
 * Pure AI conversation-generation contracts (Coco Chat, Phase 11).
 *
 * Keep provider parsing and app decisions here; the server adapter
 * (src/server/ai/conversation-generator.ts) and UI copy live outside this
 * module. Mirrors the turn-evaluation.ts schema/parse-helper convention.
 */

export const HARD_TURN_CAP = 8 as const;

export const conversationSafetyModeSchema = z.enum(["standard", "retry"]);
export type ConversationSafetyMode = z.infer<
  typeof conversationSafetyModeSchema
>;

export const conversationResponseHandlingSchema = z.enum([
  "normal",
  "review_pending",
]);
export type ConversationResponseHandling = z.infer<
  typeof conversationResponseHandlingSchema
>;

export const conversationExchangeSchema = z.object({
  turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
  cocoLine: z.string().trim().min(1),
  studentResponse: z.string().trim().min(1),
});

export type ConversationExchange = z.infer<typeof conversationExchangeSchema>;

export const conversationHistorySchema = z
  .array(conversationExchangeSchema)
  .min(1)
  .max(HARD_TURN_CAP)
  .superRefine((history, context) => {
    history.forEach((exchange, index) => {
      if (exchange.turnOrder !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "turnOrder"],
          message: "conversation history must be contiguous and ordered",
        });
      }
    });
  });

export const conversationTurnInputSchema = z
  .object({
    scenePremise: z.string().trim().min(1),
    targetPattern: z.string().trim().min(1),
    turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
    requiredTurns: z.number().int().min(3).max(8),
    hardCap: z.literal(HARD_TURN_CAP),
    safetyMode: conversationSafetyModeSchema,
    responseHandling: conversationResponseHandlingSchema,
    conversationHistory: conversationHistorySchema,
  })
  .superRefine((input, context) => {
    if (input.conversationHistory.at(-1)?.turnOrder !== input.turnOrder) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationHistory"],
        message: "history must end at turnOrder",
      });
    }
  });

export type GenerateCocoReplyInput = z.infer<typeof conversationTurnInputSchema>;

export const generatedCocoReplyPartsSchema = z.object({
  reaction: z.string().trim().min(1).nullable(),
  focus: z.string().trim().min(1).nullable(),
  question: z.string().trim().min(1).nullable(),
});

export type GeneratedCocoReplyParts = z.infer<
  typeof generatedCocoReplyPartsSchema
>;

export type GeneratedCocoReply = GeneratedCocoReplyParts & {
  line: string;
};

export type ParseGeneratedCocoReplyResult =
  | { ok: true; reply: GeneratedCocoReply }
  | { ok: false; error: "schema_failed" };

export type GeneratedCocoReplyLineViolation =
  | "question_format"
  | "run_on_question"
  | "either_or_question"
  | "topic_drift"
  | "vague_echo"
  | "multi_detail_echo"
  | "response_summary"
  | "restatement_reaction"
  | "stacked_generic_reaction"
  | "closing_ungrounded"
  | "focus_mismatch"
  | "unresolved_korean_noun";

export type GeneratedCocoReplyLinePolicyResult =
  | { ok: true }
  | { ok: false; reasons: GeneratedCocoReplyLineViolation[] };

const QUESTION_STARTER_PATTERN =
  /\b(?:who|what|when|where|why|how|(?:do|does|did|can|could|would|will|are|is|have|has)\s+(?:you|your|he|she|they|we|it))\b/iu;

const TOPIC_STOP_WORDS = new Set([
  "who", "what", "when", "where", "why", "how", "do", "does", "did",
  "can", "could", "would", "will", "are", "is", "have", "has", "you",
  "your", "with", "to", "at", "in", "on", "for", "from", "about", "the",
  "a", "an", "and", "or", "often", "like", "want",
]);

function hasRunOnQuestion(line: string) {
  const match = line.match(QUESTION_STARTER_PATTERN);
  const index = match?.index ?? 0;
  if (!match || index === 0) return false;

  const prefix = line.slice(0, index).trimEnd();
  return !/[.!?]$/u.test(prefix);
}

function normalizedWords(text: string) {
  return text.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}']+/gu) ?? [];
}

const RESPONSE_STOP_WORDS = new Set([
  ...TOPIC_STOP_WORDS,
  "i", "me", "my", "mine", "we", "our", "ours", "they", "them",
  "their", "this", "that", "it", "myself", "will", "would", "be",
  "been", "being", "am", "was", "were", "very", "just", "also",
  "eat", "eating", "ate",
  "play", "playing", "played", "plays",
]);

function contentWords(text: string) {
  return normalizedWords(text).filter(
    (word) => !RESPONSE_STOP_WORDS.has(word),
  );
}

function contentStem(word: string) {
  const stem = word
    .replace(/(?:ing|ed|es|s)$/u, "")
    .replace(/(.)\1$/u, "$1");
  return stem.length >= 3 ? stem : word;
}

function relatedContentWord(left: string, right: string) {
  return left === right || contentStem(left) === contentStem(right);
}

function distinctContentWords(text: string) {
  return [...new Set(contentWords(text).map(contentStem))];
}

function questionCanReferBackWithoutContentWords(question: string | null) {
  const normalized = question?.trim() ?? "";
  return (
    /\b(?:it|that|this|they|them|there|together|instead|else)\b/iu.test(
      normalized,
    ) || /^(?:why|how)\s*\?$/iu.test(normalized)
  );
}

/**
 * Words a learner reaches for when they have nothing specific to say. Echoing
 * one back ("Talking about anything is fun!") treats a non-answer as a real
 * detail, which reads as Coco not listening.
 */
const VAGUE_RESPONSE_WORDS = new Set([
  "anything", "something", "everything", "nothing",
  "stuff", "things", "whatever", "anywhere", "somewhere",
]);

/**
 * True when Coco's reaction repeats a vague word the student just used.
 *
 * Only the reaction is examined — the text before the question. A vague word
 * inside the question itself is fine and often the recommended recovery
 * ("Do you talk about games or anything else?"), and Coco may freely introduce
 * such a word when the student did not use one. The violation is specifically
 * mirroring the learner's non-answer back as though it were information.
 */
function echoesVagueResponse(line: string, latestStudentResponse?: string) {
  if (!latestStudentResponse) return false;

  const studentVagueWords = normalizedWords(latestStudentResponse).filter(
    (word) => VAGUE_RESPONSE_WORDS.has(word),
  );
  if (studentVagueWords.length === 0) return false;

  const questionIndex = line.search(QUESTION_STARTER_PATTERN);
  const reaction = questionIndex > 0 ? line.slice(0, questionIndex) : line;

  const reactionWords = new Set(normalizedWords(reaction));
  return studentVagueWords.some((word) => reactionWords.has(word));
}

/**
 * Bare replies that answer the question without adding a detail to build on.
 *
 * Kept separate from VAGUE_RESPONSE_WORDS on purpose: that set also drives
 * echoesVagueResponse, where a reaction repeating the learner's word is a
 * violation. "Yes!" in a reaction is fine, so these words must not leak into
 * the vague-echo rule.
 */
const MINIMAL_RESPONSE_WORDS = new Set([
  "yes", "yeah", "yep", "yup", "no", "nope", "nah",
  "maybe", "okay", "ok", "sure", "hmm", "hm", "um", "uh", "dunno",
]);

/**
 * True when the learner's latest answer carries a real detail to build an open
 * question on.
 *
 * Not meaningful: a withheld/unusable transcript, a bare "I don't know", a
 * vague non-answer ("Anything."), a bare minimal reply ("Yes.", "Maybe."), or
 * anything with no content word left after stop-word removal. Those are exactly
 * the cases where a two-choice question is the right scaffold, so they keep
 * permitting either/or.
 *
 * A minimal word only disqualifies an answer when it is the *whole* answer:
 * "Yes, I play soccer." leads with "yes" but still hands Coco a detail.
 */
function latestResponseIsMeaningful(latestStudentResponse?: string) {
  const normalized = latestStudentResponse?.trim() ?? "";
  if (normalized.length === 0) return false;
  if (normalized === WITHHELD_STUDENT_RESPONSE) return false;

  const words = normalizedWords(normalized);
  if (words.length === 0) return false;

  // "I don't know." / "I'm not sure." carry no detail even though "know" and
  // "sure" survive stop-word filtering.
  if (/\b(?:don'?t|do not)\s+know\b/iu.test(normalized)) return false;
  if (/\bnot\s+sure\b/iu.test(normalized)) return false;

  // "Yes." / "Maybe." / "Hmm." answer the question but leave nothing to explore,
  // which is precisely when two concrete choices are the right scaffold.
  if (words.every((word) => MINIMAL_RESPONSE_WORDS.has(word))) return false;

  const details = contentWords(normalized).filter(
    (word) => !VAGUE_RESPONSE_WORDS.has(word) && !MINIMAL_RESPONSE_WORDS.has(word),
  );
  return details.length > 0;
}

/**
 * True when the question forces a choice between two offered options, or can
 * only be answered yes/no.
 *
 * "or" alone is not enough — "What do you see in the sea or under the water?"
 * is an open question. The signal is a closed opener (auxiliary + pronoun, with
 * no WH word in front of it), optionally combined with an "X or Y" choice.
 */
const CLOSED_QUESTION_OPENER =
  /^\s*(?:and\s+|so\s+|but\s+)?(?:do|does|did|can|could|would|will|are|is|was|were|have|has|should)\s+(?:you|your|he|she|they|we|it)\b/iu;

function isClosedQuestion(question: string | null) {
  const normalized = question?.trim() ?? "";
  if (normalized.length === 0) return false;

  // A WH word anywhere before the auxiliary makes it open ("Where do you ...?").
  if (/^\s*(?:who|what|when|where|why|how|which)\b/iu.test(normalized)) {
    return false;
  }

  return CLOSED_QUESTION_OPENER.test(normalized);
}

/**
 * True when Coco's reaction merely mirrors the learner's own sentence back in
 * the second person, adding no reaction of his own.
 *
 * Shape-based on purpose. Detail overlap cannot separate a mirror from a
 * genuine acknowledgement — "Playing games inside sounds fun." reuses every
 * noun the learner said and is exactly the line the prompt asks for. What marks
 * a mirror is a second-person declarative ("You like to play ...", "I
 * understand you are not going to ...") with no evaluative word carrying Coco's
 * own stance.
 */
const REACTION_STANCE_PATTERN =
  /\b(?:sounds?|sound|fun|great|nice|cool|good|delicious|tasty|exciting|awesome|wonderful|amazing|happy|glad|love|like\s+that|wow|yay|interesting|funny|excited|brave|clever)\b/iu;

const SECOND_PERSON_MIRROR_PATTERN =
  /(?:^|\.\s*|!\s*)(?:i\s+(?:understand|see|hear)\s+(?:that\s+)?)?you\s+(?:are|were|will|can|do|don'?t|usually|often|always|like|play|go|going|eat|want|have|swim)\b/iu;

function mirrorsResponseInSecondPerson(
  reaction: string | null,
  latestStudentResponse?: string,
) {
  const normalized = reaction?.trim() ?? "";
  if (normalized.length === 0) return false;
  if (!SECOND_PERSON_MIRROR_PATTERN.test(normalized)) return false;

  // Coco's own stance anywhere in the reaction redeems it: "You sound excited
  // about the beach!" is a reaction, not a recap.
  if (REACTION_STANCE_PATTERN.test(normalized)) return false;

  // Require that the mirror actually replays the learner's content, so an
  // unrelated second-person remark is not swept up.
  const responseDetails = distinctContentWords(latestStudentResponse ?? "");
  if (responseDetails.length === 0) return false;
  const reactionDetails = distinctContentWords(normalized);
  return responseDetails.some((responseWord) =>
    reactionDetails.some((reactionWord) =>
      relatedContentWord(responseWord, reactionWord),
    ),
  );
}

function latestQuestionText(text: string) {
  const questions = text.match(/[^.!?]*\?/gu);
  return questions?.at(-1) ?? text;
}

function relatedTopicWord(left: string, right: string) {
  if (left === right || left.startsWith(right) || right.startsWith(left)) {
    return true;
  }
  return left.length >= 4 && right.length >= 4 && left.slice(0, 3) === right.slice(0, 3);
}

function staysOnActiveTopic(
  line: string,
  activeQuestion?: string,
  latestStudentResponse?: string,
) {
  if (!activeQuestion) return true;
  const normalizedResponse = latestStudentResponse
    ?.toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'");
  if (
    normalizedResponse &&
    /\b(?:don't|do not|doesn't|does not|didn't|did not|not|never)\b/u.test(
      normalizedResponse,
    )
  ) {
    return true;
  }
  const questionTopicWords = normalizedWords(
    latestQuestionText(activeQuestion),
  ).filter((word) => word.length >= 3 && !TOPIC_STOP_WORDS.has(word));
  const responseTopicWords = latestStudentResponse
    ? normalizedWords(latestStudentResponse).filter(
        (word) => word.length >= 3 && !TOPIC_STOP_WORDS.has(word),
      )
    : [];
  const topicWords = [...questionTopicWords, ...responseTopicWords];
  if (topicWords.length === 0) return true;

  const lineWords = normalizedWords(line);
  return topicWords.some((topicWord) =>
    lineWords.some((lineWord) => relatedTopicWord(topicWord, lineWord)),
  );
}

function questionPartsFromLine(line: string, expectsQuestion: boolean) {
  if (!expectsQuestion) {
    return { reaction: line, focus: null, question: null };
  }

  const match = line.match(QUESTION_STARTER_PATTERN);
  if (!match || match.index === undefined) {
    return { reaction: line, focus: null, question: null };
  }

  return {
    reaction: line.slice(0, match.index).trim() || null,
    focus: null,
    question: line.slice(match.index).trim() || null,
  };
}

/** Deterministic format and grounding backstop for structured provider output. */
export function validateGeneratedCocoReplyParts(
  parts: GeneratedCocoReplyParts,
  options: {
    expectsQuestion: boolean;
    activeQuestion?: string;
    latestStudentResponse?: string;
    allowReactionTopicGrounding?: boolean;
    requireClosingGrounding?: boolean;
  },
): GeneratedCocoReplyLinePolicyResult {
  const line = assembleGeneratedCocoReply(parts).line;
  const normalized = line.trim();
  const reasons: GeneratedCocoReplyLineViolation[] = [];
  const questionMarks = normalized.match(/\?/gu)?.length ?? 0;

  if (
    options.expectsQuestion
      ? parts.question === null || questionMarks !== 1 || !normalized.endsWith("?")
      : parts.question !== null || parts.focus !== null || questionMarks !== 0 || !/[.!]$/u.test(normalized)
  ) {
    reasons.push("question_format");
  }

  if (options.expectsQuestion && hasRunOnQuestion(normalized)) {
    reasons.push("run_on_question");
  }

  if (
    options.expectsQuestion &&
    !staysOnActiveTopic(
      options.allowReactionTopicGrounding ||
        (contentWords(parts.question ?? "").length === 0 &&
          questionCanReferBackWithoutContentWords(parts.question))
        ? normalized
        : (parts.question ?? normalized),
      options.activeQuestion,
      options.latestStudentResponse,
    )
  ) {
    reasons.push("topic_drift");
  }

  if (
    options.expectsQuestion &&
    echoesVagueResponse(normalized, options.latestStudentResponse)
  ) {
    reasons.push("vague_echo");
  }

  /*
   * Either/or and yes/no follow-ups are a recovery move, not a default.
   *
   * Evidence (inspect-attempts 2026-07-27): six of twenty-five turns closed a
   * meaningful answer with a closed question, and three of those directly
   * produced the next degenerate answer — "Do you go swimming in the sea with
   * your family or friends?" -> "Yes, I do.", which then cost a teacher review.
   * After a real detail the follow-up must be an open WH question; when the
   * learner is vague, stuck, or was not understood, two concrete choices remain
   * the correct scaffold.
   */
  if (
    options.expectsQuestion &&
    isClosedQuestion(parts.question) &&
    latestResponseIsMeaningful(options.latestStudentResponse)
  ) {
    reasons.push("either_or_question");
  }

  if (
    mirrorsResponseInSecondPerson(parts.reaction, options.latestStudentResponse)
  ) {
    reasons.push("restatement_reaction");
  }

  if (options.expectsQuestion && parts.reaction) {
    const responseDetails = distinctContentWords(options.latestStudentResponse ?? "");
    const reactionDetails = distinctContentWords(parts.reaction);
    const echoedDetails = responseDetails.filter((responseWord) =>
      reactionDetails.some((reactionWord) =>
        relatedContentWord(responseWord, reactionWord),
      ),
    );

    // Only a genuine list-parrot counts. Two guards, both load-bearing:
    //
    // 1. A length floor matching the sibling response_summary check below. A
    //    two-detail answer ("I play games inside.") cannot be a list, so any
    //    specific acknowledgement of it echoed 100% of the details and was
    //    rejected outright — which contradicted the system prompt's own order to
    //    "acknowledge or react specifically to the latest studentResponse".
    // 2. The declared focus is excluded. The prompt tells Coco to pick one
    //    learner-owned detail and explore it, so echoing the focus is the
    //    requested behavior, not parroting.
    //
    // Regression: attempt 4c1f229e turn 4 discarded the on-topic reply
    // "Playing games inside sounds fun. / What games do you play inside?" and
    // served a canned line instead, after two paid calls.
    const focusDetails = distinctContentWords(parts.focus ?? "");
    const echoedBeyondFocus = echoedDetails.filter(
      (echoedWord) =>
        !focusDetails.some((focusWord) =>
          relatedContentWord(echoedWord, focusWord),
        ),
    );

    if (responseDetails.length >= 3 && echoedBeyondFocus.length >= 2) {
      reasons.push("multi_detail_echo");
    }
    if (
      responseDetails.length >= 3 &&
      echoedDetails.length / responseDetails.length >= 0.7
    ) {
      reasons.push("response_summary");
    }

    const genericAdjectives =
      "fun|good|great|nice|delicious|exciting|cool";
    if (
      new RegExp(
        `\\bsounds\\b[\\s\\S]*\\b(?:${genericAdjectives})\\b\\s+and\\s+\\b(?:${genericAdjectives})\\b`,
        "iu",
      ).test(parts.reaction)
    ) {
      reasons.push("stacked_generic_reaction");
    }
  }

  /*
   * Coco must not say a Korean noun he could not resolve.
   *
   * When the transcriber mishears a name, the only English form available is a
   * transliteration of the mishearing — "Baedalranteu" for 발로란트. Saying it
   * back tells the child that is how the word sounds in English, and it is not
   * a word at all (attempt 6406e6a5, 2026-07-27).
   *
   * Referring beats naming here: earlier turns already establish it is a game,
   * so "That sounds fun! What do you do in that game?" carries the same
   * meaning with nothing invented. A noun the evaluator genuinely recognized
   * comes back as real English and never matches, so naming it stays allowed.
   */
  const unresolvedKorean = findRomanizationArtifacts(
    line,
    detectHangulSpans(options.latestStudentResponse ?? ""),
  );
  if (unresolvedKorean.length > 0) {
    reasons.push("unresolved_korean_noun");
  }

  if (!options.expectsQuestion && options.requireClosingGrounding) {
    const responseDetails = distinctContentWords(
      options.latestStudentResponse ?? "",
    );
    const reactionDetails = distinctContentWords(parts.reaction ?? "");
    const grounded = responseDetails.some((responseWord) =>
      reactionDetails.some((reactionWord) =>
        relatedContentWord(responseWord, reactionWord),
      ),
    );
    if (responseDetails.length > 0 && !grounded) {
      reasons.push("closing_ungrounded");
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** Backward-compatible line validator for existing callers and stored tests. */
export function validateGeneratedCocoReplyLine(
  line: string,
  options: {
    expectsQuestion: boolean;
    activeQuestion?: string;
    latestStudentResponse?: string;
  },
): GeneratedCocoReplyLinePolicyResult {
  const result = validateGeneratedCocoReplyParts(
    questionPartsFromLine(line, options.expectsQuestion),
    { ...options, allowReactionTopicGrounding: true },
  );
  if (result.ok) return result;

  // Reasons that depend on the structured reaction/focus/question split are
  // dropped here, because this validator reconstructs those parts heuristically
  // from a flat line. either_or_question survives: it is derived from the
  // question text alone, which questionPartsFromLine recovers reliably.
  const legacyReasons = result.reasons.filter(
    (reason) =>
      reason !== "multi_detail_echo" &&
      reason !== "response_summary" &&
      reason !== "restatement_reaction" &&
      reason !== "stacked_generic_reaction" &&
      reason !== "focus_mismatch",
  );
  return legacyReasons.length === 0
    ? { ok: true }
    : { ok: false, reasons: legacyReasons };
}

/**
 * Validate a provider's structured-output payload against
 * generatedCocoReplyPartsSchema, mirroring the parseGeneratedMissionDraft
 * convention (schema_failed on any validation miss, including an empty
 * assembled line).
 */
export function parseGeneratedCocoReply(value: unknown): ParseGeneratedCocoReplyResult {
  const parsed = generatedCocoReplyPartsSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "schema_failed" };
  }
  const reply = assembleGeneratedCocoReply(parsed.data);
  return reply.line.length > 0
    ? { ok: true, reply }
    : { ok: false, error: "schema_failed" };
}

export function assembleGeneratedCocoReply(
  parts: GeneratedCocoReplyParts,
): GeneratedCocoReply {
  return {
    ...parts,
    line: [parts.reaction, parts.question].filter(Boolean).join(" ").trim(),
  };
}

/**
 * The exact sign-off every closing line ends with. The system message asks
 * for a goodbye, but a prompt cannot guarantee one — this suffix is applied
 * deterministically after generation so the last line a learner hears is
 * always the same friendly close.
 */
export const CLOSING_SIGN_OFF = "See you next time!";

/**
 * Strip any goodbye the model already wrote so the deterministic sign-off is
 * never doubled up ("See you next time! See you next time!").
 */
const MODEL_SIGN_OFF_PATTERN =
  /\s*see\s+you\s+(next\s+time|soon|later|again|tomorrow)\s*[.!?]*\s*$/i;

/**
 * Append CLOSING_SIGN_OFF to an assembled closing reply, replacing whatever
 * goodbye the model produced. Idempotent: applying it twice yields the same
 * line.
 */
export function withClosingSignOff(reply: GeneratedCocoReply): GeneratedCocoReply {
  const trimmedReaction = (reply.reaction ?? "").replace(MODEL_SIGN_OFF_PATTERN, "").trim();
  const body = (reply.line ?? "").replace(MODEL_SIGN_OFF_PATTERN, "").trim();
  return {
    ...reply,
    reaction: trimmedReaction.length > 0 ? trimmedReaction : null,
    line: body.length > 0 ? `${body} ${CLOSING_SIGN_OFF}` : CLOSING_SIGN_OFF,
  };
}

export type ConversationReplyMode = "follow_up" | "closing";

/**
 * The mission snapshot's requiredTurns owns conversational ending
 * semantics; HARD_TURN_CAP remains only the absolute safety ceiling
 * (see docs/superpowers/specs/2026-07-23-final-coco-closing-design.md).
 */
export function conversationReplyMode(input: {
  turnOrder: number;
  requiredTurns: number;
}): ConversationReplyMode {
  return input.turnOrder >= input.requiredTurns ? "closing" : "follow_up";
}

/**
 * Placeholder substituted for a latest response the evaluator could not
 * understand. Kept human-readable rather than empty because the schema
 * requires a non-empty studentResponse and history must stay contiguous —
 * the turn happened, only its content is unusable.
 */
export const WITHHELD_STUDENT_RESPONSE = "(not understood)" as const;

/**
 * Replace the latest studentResponse with a marker when the evaluator
 * flagged the turn for review.
 *
 * A garbled decode ("playing soccer on the weekend" from an unintelligible
 * clip) reads as a perfectly clean sentence, so passing it with an
 * instruction to "use it only when the meaning is clear" asks the model to
 * re-decide something the evaluator already ruled unusable — with strictly
 * less information than the evaluator had. Coco then states the invented
 * detail back as fact.
 *
 * Withholding the text removes the material to invent from. Only the latest
 * turn is affected: earlier responses were evaluated on their own terms and
 * stay available as grounding.
 */
function withheldUnusableLatestResponse(
  history: ConversationExchange[],
  responseHandling: ConversationResponseHandling,
): ConversationExchange[] {
  if (responseHandling !== "review_pending" || history.length === 0) {
    return history;
  }

  return history.map((exchange, index) =>
    index === history.length - 1
      ? { ...exchange, studentResponse: WITHHELD_STUDENT_RESPONSE }
      : exchange,
  );
}

/**
 * Rebuild the full grounding payload fresh for every generation call
 * (CHAT-04 architectural guardrail — no chat-history blob, no
 * previous_response_id). Pure function, directly unit-testable.
 */
export function buildConversationPrompt(input: GenerateCocoReplyInput) {
  const replyMode = conversationReplyMode(input);
  const turnsRemaining = Math.max(0, input.requiredTurns - input.turnOrder);
  const windDown = replyMode === "follow_up" && turnsRemaining <= 1;
  const reviewPendingInstructions: string[] =
    input.responseHandling === "review_pending"
      ? [
          "The latest studentResponse could not be understood and has been withheld; you are not being shown it. Do not invent, guess, or reconstruct any detail about what the student just said.",
          "Continue from the most recent earlier studentResponse with understandable meaning.",
          "If no studentResponse is usable, ask one short neutral question grounded in scenePremise.",
        ]
      : [];

  const conversationHistory = withheldUnusableLatestResponse(
    input.conversationHistory,
    input.responseHandling,
  );

  return {
    scenePremise: input.scenePremise,
    targetPattern: input.targetPattern,
    turnOrder: input.turnOrder,
    requiredTurns: input.requiredTurns,
    hardCap: HARD_TURN_CAP,
    replyMode,
    turnsRemaining,
    windDown,
    safetyMode: input.safetyMode,
    responseHandling: input.responseHandling,
    conversationHistory,
    instructions: [
      "Speak to a young ESL learner: short, simple sentences with easy everyday words.",
      "Return reaction, focus, and question separately.",
      "A follow-up may react briefly or mention one learner-owned detail, but must not summarize a list.",
      "Choose at most one focus from the latest studentResponse and make the question explore it.",
      replyMode === "closing"
        ? "Acknowledge the latest studentResponse specifically. Write one short complete sentence with no question and no goodbye; the sign-off 'See you next time!' is appended automatically after your line."
        : "Acknowledge the latest studentResponse, then ask exactly one relevant question for new information.",
      replyMode === "closing"
        ? "A closing uses reaction only; set focus and question to null."
        : "A follow-up must include one question and may include one learner-owned focus.",
      "Write complete, correctly punctuated sentences. Put sentence-ending punctuation between a reaction and the follow-up question; never join them as a run-on.",
      "Treat every detail in conversationHistory as already known.",
      // Unconditional on purpose. A withheld answer from an earlier turn stays
      // withheld in history, but reviewPendingInstructions is empty whenever
      // responseHandling is "normal" — including the closing turn, which is
      // where the unexplained marker produced a fabricated recap.
      `A studentResponse of "${WITHHELD_STUDENT_RESPONSE}" was not understood. Never guess, reconstruct, reference, or summarize it, and never treat it as a detail the student told you.`,
      ...reviewPendingInstructions,
      "Before the closing turn, acknowledge the latest studentResponse, then ask exactly one question for new information whose answer is not present or directly implied anywhere in conversationHistory.",
      "Before the closing turn, after a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
      "Before the closing turn, treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
      "After a meaningful answer, ask an open WH question. Do not ask a yes/no or either/or question; those are for when the learner is vague, stuck, or was not understood.",
      "Ask the simplest question that gets one new detail. Prefer 'Where do you play Valorant?' over 'Do you and your friend play Valorant at each other's homes or online?'.",
      "Keep the question concrete; avoid abstract or hypothetical questions such as 'What do you like about that?'.",
      "React to the student's answer; never restate it back to them in the second person.",
      "Do not repeat a detail in the question that the reaction already stated, and do not write 'your' in front of something the student would call 'my'.",
      "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
      "Before the closing turn, acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
      "Do not shame the learner or demand a more specific answer.",
      "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
      "If the current subject has no natural unanswered detail, transition gently to a nearby part of the scene.",
      "Keep the active activity from Coco's latest question as the topic; a person or place in the student's answer is a detail about that activity, not permission to switch activities.",
      "Example: after 'Who do you swim with?' -> 'With my friend.', ask 'What do you like about swimming together?'; 'What games do you play together?' is invalid because it drops the active activity, swimming.",
      "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
      "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
      "If windDown is true, begin gently wrapping up the scene toward a natural close.",
      "If the latest studentResponse contains a Korean word you cannot confidently translate, never spell it out in Latin letters. Refer to it by what the conversation shows it is ('that game', 'it', 'that place') instead of naming it.",
      "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
    ],
  };
}
